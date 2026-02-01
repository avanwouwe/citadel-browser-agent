class Bridge {

    static #handlers = {}

    static listenTo(type, listener) { Bridge.#handlers[type] = listener }

    static {
        onMessage((message, sender, sendResponse) => {
            const {type, ...args} = message
            const handler = Bridge.#handlers[message.type]
            if (!handler) return
            const result = handler(args, sender)
            if (typeof result?.then === "function") {
                result.then(data => sendResponse({data})).catch(error => sendResponse({error: serializeError(error)}))
                return true
            } else {
                sendResponse({data: result})
            }
        })

        Bridge.listenTo("InitPasswordCheck", (_, sender) => {
            const msg = { salt: PasswordVault.prehashSalt }
            const app = AppStats.forURL(sender.origin)
            msg.accounts = app ? AppStats.allAccounts(app).map(([key]) => key) : undefined
            return msg
        })

        Bridge.listenTo("CheckPasswordReuse", ({username, password}, sender) => PasswordVault.detectReuse(username, password, sender.origin))

        Bridge.listenTo("DeletePassword", ({username, system}) => PasswordVault.deleteAccount(username, system))

        Bridge.listenTo("GetAccountStatus", () => ({ accounts: AccountTrust.getStatus() }))

        Bridge.listenTo("DeleteAccount", ({username, system}) => AccountTrust.deleteAccount(username, system))

        Bridge.listenTo("GetDeviceStatus", () => DeviceTrust.getStatus())

        Bridge.listenTo("RefreshDeviceStatus", () => {
            debug("dashboard requested update")
            Port.postMessage("devicetrust", { request: "update" })
        })

        Bridge.listenTo("FetchExtensionPage", async ({url}) => await ExtensionStore.fetchPage(url))

        Bridge.listenTo("ShowExtensionPage", ({tabId, storePage}) => ExtensionAnalysis.showStorePage(tabId, storePage))

        Bridge.listenTo("GetEvents", () => events.get())
    }
}