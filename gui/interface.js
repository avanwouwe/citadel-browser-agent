async function showPopup(message, title = "Citadel browser agent"
                   , width = 350, height = 200
                   , left = 200, top = 200)
{
    const window = await chrome.windows.create({
        url: 'about:blank',
        type: 'popup',
        width: width,
        height: height,
        left: left,
        top: top
    })

    const tabId = window.tabs[0].id
    await tabState?.setState("Popup", tabId, {
        title,
        message
    })

    await chrome.tabs.update(tabId, { url: chrome.runtime.getURL("/gui/popup.html") })
}

function blockPage(tabId, reason, blockedPage) {
    tabState?.setState("BlockedPage", tabId, {
        reason,
        url: blockedPage,
        contact: config.company.contact,
        logo: Logo.getLogo(),
        allowException: config.blacklist.exceptions.duration !== undefined
    })

    navigateTo(tabId, chrome.runtime.getURL("/gui/blocked.html"))
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
