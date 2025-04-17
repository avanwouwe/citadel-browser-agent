function showPopup(message, title = "Citadel browser agent"
                   , width = 350, height = 200
                   , left = 200, top = 200)
{
    const url = chrome.runtime.getURL("gui/popup.html");
    const params = new URLSearchParams({ message: message, title: title });

    chrome.windows.create({
        url: `${url}?${params.toString()}`,
        type: 'popup',
        width: width,
        height: height,
        left: left,
        top: top
    });
}

function blockPage(tabId, reason, blockedPage) {
    const url = chrome.runtime.getURL("gui/blocked.html");
    const params = new URLSearchParams({
        reason,
        value: blockedPage,
        contact: config.company.contact,
    })

    if (config.blacklist.exceptions.duration) {
        params.set('e', 12)     // security by obscurity, magic number, all true.. but it's better than nothing
    }

    chrome.tabs.update(tabId, { 'url' : `${url}?${params.toString()}` })
}
