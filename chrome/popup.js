/*****************************************************************/
                            // NOTES
/*****************************************************************/

// Elements are always toggled and saved (init_event_handler) before the funcitons in the "run" attr are ran.
// Whether elements are saved is dictated by the classes they have
// The id of elements is always their key in memory

/*****************************************************************/
                            // GLOBAL VARS
/*****************************************************************/

var GLOBALS = chrome.extension.getBackgroundPage(); // access global and background functions
var EVENT_CHAIN = Promise.resolve(); // wait for previous event to finish
var TEMP_MSG_TIMEOUT_POINTER = -1; // setTimeout() returns an int, which you can use to clearTimeout(int) early
var CUR_TAB = undefined; // this is used to store the current tab at the time the popup is opened (so you don't have to retrieve in many functions)

/*****************************************************************/
                          // INITIALIZATION
/*****************************************************************/
// These are the actions that need to be taken whenever the popup opens

window.addEventListener("load", init);

async function init()
{
    CUR_TAB = (await GLOBALS.api_getTabs("current"))[0];
    if (!CUR_TAB) {$("body").innerHTML = ""; return;}

    await init_loadSavedElemsFromMem();
    await Promise.all([init_setColorModeStyle(), init_showTabReloaderStatus()]);
    
    $("body").addEventListener("click", init_event_reciever);
    for (let elem of $$(`.saveOnChange`)) elem.addEventListener("change", init_event_reciever);
}

// If specificMenuId is provided it will only load elements from within that menu. Otherwise everything.
async function init_loadSavedElemsFromMem(specificMenuId)
{
    let elems;
    if (specificMenuId)
    {
        let specificMenuElem = oh_idToElem(specificMenuId);
        elems = $$of(specificMenuElem, ".getFromMem");
    }
    else
    {
        elems = $$(`.getFromMem`);
    }
    
    let promises = [];
    for (let elem of elems) promises.push(loadSaveSetElem(elem));
    await Promise.all(promises);

    async function loadSaveSetElem(elem)
    {
        let savedValue = await GLOBALS.api_getValueFromMem(elem.id);
        if (savedValue == undefined) await h_saveElemValue(elem);
        else h_setElemValue(elem, savedValue);
    }
}

async function init_setColorModeStyle()
{
    let switchElem = $("#colorModeSwitch");
    let curState = h_switchState(switchElem);
    let imgBtnSrc = (curState == "dark") ? "img/light-mode-icon.png" : "img/dark-mode-icon.png"; // img for opposite mode needs to be shown
    let styleSheetHref = (curState == "dark") ? "popup_dark.css" : "popup_light.css";
    
    switchElem.src = imgBtnSrc;
    try {$("#colorModeStyle").remove()} catch(err){} // remove previous style if there is one
    $("head").appendChild(oh_htmlToNode(`<link id="colorModeStyle" rel="stylesheet" type="text/css" href="${styleSheetHref}"/>`));
}

async function init_showTabReloaderStatus()
{
    let reloaderBtnElem = $("#tabReloaderOptBtn");
    
    if (GLOBALS.TR_TABS[CUR_TAB.id])
    {
        reloaderBtnElem.classList.remove("menu");
        reloaderBtnElem.classList.add("action");
        h_setSwitch("reloadThisTabSwitch", "on");
        $("#trInterval").value = GLOBALS.TR_TABS[CUR_TAB.id]["interval"];
    }
    else
    {
        reloaderBtnElem.classList.remove("action");
        reloaderBtnElem.classList.add("menu");
        h_setSwitch("reloadThisTabSwitch", "off");
        $("#trInterval").value = await GLOBALS.api_getValueFromMem("trInterval"); 
    }
}

// adds to event chain and runs the event handler when time comes
function init_event_reciever(event)
{
    EVENT_CHAIN = EVENT_CHAIN.then(init_event_handler.bind(null, event));
}

