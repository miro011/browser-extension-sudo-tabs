/*****************************************************************/
                            // NOTES
/*****************************************************************/

// Each tool's data (settings) is loaded when background first starts. 
    // When settings are changed from the popup, loadData for the given tool is ran again from sbo_applySettingsChange
// In addition, loadData functions have the defaults in case a saved value is not found (h_loadSingleDataEntry)
    // That's because the first time this extension is added (or reset), popup wouldn't have been opened yet, and nothing will be saved

/*****************************************************************/
                            // GLOBALS
/*****************************************************************/

var WTL = {}, WTL_IS_ON = false;
var TS = {}, TS_IS_ON = false;
var AS = {}, AS_IS_ON = false;
var TR_TABS = {}; // {tabid:{interval:200ms,tPointer:12}, ...}

/*****************************************************************/
                            // START
/*****************************************************************/

run();
async function run()
{
    await Promise.all([wtl_loadData(), ts_loadData(), as_loadData()]);
    wtl_init(); ts_init(); as_init();
}

/*****************************************************************/
                     // SET BACKGROUND OPTIONS
/*****************************************************************/

async function sbo_applySettingsChange(idOfToolSettingsWrapper)
{
    switch(idOfToolSettingsWrapper)
    {
        case "waitToLoadSettingsMenu": await wtl_loadData(); break;
        case "tabSuspenderSettingsMenu": await ts_loadData(); if(TS_IS_ON) await ts_addTimeoutsToAllTabs(); break;
        case "autoSortSettingsMenu": await as_loadData(); if(AS_IS_ON) await as_sortAllTabs(); break;
    }
}

/*****************************************************************/
                        // WAIT TO LOAD
/*****************************************************************/

async function wtl_init(wtlSwitchKey="wtlSwitch")
{
    WTL["wtlSwitchKey"] = wtlSwitchKey; // this is used when verifying whether to suspend the tab (open links switch doesn't follow incl/excl)
    let requiredState = await api_getValueFromMem(wtlSwitchKey) || "off";

    if (requiredState == "on" && !WTL_IS_ON)
    {
        WTL_IS_ON = true;
        chrome.tabs.onCreated.addListener(wtl_onCreatedHandler);
    }
    else if (requiredState == "off" && WTL_IS_ON)
    {
        WTL_IS_ON = false;
        chrome.tabs.onCreated.removeListener(wtl_onCreatedHandler);
    }
}

async function wtl_loadData()
{
    [WTL["inclOrExcl"], WTL["links"]] = await Promise.all([
        h_loadSingleDataEntry("wtlInclExcl", "exclude"),
        h_loadSingleDataEntry("wtlLinksTa", "")
    ]);
}

async function wtl_onCreatedHandler(tab)
{
    if(wtl_skipThisTab(tab)) return;
    let newTabUrl = api_getExtFileHref("wait_to_load.html") + "#" + gh_getTabUrl(tab);
    api_updateTab(tab.id, {url:newTabUrl});
}

function wtl_skipThisTab(tab)
{
    let url = gh_getTabUrl(tab);
    return (TR_TABS[tab.id]) || 
        (tab.active == true) || 
        (!gh_urlIsValid(url, "http")) ||
        (WTL["wtlSwitchKey"] == "wtlSwitch" &&
        ((WTL["inclOrExcl"] == "include" && !WTL["links"].includes(gh_getUrlHost(url))) || 
        (WTL["inclOrExcl"] == "exclude" && WTL["links"].includes(gh_getUrlHost(url)))));
}

/*****************************************************************/
                        // SUSPEND INACTIVE TABS
/*****************************************************************/

async function ts_init()
{
    TS["tPointers"] = {}; // here, so that settings change doesn't affect it
    let requiredState = await api_getValueFromMem("tsSwitch") || "off";
    
    if (requiredState == "on" && !TS_IS_ON)
    {
        TS_IS_ON = true;
        await ts_addTimeoutsToAllTabs();
        chrome.tabs.onCreated.addListener(ts_onCreatedHandler);
        chrome.tabs.onActivated.addListener(ts_onActivatedHandler);
    }
    
    else if (requiredState == "off" && TS_IS_ON)
    {
        TS_IS_ON = false;
        chrome.tabs.onCreated.removeListener(ts_onCreatedHandler);
        chrome.tabs.onActivated.removeListener(ts_onActivatedHandler);
        for (let tabId in TS["tPointers"]) ts_rmTimeoutFromTab(tabId);
        TS["lastTabId"] = null;
    }
}

