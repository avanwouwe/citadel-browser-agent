class Extension {

    static TYPE = "extension"

    static #exceptionsStorage = new PersistentObject("extension-exceptions")
    static exceptions

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

        static ofPermission(permission) { return Extension.#permissions[permission] }
    }

    static #canAccessProtected(manifest, config, maxMatches = 5) {
        const permissions = Object.keys(Extension.#permissions)
        const patterns = [
            ...manifest.permissions.filter(permission => ! permissions.includes(permission)),
            ...manifest.host_permissions
            ].map(pattern => this.#patternToRegex(pattern))

        const domains = []
        const protocols = ['https:', 'http:', 'ftp:', 'file:', 'ws:', 'wss:']

        for (const domain of Object.keys(config.protectedDomains)) {
            const testUrls = [
                domain,
                ...protocols.map(proto => `${proto}//${domain}`),
                ...protocols.map(proto => `${proto}//${domain}/`),
                ...protocols.map(proto => `${proto}//${domain}/path`),
                ...protocols.map(proto => `${proto}//subdomain.${domain}`),
                `subdomain.${domain}`
            ]

            const matched = patterns.some(regex => testUrls.some(url => regex.test(url)))
            if (matched) {
                domains.push(domain)

                if (domains.length > maxMatches) {
                    break
                }
            }
        }

        return domains
    }

    static #patternToRegex(pattern) {
        if (pattern === '<all_urls>') {
            return /.*/
        }

        const escaped = RegExp.escape(pattern)
        const regexStr = escaped.replace(/\\\*/g, '.*')

        return new RegExp(regexStr, 'i')
    }

    static #broadPatterns = ['<all_urls>', '*://*/*', 'http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*', 'file://*/*']

    static async checkPermissions(manifest, config) {
        const protectedDomains = Extension.#canAccessProtected(manifest, config, 1)

        config = config.extensions.permissions

        const permissions = [
            ...manifest.permissions,
            ...(config.permissions.analyzeOptional ? manifest.optional_permissions : [])
        ]

        const host_permissions = [
            ...manifest.host_permissions,
            ...manifest.manifest_version === 2 ? manifest.permissions : [],
            ...(config.hostPermissions.analyzeOptional ? manifest.optional_host_permissions : [])
        ]

        const broadHostPermissions = [...permissions, ...host_permissions].filter(permission => Extension.#broadPatterns.includes(permission))
        const isBroad = broadHostPermissions.length > 0

        if (isBroad && !permissions.includes("<all_urls>")) {
            permissions.push("<all_urls>")
        }

        if (manifest.manifest_version === 2 && manifest.permissions.includes("tabs")) {
            permissions.push("scripting")
        }

        const blockingPermissions = permissions.filter(permission =>
            config.permissions.forbidden.includes(permission) ||
            (config.permissions.requireSpecific.includes(permission) && isBroad)
        )

        const allowPermissions = blockingPermissions.length === 0
        const allowAllDomains = !config.hostPermissions.requireSpecific || !isBroad
        const allowProtectedDomains = config.hostPermissions.allowProtected || protectedDomains.length === 0
        const allowed = allowPermissions && allowAllDomains

        return { allowed, allowPermissions, allowAllDomains, allowProtectedDomains, blockingPermissions, broadHostPermissions, protectedDomains, isBroad }
    }

    static async isInstalled(extensionId) {
        return chrome.management.get(extensionId).then(() => true, () => false)
    }

    static async flush() {
        Extension.#exceptionsStorage.markDirty()
        await Extension.#exceptionsStorage.flush()
    }

    static #SIDELOAD_TYPES = ["development", "sideload"]

    static async #scanInstalledExtensions() {
        const config = await Config.waitIsLoaded()

        for (const ext of await chrome.management.getAll()) {
            if (
                ext.id === chrome.runtime.id ||
                ! ext.enabled && config.extensions.onlyDisable ||
                ! ext.mayDisable ||
                config.extensions.id.allowed.includes(ext.id) ||
                Extension.exceptions[ext.id] ||
                ext.installType === "admin" ||
                (config.extensions.allowSideloading || ! Extension.#SIDELOAD_TYPES.includes(ext.installType)) && config.extensions.id.allowed.includes("*")
            ) continue

            if (config.extensions.allowExisting) {
                logger.log(Date.now(), "extension", `extension kept`, ext.homepageUrl, Log.WARN, ext.id, `forbidden pre-existing extension '${ext.shortName}' (${ext.id}) was kept`)
                return
            }

            Notification.setAlert(Extension.TYPE, State.FAILING, t('extension-analysis.remove-modal.title'), t('extension-analysis.remove-modal.message'))

            const action = config.extensions.onlyDisable ? "disabled" : "removed"

            try {
                if (config.extensions.onlyDisable) {
                    await chrome.management.setEnabled(ext.id, false)
                } else {
                    await chrome.management.uninstall(ext.id, { showConfirmDialog: false })
                }
                logger.log(Date.now(), "extension", `extension ${action}`, ext.homepageUrl, Log.WARN, ext.id, `extension '${ext.shortName}' (${ext.id}) was ${action}`)
            } catch (err) {
                logger.log(Date.now(), "extension", `extension not ${action}`, ext.homepageUrl, Log.WARN, ext.id, `extension '${ext.shortName}' (${ext.id}) was unable to be ${action}`)
            }
        }
    }

    static {
        Extension.#exceptionsStorage.ready().then(exceptions => {
            Extension.exceptions = exceptions

            chrome.runtime.onStartup.addListener(Extension.#scanInstalledExtensions)
            chrome.runtime.onInstalled.addListener(Extension.#scanInstalledExtensions)
            chrome.management.onInstalled.addListener(Extension.#scanInstalledExtensions)
        })
    }

}