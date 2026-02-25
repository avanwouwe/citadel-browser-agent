class Extension {

    static TYPE = "extension"

    static Permissions = class {
        static #permissions = {
            "<all_urls>":                           { risk: 4 },
            "clipboardRead":                        { risk: 4 },
            "cookies":                              { risk: 4 },
            "debugger":                             { risk: 4 },
            "pageCapture":                          { risk: 4 },
            "proxy":                                { risk: 4 },
            "scripting":                            { risk: 4 },
            "webRequest":                           { risk: 4 },
            "browsingData":                         { risk: 3 },
            "declarativeContent":                   { risk: 3 },
            "declarativeNetRequest":                { risk: 3 },
            "desktopCapture":                       { risk: 3 },
            "fileSystemProvider":                   { risk: 3 },
            "history":                              { risk: 3 },
            "power":                                { risk: 3 },
            "privacy":                              { risk: 3 },
            "tabCapture":                           { risk: 3 },
            "tabs":                                 { risk: 3 },
            "unlimitedStorage":                     { risk: 3 },
            "webNavigation":                        { risk: 3 },
            "alarms":                               { risk: 2 },
            "bookmarks":                            { risk: 2 },
            "clipboardWrite":                       { risk: 2 },
            "contextMenus":                         { risk: 2 },
            "downloads":                            { risk: 2 },
            "idle":                                 { risk: 2 },
            "management":                           { risk: 2 },
            "nativeMessaging":                      { risk: 2 },
            "offscreen":                            { risk: 2 },
            "sidePanel":                            { risk: 2 },
            "storage":                              { risk: 2 },
            "activeTab":                            { risk: 1 },
            "background":                           { risk: 1 },
            "identity":                             { risk: 1 },
            "notifications":                        { risk: 1 },
            "webRequestBlocking":                   { risk: 1 },
        // Opera-specific
            "browserOperatorPrivate":               { risk: 3 },
            "operaAccountPrivate":                  { risk: 3 },
            "operaBrowserPrivate":                  { risk: 3 },
            "operaIdentityPrivate":                 { risk: 3 },
            "shodanPrivate":                        { risk: 3 },
            "tabsPrivate":                          { risk: 3 },
            "browserSidebarPrivate":                { risk: 2 },
            "localModelsPrivate":                   { risk: 2 },
            "statsPrivate":                         { risk: 2 },
            "workspacesPrivate":                    { risk: 2 },
            "browserSplitViewPrivate":              { risk: 1 },
            "feedbackPopupPrivate":                 { risk: 1 },
            "liveWallpaperMetricsPrivate":          { risk: 1 },
            "palette":                              { risk: 1 },
            "startpagePrivate":                     { risk: 1 },
        }

        static {
            Object.entries(this.#permissions).forEach(([key, value]) => value.name = key)
        }

        static values = () => Object.keys(Extension.Permissions.#permissions)

        static riskOf(permission) { return Extension.Permissions.#permissions[permission] }
    }

    static Risk = class {
        static UNKNOWN = "UNKNOWN"
        static LOW = "LOW"
        static MEDIUM = "MEDIUM"
        static HIGH = "HIGH"
        static CRITICAL = "CRITICAL"

        static values= [this.LOW, this.MEDIUM, this.HIGH, this.CRITICAL]
        static indexOf(value) { return this.values.indexOf(value) }


        static ofScore(score) {
            if (score == null) return Extension.Risk.UNKNOWN
            if (score < 4.0)   return Extension.Risk.LOW
            if (score < 7.0)   return Extension.Risk.MEDIUM
            if (score < 8.5)   return Extension.Risk.HIGH
            return Extension.Risk.CRITICAL
        }
    }

    static #SIDELOAD_TYPES = ["development", "sideload"]

    static isSideloaded = extensionInfo => Extension.#SIDELOAD_TYPES.includes(extensionInfo.installType)

    static async isInstalled(extensionId) {
        return await chrome.management.get(extensionId)
            .then(() => true, () => false)
    }

    static async isEnabled(extensionId) {
        return chrome.management.get(extensionId)
            .then(ext => ext.enabled, () => false)
    }

    static async disable(extensionId) {
        try {
            await chrome.management.setEnabled(extensionId, false)
        } catch (err) {
            const logObj = {
                type: "extension",
                value: { id: extensionId }
            }

            // Firefox does not allow enterprise-installed plugins to disable other plugins
            const errorLevel = Browser.version.brand === Browser.Firefox ? Log.WARN : Log.ERROR
            const reason =
                err?.message ??
                chrome.runtime.lastError?.message ??
                "unknown error"
            logger.log(Date.now(), "extension", `extension disable failed`, undefined, errorLevel, logObj, `extension '${extensionId}' could not be disabled because '${reason}'`)
        }
    }

}