async function ts_loadData()
{
    [TS["exclPinned"], TS["exclAudible"], TS["curTimeoutDur"], TS["inclOrExcl"], TS["links"]] = await Promise.all([
        h_loadSingleDataEntry("tsExclPinned", "off"),
        h_loadSingleDataEntry("tsExclAudible", "on"),
        h_loadSingleDataEntry("tsTimeoutNumInput", 30),
        h_loadSingleDataEntry("tsInclExcl", "exclude"),
        h_loadSingleDataEntry("tsLinksTa", "")
    ]);
}

async function ts_addTimeoutsToAllTabs()
{
    let [allTabs, curTab] = await Promise.all([api_getTabs("all"), api_getTabs("current")]);
    curTab = curTab[0];
    if (!curTab) return; // when inspecting in chrome, it opens another tab (window) that can't be retrieved

    for (let tab of allTabs)
    {
        if (tab.id == curTab.id) continue;
        // when settings change, with tabs that already have timeouts, only reset them if the timeout duration was changed
        if (TS["tPointers"][tab.id])
        {
            if (TS["tPointers"][tab.id]["timeoutDurWhenAdded"] != TS["curTimeoutDur"]) ts_rmTimeoutFromTab(tab.id);
            else continue;
        }
        ts_addTimeoutToTab(tab);
    }

    if (!TS["lastTabId"]) TS["lastTabId"] = curTab.id; // when starting
}

function ts_addTimeoutToTab(tab)
{
    TS["tPointers"][tab.id] = {};
    TS["tPointers"][tab.id]["pointer"] = setTimeout(()=>{ts_suspend(tab.id)}, TS["curTimeoutDur"]);
    TS["tPointers"][tab.id]["timeoutDurWhenAdded"] = TS["curTimeoutDur"];
}

function ts_rmTimeoutFromTab(tabId)
{
    try
    {
        clearTimeout(TS["tPointers"][tabId]["pointer"]);
        delete TS["tPointers"][tabId];
    }
    catch(err) {}
}

// add timeout only if it isn't active
function ts_onCreatedHandler(tab)
{
    if (!tab.active) ts_addTimeoutToTab(tab);
}

// remove timeout from newly activated tab and add one to preivous active tab
async function ts_onActivatedHandler(activatedInfo)
{
    let prevActiveTab = await api_getTabFromId(TS["lastTabId"]);
    if (prevActiveTab) ts_addTimeoutToTab(prevActiveTab);
    ts_rmTimeoutFromTab(activatedInfo.tabId);
    TS["lastTabId"] = activatedInfo.tabId;
}

async function ts_suspend(tabId)
{
    delete TS["tPointers"][tabId]; // delete the timeout index as it's still there
    let tab = await api_getTabFromId(tabId);
    if (ts_skipThisTab(tab)) return;
    api_discardTabFromMem(tabId);
}

function ts_skipThisTab(tab)
{
    if (!tab) return true; // tab was closed before the timeout ended
    return (TR_TABS[tab.id]) ||
        (!tab.url) ||
        (!gh_urlIsValid(tab.url, "http")) ||
        (TS["exclPinned"] == "on" && tab.pinned) || 
        (TS["exclAudible"] == "on" && tab.audible) ||
        (TS["inclOrExcl"] == "include" && !TS["links"].includes(gh_getUrlHost(tab.url))) || 
        (TS["inclOrExcl"] == "exclude" && TS["links"].includes(gh_getUrlHost(tab.url)));
}

/*****************************************************************/
                        // AUTO TAB SORTER
/*****************************************************************/

async function as_init()
{
    let requiredState = await api_getValueFromMem("asSwitch") || "off";
    
    if (requiredState == "on" && !AS_IS_ON)
    {
        AS_IS_ON = true;
        await as_sortAllTabs();
        chrome.tabs.onUpdated.addListener(as_onUpdatedHandler); // onUpdated also fires after a new tab is opened (url changes from blank to whatever)
    }
    else if (requiredState == "off" && AS_IS_ON)
    {
        AS_IS_ON = false;
        chrome.tabs.onUpdated.removeListener(as_onUpdatedHandler);
    }
}

