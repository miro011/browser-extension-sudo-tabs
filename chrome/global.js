/*****************************************************************/
                        // BROWSER API COMMANDS
/*****************************************************************/

function api_getWindows(which, includeTabs)
{
    let optionalParamsObj = (includeTabs == "include tabs") ? {populate:true} : {populate:false};
    
    if (which == "all")
    {
        return new Promise((resolve) => 
        {
            chrome.windows.getAll(optionalParamsObj, (windowsArr) =>
            {
                if (chrome.runtime.lastError) resolve([]);
                else resolve(windowsArr);
            })
        });
    }
    else if (which == "current")
    {
        return new Promise((resolve) => 
        {
            chrome.windows.getCurrent(optionalParamsObj, (windowObj) =>
            {
                if (chrome.runtime.lastError) resolve([]);
                else resolve([windowObj]);
            })
        });
    }
}

function api_getWindowFromId(windowId)
{
    return new Promise((resolve) => 
    {
        chrome.windows.get(windowId, {populate:true}, (window)=>
        {
            if (chrome.runtime.lastError) resolve(false);
            else resolve(window);
        })
    });
}

function api_getTabs(which)
{
    let queryInfo;
    switch(which)
    {
        case "all": queryInfo = {}; break;
        case "in current window": queryInfo = {currentWindow:true}; break;
        case "in other windows": queryInfo = {currentWindow:false}; break;
        case "active": queryInfo = {active:true}; break;
        case "current": queryInfo = {active:true, currentWindow:true}; break;
        case "inactive": queryInfo = {active: false}; break;
        case "inactive in window": queryInfo = {active: false, currentWindow:true}; break;
        case "inactive in other windows": queryInfo = {active: false, currentWindow:false}; break;
        case "audible": queryInfo = {audible:true}; break;
        case "audible in window": queryInfo = {audible:true, currentWindow:true}; break;
    }
    
    return new Promise((resolve) => 
    {
        chrome.tabs.query(queryInfo, (tab)=>
        {
            if (chrome.runtime.lastError) resolve([]);
            else resolve(tab);
        })
    });
}

function api_getTabFromId(tabId)
{
    return new Promise((resolve) => 
    {
        chrome.tabs.get(tabId, (tab)=>
        {
            if (chrome.runtime.lastError) resolve(false);
            else resolve(tab);
        })
    });
}

function api_updateTab(tabId, updateObj)
{
    return new Promise((resolve) => 
    {
        chrome.tabs.update(tabId, updateObj, (tab)=>
        {
            if (chrome.runtime.lastError) resolve(false);
            else resolve(tab);
        })
    });
}

// given an array of tab ids, this moves them to end of the window (index:-1)
// so if you have a re-sorted list of the current tabs in the window, the first one in the resorted list will become the first one once they're all moved
function api_moveTabs(tabIdsArr, windowId)
{
    return new Promise((resolve) => 
    {
        chrome.tabs.move(tabIdsArr, {index:-1, windowId:windowId}, (movedTabsDetails) =>
        {
            if (chrome.runtime.lastError) resolve("failed");
            else resolve("success");
        })
    });
}

function api_closeTabs(tabIdsArr)
{
    return new Promise((resolve) => 
    {
        chrome.tabs.remove(tabIdsArr, (response) =>
        {
            if (chrome.runtime.lastError) resolve("failed");
            else resolve(response);
        })
    });
}

function api_openNewTab(urlStr, additional)
{
    let obj = {url:urlStr, active:false};
    if (additional == "make active") obj.active = true;
    
    return new Promise((resolve) => 
    {
        chrome.tabs.create(obj, (newTab) =>
        {
            if (chrome.runtime.lastError) resolve("failed");
            else resolve(newTab);
        })
    });
}

function api_discardTabFromMem(tabId)
{
    return new Promise((resolve) => 
    {
        chrome.tabs.discard(tabId, (discardedTab) =>
        {
            if (chrome.runtime.lastError || !discardedTab) resolve("failed");
            else resolve(discardedTab);
        })
    });
}

function api_saveValueInMem(key, value)
{
    let keyValueObj = {};
    keyValueObj[key] = value;
    return new Promise( (resolve) => {chrome.storage.local.set(keyValueObj, ()=>{resolve("succeess")})} );
}

function api_getValueFromMem(key)
{
    return new Promise( (resolve) => {chrome.storage.local.get([key], (result)=>{resolve(result[key])})} );
}

function api_getExtFileHref(absolutePathFromWithin)
{
    return chrome.runtime.getURL(absolutePathFromWithin);
}

/*****************************************************************/
                        // GLOBAL HELPERS
/*****************************************************************/

// this one will only return true if it's an actual URL in its full form
// mode is either http or any (http only returns true with http urls, any for any valid url - file, etc.)
function gh_urlIsValid(url, mode)
{
    let urlObj;
    try {urlObj = new URL(url)} catch(err) {return false}
    if (mode == "http" && !urlObj.protocol.includes("http")) return false;
    if (urlObj.host == "") return false; // "prevents things like '#url' being validated"
    return true;
}

// this one is a lot more relaxed. It can accept stuff without https:// or www
function gh_hostIsValid(url)
{
    if (url.includes(" ") || !url.includes(".")) return false;
    if (!url.includes("://")) url = "http://" + url;
    if (!url.startsWith("http")) return false;
    return true;
}

function gh_getUrlHost(url)
{
    if (!url.includes("://")) url = "http://" + url;
    let host = "";
    try {host = (new URL(url))["host"].replace(/^ww(w|\d)\./g, "")} catch(err){} // remove www.
    return host;
}

function gh_getTabUrl(tab)
{
    return tab.url || tab.pendingUrl || "";
}

function gh_getTabTitle(tab)
{
    return tab.title || "MISSING TITLE";
}

function gh_minutesToMseconds(num)
{
    return num * 60 * 1000;
}