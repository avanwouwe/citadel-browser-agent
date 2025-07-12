class TabState {
    #state = { }
    #handler

    constructor(isForServiceworker = false) {
        if (isForServiceworker) {
            this.#handler = (message, sender, sendResponse) => {
                if (message.type === "GetTabState") {
                    if (sender.id !== chrome.runtime.id) { return console.error(`message received from unknown extension ${sender.id}`) }

                    const state = this.#state[sender.tab.id]?.[message.key]
                    sendResponse({ type: "SendTabState", key: message.key, state })
                }
            }

            chrome.runtime.onMessage.addListener(this.#handler)
        }

        return this
    }

    clear() {
        this.#handler = { }
    }

    setState(tabId, key, value) {
        if (this.#handler) {
            if (tabId === undefined) { return console.error("tabId parameter is required") }

            this.#state[tabId] = this.#state[tabId] || {}
            this.#state[tabId][key] = value
        } else {
            return console.error("only extension can set state")
        }
    }

    async getState(key, tabId) {
        if (this.#handler) {
            if (tabId === undefined) { return console.error("tabId parameter is required") }

            return Promise.resolve(this.#state[tabId]?.[key])
        }

        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({ type: "GetTabState", key, tabId }, (response) => {
                    if (chrome.runtime.lastError) {
                        reject(chrome.runtime.lastError)
                    } else {
                        resolve(response?.state)
                    }
                }
            )
        })
    }
}

