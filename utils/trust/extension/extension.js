class Extension {

    static TYPE = "extension"

    static Permissions = class {
        static #permissions = {
            "accessibilityFeatures.modify": {
                risk: undefined
            },
            "accessibilityFeatures.read": {
                risk: undefined
            },
            "activeTab": {
                risk: 1
            },
            "alarms": {
                risk: 2
            },
            "audio": {
                risk: undefined
            },
            "background": {
                risk: 1
            },
            "bookmarks": {
                risk: 2
            },
            "browsingData": {
                risk: 3
            },
            "certificateProvider": {
                risk: undefined
            },
            "clipboardRead": {
                risk: 4
            },
            "clipboardWrite": {
                risk: 2
            },
            "contentSettings": {
                risk: undefined
            },
            "contextMenus": {
                risk: 2
            },
            "cookies": {
                risk: 4
            },
            "debugger": {
                risk: 4
            },
            "declarativeContent": {
                risk: 3
            },
            "declarativeNetRequest": {
                risk: 3
            },
            "declarativeNetRequestWithHostAccess": {
                risk: undefined
            },
            "declarativeNetRequestFeedback": {
                risk: undefined
            },
            "desktopCapture": {
                risk: 3
            },
            "dns": {
                risk: undefined
            },
            "documentScan": {
                risk: undefined
            },
            "downloads": {
                risk: 2
            },
            "downloads.open": {
                risk: undefined
            },
            "downloads.ui": {
                risk: undefined
            },
            "enterprise.deviceAttributes": {
                risk: undefined
            },
            "enterprise.hardwarePlatform": {
                risk: undefined
            },
            "enterprise.networkingAttributes": {
                risk: undefined
            },
            "enterprise.platformKeys": {
                risk: undefined
            },
            "favicon": {
                risk: undefined
            },
            "fileBrowserHandler": {
                risk: undefined
            },
            "fileSystemProvider": {
                risk: 3
            },
            "fontSettings": {
                risk: undefined
            },
            "gcm": {
                risk: undefined
            },
            "geolocation": {
                risk: undefined
            },
            "history": {
                risk: 3
            },
            "identity": {
                risk: 1
            },
            "identity.email": {
                risk: undefined
            },
            "idle": {
                risk: 2
            },
            "loginState": {
                risk: undefined
            },
            "management": {
                risk: 2
            },
            "nativeMessaging": {
                risk: 2
            },
            "notifications": {
                risk: 1
            },
            "offscreen": {
                risk: 2
            },
            "pageCapture": {
                risk: 4
            },
            "platformKeys": {
                risk: undefined
            },
            "power": {
                risk: 3
            },
            "printerProvider": {
                risk: undefined
            },
            "printing": {
                risk: undefined
            },
            "printingMetrics": {
                risk: undefined
            },
            "privacy": {
                risk: 3
            },
            "processes": {
                risk: undefined
            },
            "proxy": {
                risk: 4
            },
            "readingList": {
                risk: undefined
            },
            "runtime": {
                risk: undefined
            },
            "scripting": {
                risk: 4
            },
            "search": {
                risk: undefined
            },
            "sessions": {
                risk: undefined
            },
            "sidePanel": {
                risk: 2
            },
            "storage": {
                risk: 2
            },
            "system.cpu": {
                risk: undefined
            },
            "system.display": {
                risk: undefined
            },
            "system.memory": {
                risk: undefined
            },
            "system.storage": {
                risk: undefined
            },
            "tabCapture": {
                risk: 3
            },
            "tabGroups": {
                risk: undefined
            },
            "tabs": {
                risk: 3
            },
            "topSites": {
                risk: undefined
            },
            "tts": {
                risk: undefined
            },
            "ttsEngine": {
                risk: undefined
            },
            "unlimitedStorage": {
                risk: 3
            },
            "userScripts": {
                risk: undefined
            },
            "vpnProvider": {
                risk: undefined
            },
            "wallpaper": {
                risk: undefined
            },
            "webAuthenticationProxy": {
                risk: undefined
            },
            "webNavigation": {
                risk: 3
            },
            "webRequest": {
                risk: 4
            },
            "webRequestBlocking": {
                risk: 1
            },
            "<all_urls>": {
                risk: 4
            }
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
        return chrome.management.get(extensionId).then(() => true, () => false)
    }

    static async disable(extensionInfo) {
        Notification.setAlert(Extension.TYPE, State.FAILING, t('extension-analysis.disable-modal.title'), t('extension-analysis.disable-modal.message'))

        try {
            await chrome.management.setEnabled(extensionInfo.id, false)
        } catch (err) {
            const reason =
                err?.message ??
                chrome.runtime.lastError?.message ??
                "unknown error"
            logger.log(Date.now(), "extension", `extension disable failed`, undefined, Log.ERROR, extensionInfo.id, `extension '${extensionInfo.name}' (${extensionInfo.id}) could not be disabled because '${reason}'`)
        }
    }

}