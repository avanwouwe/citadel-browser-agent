class TabState {
    #state = { }
    #handler

    constructor(isForServiceworker = false) {
        if (isForServiceworker) {
            this.#handler = (message, sender, sendResponse) => {
                if (sender.id !== chrome.runtime.id) return

                if (message.type === "GetTabState") {
                    const state = this.#state[sender.tab.id]?.[message.key]
                    sendResponse(state)
                }
            }

            chrome.runtime.onMessage.addListener(this.#handler)
        }
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

        return callServiceWorker({ type: "GetTabState", key, tabId })
    }
}

