function rateLimit(key, window, callback) {
    const rateLimitKey = 'rateLimit-' + key;

    if (window < 0) {
        chrome.storage.local.remove([rateLimitKey])
        return
    }

    // check when the window started
    chrome.storage.local.get([rateLimitKey], (result) => {
        const startWindow = result[rateLimitKey];
        const now = Date.now();

        if (startWindow) {
            const timeElapsed = now - startWindow;

            if (timeElapsed > window) {
                chrome.storage.local.set({ [rateLimitKey]: now }, () => {
                    callback(true);
                });
            } else {
                callback(false);
            }
        } else {
            // begin of window
            chrome.storage.local.set({ [rateLimitKey]: now }, () => {
                callback(false);
            });
        }
    });
}

function rateLimitReset(key) {
    rateLimit(key, -1)
}
