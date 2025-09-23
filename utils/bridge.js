class Bridge {

    static #handlers = {}

    static listenTo(type, listener) { Bridge.#handlers[type] = listener }

    static {
        onMessage((message, sender, sendResponse) => {
            const {type, ...args} = message
            const handler = Bridge.#handlers[message.type]
            if (!handler) return
            const result = handler(args, sender)
            if (result && typeof result.then === "function") {
                result.then(sendResponse)
                return true
            } else {
                sendResponse(result)
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

        Bridge.listenTo("GetAccountIssues", () => ({ accounts: AccountTrust.failingAccounts() }))

        Bridge.listenTo("DeleteAccount", ({username, system}) => AccountTrust.deleteAccount(username, system))

        Bridge.listenTo("GetDeviceStatus", () => devicetrust.getStatus())

        Bridge.listenTo("RefreshDeviceStatus", () => {
            debug("dashboard requested update")
            Port.postMessage("devicetrust", { request: "update" })
        })

        Bridge.listenTo("FetchExtensionPage", async ({url}) => await ExtensionStore.fetchPage(url))
    }
}