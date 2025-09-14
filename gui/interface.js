function showPopup(message, title = "Citadel browser agent"
                   , width = 350, height = 200
                   , left = 200, top = 200)
{
    const url = chrome.runtime.getURL("/gui/popup.html")
    const params = new URLSearchParams({ message: message, title: title })

    chrome.windows.create({
        url: `${url}?${params.toString()}`,
        type: 'popup',
        width: width,
        height: height,
        left: left,
        top: top
    })
}

function blockPage(tabId, reason, blockedPage) {
    tabState?.setState(tabId, "BlockedPage", {
        reason,
        url: blockedPage,
        contact: config.company.contact,
        logo: Logo.getLogo(),
        allowException: config.blacklist.exceptions.duration !== undefined
    })

    chrome.tabs.update(tabId, { url: chrome.runtime.getURL("/gui/blocked.html") })
}

async function injectFilesIntoTab(tabId, files) {
    return chrome.scripting.executeScript({ target: { tabId }, files })
}

async function injectFilesIntoDomain(domain, files) {
    const tabs = await chrome.tabs.query({ url: [`*://${domain}/*`, `*://*.${domain}/*`] })
    return Promise.allSettled(
        tabs.map(tab => chrome.scripting.executeScript({ target: { tabId: tab.id }, files }))
    )
}

async function injectFuncIntoTab(tabId, func, args = []) {
    return chrome.scripting.executeScript({ target: { tabId }, func, args })
}

async function injectFuncIntoDomain(domain, func, args = []) {
    const tabs = await chrome.tabs.query({ url: [`*://${domain}/*`, `*://*.${domain}/*`] })
    return Promise.allSettled(
        tabs.map(tab => chrome.scripting.executeScript({ target: { tabId: tab.id }, func, args }))
    )
}
