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

function blockPage(tabId, reason, value) {
    const url = chrome.runtime.getURL("gui/blocked.html");
    const params = new URLSearchParams({ reason: reason, value: value, contact: config.contact });

    chrome.tabs.update(tabId, { 'url' : `${url}?${params.toString()}` });
}