async function init_event_handler(event)
{
    let elem = event.target;
    if (h_isSwitch(elem)) h_setSwitch(elem, "toggle");
    if (h_elemNeedsSaving(elem)) await h_saveElemValue(elem);
    await h_runFuncFromHtmlAttrs(elem);
}

/*****************************************************************/
                            // UI
/*****************************************************************/
// These functions deal with updating the user interface.

function ui_toggleMenus(idOfCurrentMenu, idOfNewCurrentMenu)
{
    let [curMenuElem, newMenuElem] = [oh_idToElem(idOfCurrentMenu), oh_idToElem(idOfNewCurrentMenu)];
    curMenuElem.classList.toggle("hidden");
    newMenuElem.classList.toggle("hidden");
    ui_delTempMsg(); // remove tempMsg when switcing menus
}

function ui_toggleSubmenus(idOfFullMenu, idOfTrigger)
{
    let idOfSubmenu = idOfTrigger.split("Trigger")[0]; // id of submenu is always = to idOfTrigger - "Trigger"
    let [fullMenuElem, triggerElem, submenuElem] = [oh_idToElem(idOfFullMenu), oh_idToElem(idOfTrigger), oh_idToElem(idOfSubmenu)];
    
    $$of(fullMenuElem, ".submenuTrigger").forEach(e => e.classList.remove("active")); // deactivate all triggers
    triggerElem.classList.add("active"); // activate current trigger
    
    $$of(fullMenuElem, ".submenu").forEach(e => e.classList.add("hidden")); // hide all submenus
    submenuElem.classList.remove("hidden"); // unhide current submenu
}

function ui_tempMsg(msg, type)
{
    ui_delTempMsg(); // remove the previous temp message
    $("body").appendChild(oh_htmlToNode(`<p id="tempMsg" class="${type}">${msg}</p>`)); // create the new message
    TEMP_MSG_TIMEOUT_POINTER = setTimeout(()=>{ui_delTempMsg()}, 2000); // remove the message after 3 seconds
}

function ui_delTempMsg()
{
    try{clearTimeout(TEMP_MSG_TIMEOUT_POINTER); $("#tempMsg").remove()} catch(err){}
}

/*****************************************************************/
                            // QUICK ACTIONS
/*****************************************************************/
// These are the functions that handle the execution of quick actions, open multiple links and tab reloader

async function qa_openLinks()
{
    let linksTaElem = $("#openLinksTa");
    let purifiedLinksArr = h_purifyLinks(linksTaElem.value, "any"); // any valid link (if wtl is on, it filters stuff on its own)
    tea_replace(linksTaElem, purifiedLinksArr.join("\n")); // this is done so the user can see what happened
    if (purifiedLinksArr.length == 0) return;
    
    await GLOBALS.wtl_init("wtlOpenLinksSwitch"); // temp turn way to load on/off
    for (let link of purifiedLinksArr) GLOBALS.api_openNewTab(link);
    await GLOBALS.wtl_init(); // return wait to load back to normal
}

async function qa_triggerTrInit()
{
    if (h_switchState("reloadThisTabSwitch") == "on") 
    {
        await GLOBALS.tr_start(CUR_TAB.id); // if already on, it will be stopped, and started with new settings in background
        ui_tempMsg("reloader started", "success");
    }
    else
    {
        GLOBALS.tr_end(CUR_TAB.id);
        ui_tempMsg("reloader stopped", "success");
    }
}

async function qa_mergeWindows()
{
    let tabsInOtherWindowsArr = await GLOBALS.api_getTabs("in other windows");
    if (tabsInOtherWindowsArr.length == 0) {ui_tempMsg("no windows to merge", "neutral"); return;}
    
    let tabIds = tabsInOtherWindowsArr.map(tab => tab.id);
    let moveResult = await GLOBALS.api_moveTabs(tabIds, CUR_TAB.windowId);
    
    if (moveResult == "failed") ui_tempMsg("merge failed", "error");
    else ui_tempMsg("merge successful", "success");
}

