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

        Bridge.listenTo("CheckPasswordReuse", ({username, password}, sender) => PasswordVault.detectReuse(username, password, sender.origin))
        Bridge.listenTo("GetPasswordSalt", () => PasswordVault.prehashSalt)
        Bridge.listenTo("GetAccountIssues", () => ({ accounts: AccountTrust.failingAccounts() }))
        Bridge.listenTo("GetDeviceStatus", () => devicetrust.getStatus())
        Bridge.listenTo("RefreshDeviceStatus", () => {
            debug("dashboard requested update")
            Port.postMessage("devicetrust", { request: "update" })
        })
    }
}