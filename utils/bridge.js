class Bridge {

    static listenTo(type, listener) {
        const handler = (message, sender, sendResponse) => {
            const result = listener(message, sender)
            sendResponse(result)
        }

        onMessage(type, handler)
    }

    static {
        Bridge.listenTo("CheckPasswordReuse", async (msg, sender) => await PasswordVault.detectReuse(msg.username, msg.password, sender.origin))
        Bridge.listenTo("GetPasswordSalt", () => PasswordVault.prehashSalt)
        Bridge.listenTo("GetAccountIssues", () => ({ accounts: AccountTrust.failingAccounts()}))
        Bridge.listenTo("GetDeviceStatus", () => DeviceTrust.getStatus())
        Bridge.listenTo("RefreshDeviceStatus", () => {
            debug("dashboard requested update")
            Port.postMessage("devicetrust", { request: "update" } )
        })
    }

}