async function qa_closeAllButCurTab()
{
    let allTabsArr = await GLOBALS.api_getTabs("all");
    let tabIdsToCloseArr = [];
    for (let tab of allTabsArr) {if (tab.id != CUR_TAB.id) tabIdsToCloseArr.push(tab.id);}
    if (tabIdsToCloseArr.length == 0) {ui_tempMsg("to tabs to close", "neutral"); return;}
    
    let closeResult = await GLOBALS.api_closeTabs(tabIdsToCloseArr);
    
    if (closeResult == "failed") ui_tempMsg("failed to close tabs", "error");
    else ui_tempMsg(`${tabIdsToCloseArr.length} tabs closed`, "success");
}


async function qa_copyTabsLinks(extraToCopy)
{
    let tabsToGet = (h_switchState("allWindowsSwitch") == "on") ? "all" : "in current window";
    let tabsArr = await GLOBALS.api_getTabs(tabsToGet);
    let linksStr = "";
    
    for (let tab of tabsArr)
    {
        if (extraToCopy == "titles") linksStr += "\n" + GLOBALS.gh_getTabTitle(tab) + "\n";
        linksStr += GLOBALS.gh_getTabUrl(tab) + "\n";
    }
    
    copy(linksStr.trim());
    ui_tempMsg(`${tabsArr.length} links copied`, "success");
}

// action is either "load" or "close"
async function qa_loadOrCloseWtlTabs(action)
{
    let wtlUrlStr = GLOBALS.api_getExtFileHref("wait_to_load.html");
    
    let tabsToGet = (h_switchState("allWindowsSwitch") == "on") ? "all" : "in current window";
    let wtlTabsArr = (await GLOBALS.api_getTabs(tabsToGet)).filter(tab => GLOBALS.gh_getTabUrl(tab).includes(wtlUrlStr));
    if (wtlTabsArr.length == 0) {ui_tempMsg(`no tabs to ${action}`, "neutral"); return;}

    if (action == "close")
    {
        let wtlTabIdsArr = wtlTabsArr.map(tab => tab.id);
        let closeResult = await GLOBALS.api_closeTabs(wtlTabIdsArr);
        if (closeResult == "failed") ui_tempMsg("failed to close tabs", "error");
        else ui_tempMsg(`${wtlTabIdsArr.length} tabs closed`, "success");
    }
    else
    {
        for (let tab of wtlTabsArr)
        {
            let site = GLOBALS.gh_getTabUrl(tab).split("#")[1];
            GLOBALS.api_updateTab(tab.id, {url:site});
        }
        ui_tempMsg(`${wtlTabsArr.length} tabs loaded`, "success");
    }
}

async function qa_sortTabs()
{
    if (h_switchState("allWindowsSwitch") == "on") await GLOBALS.as_sortAllTabs();
    else await GLOBALS.as_onUpdatedHandler(null, null, CUR_TAB);
    ui_tempMsg(`tabs were sorted`, "success");
}

async function qa_suspendTabs()
{
    let tabsToGet = (h_switchState("allWindowsSwitch") == "on") ? "all" : "in current window";
    let tabsArr = await GLOBALS.api_getTabs(tabsToGet);

    let numTabsSuspended = 0; // not every tab gets suspended, depending the suspender's settings, so we use this to count
    for (let tab of tabsArr)
    {
        if (tab.id == CUR_TAB.id || GLOBALS.ts_skipThisTab(tab)) continue;
        GLOBALS.api_discardTabFromMem(tab.id);
        numTabsSuspended++;
    }
    
    ui_tempMsg(`${numTabsSuspended} tabs suspended`, "success");
}

