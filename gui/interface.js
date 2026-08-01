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

function blockPage(tabId, reason, blockedPage, blacklistEntry, options = {}) {
    tabState?.setState("BlockedPage", tabId, {
        reason,
        blacklistEntry,
        url: blockedPage,
        contact: config.organization.contact,
        logo: Logo.getLogo(),
        allowException: options.allowException,
        exceptionType: options.exceptionType,
    })

    navigateTo(tabId, chrome.runtime.getURL("/gui/blocked.html"))
}

async function safeInject(label, fn) {
    try {
        return await fn()
    } catch (e) {
        error(`Exception in ${label}:`, e)
    }
}

async function injectFilesIntoTab(tabId, files) {
    return safeInject(`injectFilesIntoTab tab ${tabId}`,
        () => chrome.scripting.executeScript({ target: { tabId }, files })
    )
}

async function injectFilesIntoDomain(domain, files) {
    return safeInject(`injectFilesIntoDomain ${domain}`, async () => {
        const tabs = await chrome.tabs.query({ url: [`*://${domain}/*`, ...(domain !== '*' ? [`*://*.${domain}/*`] : [])] })
        return Promise.allSettled(
            tabs.map(tab => safeInject(`injectFilesIntoDomain tab ${tab.id}`,
                () => chrome.scripting.executeScript({ target: { tabId: tab.id }, files })
            ))
        )
    })
}

async function injectFuncIntoTab(tabId, func, args = []) {
    return safeInject(`injectFuncIntoTab tab ${tabId} [${func.name}]`,
        () => chrome.scripting.executeScript({ target: { tabId }, func, args })
    )
}

async function injectFuncIntoDomain(domain, func, args = []) {
    return safeInject(`injectFuncIntoDomain ${domain} [${func.name}]`, async () => {
        const tabs = await chrome.tabs.query({ url: [`*://${domain}/*`, ...(domain !== '*' ? [`*://*.${domain}/*`] : [])] })
        return Promise.allSettled(
            tabs.map(tab => safeInject(`injectFuncIntoDomain tab ${tab.id} [${func.name}]`,
                () => chrome.scripting.executeScript({ target: { tabId: tab.id }, func, args })
            ))
        )
    })
}