async function as_loadData()
{
    [AS["exclPinned"], AS["sortType"], AS["sortOrder"]] = await Promise.all([
        h_loadSingleDataEntry("asExclPinned", "on"),
        h_loadSingleDataEntry("asSortType", "domainThenTitle"),
        h_loadSingleDataEntry("asSortOrder", "az")
    ]);
}

async function as_sortAllTabs()
{
    let windows = await api_getWindows("all", "include tabs");
    let promises = [];
    for (let window of windows) promises.push(as_sortTabsInWindow(window));
    await Promise.all(promises);
}

// this function is seperate and uses "api_getWindowFromId" because the updated tab COULD not be from the active (current) window (ex. site in other window opens a tab)
async function as_onUpdatedHandler(tabId, changeInfo, updatedTab)
{
    await as_sortTabsInWindow(await api_getWindowFromId(updatedTab.windowId));
}

async function as_sortTabsInWindow(window)
{
    let sortedTabs = window.tabs.sort(as_tabSortFunc);
    let sortedTabIds = [];
    for (let tab of window.tabs)
    {
        if (AS["exclPinned"] == "on" && tab.pinned) continue;
        sortedTabIds.push(tab.id);
    }
    await api_moveTabs(sortedTabIds, window.id);
}

// sortType is the type of sort, order is either az or za
function as_tabSortFunc(tab1,tab2)
{
    let one,two;
    switch(AS["sortType"])
    {
        case "title": one=tab1.title; two=tab2.title; break;
        case "url": one=gh_getTabUrl(tab1); two=gh_getTabUrl(tab2); break;
        case "domainThenTitle": one=gh_getUrlHost(gh_getTabUrl(tab1)); two=gh_getUrlHost(gh_getTabUrl(tab2)); break;
    }
    
    let oneGtValue = (AS["sortOrder"] == "az") ? 1 : -1;
    let oneLtValue = oneGtValue - (oneGtValue * 2); // opposite sign of GtValue
    
    if (one > two) return oneGtValue;
    else if (one < two) return oneLtValue;
    else if (one == two && AS["sortType"] != "domainThenTitle") return 0;
    else
    {
        one=tab1.title.toLowerCase(), two=tab2.title.toLowerCase(); // to lower case because case difference return different results when compared
        if (one > two) return oneGtValue;
        else if (one < two) return oneLtValue;
        else return 0;
    }
}

/*****************************************************************/
                        // TAB RELOADER
/*****************************************************************/

async function tr_start(curTabId)
{
    tr_end(curTabId);
    TR_TABS[curTabId] = {};
    TR_TABS[curTabId]["interval"] = await api_getValueFromMem("trInterval");
    tr_setNextReload(curTabId);
}

function tr_end(tabId)
{
    try {clearTimeout(TR_TABS[tabId]["tPointer"]); delete TR_TABS[tabId];} catch(err){}
}

function tr_setNextReload(tabId)
{
    TR_TABS[tabId]["tPointer"] = setTimeout(()=>{tr_reload(tabId)}, gh_minutesToMseconds(TR_TABS[tabId]["interval"]));
}

async function tr_reload(tabId)
{
    let tab = await api_getTabFromId(tabId);
    if (!tab) {tr_end(tabId); return;} // tab was closed without reloader having been disabled
    
    let url = gh_getTabUrl(tab);
    await api_updateTab(tabId, {url:url});
    tr_setNextReload(tabId); // continue to reload
}

/*****************************************************************/
                        // HELPERS
/*****************************************************************/

async function h_loadSingleDataEntry(savedValueKeyInMem, valueIfNotSaved)
{
    let value = await api_getValueFromMem(savedValueKeyInMem);
    if (value == undefined) value = valueIfNotSaved;
    if (savedValueKeyInMem.includes("LinksTa")) value = value.split("\n");
    if (savedValueKeyInMem.includes("TimeoutNumInput")) value = gh_minutesToMseconds(value);
    return value;
}