async function qa_tabsVolume(action)
{
    let tabsToGet = (h_switchState("allWindowsSwitch") == "on") ? "audible" : "audible in window";
    let audioTabsArr = await GLOBALS.api_getTabs(tabsToGet);
    if (audioTabsArr.length == 0) {ui_tempMsg(`no tabs to ${action}`, "neutral"); return;}
    
    let requiredMuteStatus = (action == "mute") ? true : false;
    for (let tab of audioTabsArr) GLOBALS.api_updateTab(tab.id, {muted:requiredMuteStatus});
    
    ui_tempMsg(`${audioTabsArr.length} tabs ${action}d `, "success");
}

/*****************************************************************/
                              // RESET
/*****************************************************************/

function reset()
{
    chrome.storage.local.clear();
    chrome.runtime.reload();
}

/*****************************************************************/
                        // APPLYING SETTINGS
/*****************************************************************/

// Given the id of a menu whose settings need to be applied:
// this function goes through all settings elements (.toolSetting), validates, saves and applies them
async function validateSaveAndApplySettings(idOfMenu)
{
    let menuElem = oh_idToElem(idOfMenu);
    let allSettingElemsInMenu = $$of(menuElem, ".toolSetting");

    let promises = [];
    for (let elem of allSettingElemsInMenu) promises.push(validateAndSaveElem(elem));
    await Promise.all(promises);

     // show what was saved (could've been edited etc.), and apply
    await Promise.all([init_loadSavedElemsFromMem(idOfMenu), GLOBALS.sbo_applySettingsChange(idOfMenu)]);

    async function validateAndSaveElem(elem)
    {
        if (elem.nodeName == "TEXTAREA")
        {
            let purifiedLinksArr = h_purifyLinks(elem.value, "host");
            await GLOBALS.api_saveValueInMem(elem.id, purifiedLinksArr.join("\n"));
        }
        else if (elem.nodeName == "SELECT")
        {
            let acceptedValuesArr = $$of(elem, "option").map(optionElem => optionElem.value);
            if (acceptedValuesArr.includes(elem.value)) await GLOBALS.api_saveValueInMem(elem.id, elem.value);
        }
        else if (elem.nodeName == "INPUT" && elem.type == "number")
        {
            if (elem.value >= elem.min && elem.value <= elem.max) await GLOBALS.api_saveValueInMem(elem.id, elem.value);
        }
        else if (h_isSwitch(elem))
        {
            await GLOBALS.api_saveValueInMem(elem.id, h_switchState(elem));
        }
    }
}

/*****************************************************************/
                            // HELPERS
/*****************************************************************/
// Things direcetly related to this program that help the main functions

function h_elemNeedsSaving(elem)
{
    elem = oh_idToElem(elem);
    return elem.classList.contains("saveOnClick") || elem.classList.contains("saveOnChange");
}

async function h_saveElemValue(elem)
{
    elem = oh_idToElem(elem);
    if (h_isSwitch(elem)) await GLOBALS.api_saveValueInMem(elem.id, h_switchState(elem));
    else await GLOBALS.api_saveValueInMem(elem.id, elem.value);
}

function h_setElemValue(elem, value)
{
    elem = oh_idToElem(elem);
    if (h_isSwitch(elem)) h_setSwitch(elem, value);
    else elem.value = value;
}

function h_isSwitch(elem)
{
    elem = oh_idToElem(elem);
    return elem.classList.contains("switch");
}

function h_switchState(switchElem)
{
    switchElem = oh_idToElem(switchElem);
    return switchElem.getAttribute("states").split(",")[0].trim();
}

function h_setSwitch(switchElem, value)
{
    switchElem = oh_idToElem(switchElem);
    let statesArr = switchElem.getAttribute("states").split(",").map(e => e.trim());
    if (value == "toggle" || statesArr[0] != value) statesArr.reverse();
    switchElem.setAttribute("states", statesArr.join(","));
}

async function h_runFuncFromHtmlAttrs(elem)
{
    let funcStringsArr;
    try {funcStringsArr = elem.getAttribute("run").split(";").map(e => e.trim())}
    catch(err) {return} // no run attr
    
    for (let funcStr of funcStringsArr)
    {
        // return if not a proper function
        if (!/^.+\(.*\)$/.test(funcStr)) continue;
        
        // get the function name and params
        let funcName = funcStr.split("(")[0].trim();
        let funcParams = (funcStr.endsWith("()")) ? [] : funcStr.split("(")[1].split(")")[0].split(",").map(e => e.trim());
        
        // get the actual function (current window or globals)
        let func = (funcName.includes("GLOBALS:")) ? GLOBALS[funcName.split("GLOBALS:")[1]] : window[funcName];
        
        // test if it's actually a function just in case
        if (typeof func !== "function") return;
        
        // run the function
        if (funcParams.length == 0) await func();
        else await func.apply(null, funcParams);
    }
}

// given a string (or array) containing links, this removes invalid ones and diplicates and returns a validated array
// mode is ether http, any, host (with host, links will also be converted to host-only)
function h_purifyLinks(links, mode)
{
    let linksArr = (!Array.isArray(links)) ? links.split(/\s+|\n/) : links; // split based on new line or space (also tab works) if not already
    let validLinksArr = [];
    
    for (let link of linksArr)
    {
        link = link.trim();
        if (mode == "http" && !GLOBALS.gh_urlIsValid(link, "http")) continue;
        else if (mode == "any" && !GLOBALS.gh_urlIsValid(link, "any")) continue;
        else if (mode == "host")
        {
            if (!GLOBALS.gh_hostIsValid(link)) continue;
            link = GLOBALS.gh_getUrlHost(link);
        }
        validLinksArr.push(link);
    }
    
    validLinksArr = [...new Set(validLinksArr)]; // remove duplicates
    return validLinksArr;
}

/*****************************************************************/
                            // COPY
/*****************************************************************/
// The argument here is a string of text instead of an element or id

function copy(textToCopy)
{
    navigator.clipboard.writeText(textToCopy);
}

/*****************************************************************/
                    // TEXT ELEMENT ACTIONS
/*****************************************************************/

function tea_copy(textInputElem)
{
    textInputElem = oh_idToElem(textInputElem);
    navigator.clipboard.writeText(textInputElem.value);
}

function tea_paste(textInputElem)
{
    textInputElem = oh_idToElem(textInputElem);
    textInputElem.focus();
    document.execCommand('paste');
}

function tea_replace(textInputElem, newText)
{
    textInputElem = oh_idToElem(textInputElem);
    textInputElem.focus();
    textInputElem.select();
    document.execCommand("insertText", false, newText);
}

function tea_undo()
{
    document.execCommand("undo", false, null);
}

function tea_redo()
{
    document.execCommand("redo", false, null);
}

/*****************************************************************/
                        // OTHER HELPERS
/*****************************************************************/
// General things not directly related to the program

function oh_idToElem(id)
{
    if (typeof id != "string") return id; // already an element
    id = id.trim();
    if (id.startsWith("#")) return $(`${id}`);
    else return $(`#${id}`);
}

function oh_htmlToNode(code)
{
    let tempWrapper = document.createElement("div");
    tempWrapper.innerHTML = code;
    if (tempWrapper.childElementCount == 1) tempWrapper = tempWrapper.firstChild;
    return tempWrapper;
}

/*****************************************************************/
                        // HTML SELECTORS
/*****************************************************************/

function $ (cssQuery)
{
    return document.querySelector(cssQuery);
}

function $$ (cssQuery)
{
    return [...document.querySelectorAll(cssQuery)];
}

function $of (elem, cssQuery)
{
    let response;
    try {response = elem.querySelector(cssQuery);}
    catch (err) {response = null;}
    return response;
}

function $$of (elem, cssQuery)
{
    let response;
    try {response = [...elem.querySelectorAll(cssQuery)];}
    catch (err) {response = [];}
    return response;
}