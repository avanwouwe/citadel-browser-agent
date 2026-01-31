class ExtensionAnalysis {

    static #APPROVED_CACHE_SIZE = 100

    static approved = []

    static async startWeb(tabId, url) {
        Config.assertIsLoaded()

        const extensionId = await ExtensionStore.extensionIdOf(url)

        if (
            !extensionId ||
            evaluateBlacklist(extensionId, config.extensions.id.allowed, config.extensions.id.forbidden, false) ||
            Extension.exceptions[extensionId] ||
            ExtensionAnalysis.approved.includes(extensionId) ||
            await Extension.isInstalled(extensionId)
        ) {
            return
        }

        ExtensionAnalysis.#blockPage(tabId, url)
    }

    static async startOffscreen(url) {
        if (!await chrome.offscreen.hasDocument()) {
            await chrome.offscreen.createDocument({
                url: '/gui/extension-analysis.html',
                reasons: ['DOM_PARSER'],
                justification: 'retrieve extension store information'
            })
        }

        const analysis = await sendMessagePromise('ANALYZE_EXTENSION', {
            storePage: url,
            logo: Logo.getLogo(),
            config
        })

        await chrome.offscreen.closeDocument()

        return analysis
    }

    static async approve(tabId, url) {
        const extensionId = await ExtensionStore.extensionIdOf(url)
        ExtensionAnalysis.approved.push(extensionId)
        ExtensionAnalysis.approved.length = ExtensionAnalysis.#APPROVED_CACHE_SIZE
        navigateTo(tabId, url)
    }

    static async analyzeInstalled() {
        const config = await Config.ready()

        for (const ext of await chrome.management.getAll()) {
            if (await ExtensionAnalysis.isAllowed(ext)) continue

            if (config.extensions.allowExisting) {
                logger.log(Date.now(), "extension", `extension kept`, ext.storePage, Log.WARN, ext.id, `forbidden pre-existing extension '${ext.name}' (${ext.id}) was kept`)
                continue
            }

            await Extension.disable(ext, config)
        }
    }

    static async analyze(extensionInfo) {
        const config = await Config.ready()

        if (await ExtensionAnalysis.isAllowed(extensionInfo)) return

        await Extension.disable(extensionInfo, config)
    }

    static #SIDELOAD_TYPES = ["development", "sideload"]

    static async isAllowed(extensionInfo) {
        if (
            extensionInfo.id === chrome.runtime.id ||
            ! extensionInfo.enabled && config.extensions.onlyDisable ||
            ! extensionInfo.mayDisable ||
            extensionInfo.type !== "extension" ||
            config.extensions.id.allowed.includes(extensionInfo.id) ||
            Extension.exceptions[extensionInfo.id] ||
            extensionInfo.installType === "admin" ||
            (config.extensions.allowSideloading || ! ExtensionAnalysis.#SIDELOAD_TYPES.includes(extensionInfo.installType)) && config.extensions.id.allowed.includes("*")
        ) return true

        const store = ExtensionStore.of(extensionInfo.updateUrl) ?? (Browser.version.brand === Browser.Firefox ? ExtensionStore.Firefox : undefined)
        const storeUrl = await ExtensionStore.pageOf(extensionInfo.id, store)
        const analysis = await ExtensionAnalysis.startOffscreen(storeUrl)

        return analysis.evaluation.allowed
    }

    static #blockPage(tabId, url) {
        tabState?.setState("ExtensionAnalysis", tabId, {
            url,
            logo: Logo.getLogo(),
            config,
        })

        chrome.tabs.update(tabId, { url: chrome.runtime.getURL("gui/extension-analysis.html") })
    }

    static fetch(storeUrl, config) {
        const scan = {}
        scan.storeInfo = ExtensionStore.fetchStoreInfo(storeUrl)

        scan.manifest = scan.storeInfo.then(storeInfo => fetch(storeInfo.downloadUrl))
            .then(async response => {
            if (!response.ok) throw new Error("unable to download extension: " + response.status)

            const buffer = await response.arrayBuffer()
            const entries = await ExtensionStore.parsePackage(buffer)
            return await ExtensionStore.getManifest(entries)
        })

        scan.evaluation = ExtensionAnalysis.#evaluateExtension(scan.storeInfo, scan.manifest, config)

        return scan
    }

    static async #evaluateExtension(storeInfo, manifest, config) {
        storeInfo = await storeInfo
        manifest = await manifest

        const evaluation = {}
        evaluation.permissionCheck = ExtensionAnalysis.#evaluatePermissions(manifest, config)
        evaluation.scores = this.#evaluateRisk(storeInfo, manifest)

        // TODO temporarily turn off risk analysis since it is not yet implemented
        const scores = evaluation.scores
        scores.global = scores.global ?? 0
        scores.impact = scores.impact ?? 0
        scores.likelihood = scores.likelihood ?? 0

        const extConfig = config.extensions
        const rejection = {}

        const allowId = this.#evaluateBlacklist(storeInfo.id, extConfig.id.allowed, extConfig.id.forbidden, true)
        const allowCategory = this.#evaluateBlacklist(storeInfo.categories.flatMap(c => [c.primary, c.secondary]), extConfig.category.allowed, extConfig.category.forbidden, true)
        const allowVerified = !extConfig.verified.required || storeInfo.isVerifiedPublisher || storeInfo.isVerifiedExtension
        const allowInstallationCnt = storeInfo.numInstalls >= extConfig.installations.required ?? 0
        const allowRating = storeInfo.rating >= (extConfig.ratings.minRatingLevel ?? 0) && storeInfo.numRatings >= (extConfig.ratings.minRatingCnt ?? 0)

        if (!allowId) {
            rejection.reason = 'blacklist-extension'
        } else if (!allowCategory) {
            rejection.reason = 'blacklist-category'
        } else if (evaluation.scores.global == null || evaluation.scores.global > extConfig.risk.maxGlobal) {
            rejection.reason = 'risk-global'
        } else if (evaluation.scores.impact == null || evaluation.scores.impact > extConfig.risk.maxImpact) {
            rejection.reason = 'risk-impact'
        } else if (evaluation.scores.likelihood == null || evaluation.scores.likelihood > extConfig.risk.maxLikelihood) {
            rejection.reason = 'risk-likelihood'
        } else if (!allowVerified) {
            rejection.reason = 'not-verified'
        } else if (!allowInstallationCnt) {
            rejection.reason = 'installation-count'
        } else if (!allowRating) {
            rejection.reason = 'poor-rating'
        } else if (!evaluation.permissionCheck.allowPermissions) {
            rejection.reason = 'forbidden-permission'
            rejection.example = evaluation.permissionCheck.blockingPermissions[0]
        } else if (!evaluation.permissionCheck.allowAllDomains) {
            rejection.reason = 'all-domains'
            rejection.example = evaluation.permissionCheck.broadHostPermissions[0]
        } else if (!evaluation.permissionCheck.allowProtectedDomains) {
            rejection.reason = 'protected-domain'
            rejection.example = evaluation.permissionCheck.protectedDomains[0]
        }

        const bypassVerified = extConfig.verified.allowed && (storeInfo.isVerifiedPublisher || storeInfo.isVerifiedExtension)
        const bypassInstallationCnt = storeInfo.numInstalls >= extConfig.installations.allowed

        evaluation.allowed = !rejection.reason || bypassVerified || bypassInstallationCnt

        if(!evaluation.allowed) {
            evaluation.rejection = rejection
        }

        return evaluation
    }

    static #evaluatePermissions(manifest, config) {
        const protectedDomains = ExtensionAnalysis.#canAccessProtected(manifest, config, 1)
        const extConfig = config.extensions.permissions

        const permissions = [
            ...manifest.permissions,
            ...(extConfig.permissions.analyzeOptional ? manifest.optional_permissions : [])
        ]

        const host_permissions = [
            ...manifest.host_permissions,
            ...manifest.manifest_version === 2 ? manifest.permissions : [],
            ...(extConfig.hostPermissions.analyzeOptional ? manifest.optional_host_permissions : [])
        ]

        const broadHostPermissions = [...permissions, ...host_permissions].filter(permission => this.#broadHostPatterns.includes(permission))
        const isBroad = broadHostPermissions.length > 0

        if (isBroad && !permissions.includes("<all_urls>")) {
            permissions.push("<all_urls>")
        }

        if (manifest.manifest_version === 2 && manifest.permissions.includes("tabs")) {
            permissions.push("scripting")
        }

        const blockingPermissions = permissions.filter(permission =>
            extConfig.permissions.forbidden.includes(permission) ||
            (extConfig.permissions.requireSpecific.includes(permission) && isBroad)
        )

        const allowPermissions = blockingPermissions.length === 0
        const allowAllDomains = !extConfig.hostPermissions.requireSpecific || !isBroad
        const allowProtectedDomains = extConfig.hostPermissions.allowProtected || protectedDomains.length === 0
        const allowed = allowPermissions && allowAllDomains

        return { allowed, allowPermissions, allowAllDomains, allowProtectedDomains, blockingPermissions, broadHostPermissions, protectedDomains, isBroad, effectivePermissions: permissions }
    }

    static #canAccessProtected(manifest, config, maxMatches = 5) {
        const permissions = Extension.Permissions.values()
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

    static #broadHostPatterns = ['<all_urls>', '*://*/*', 'http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*', 'file://*/*']

    static #evaluateBlacklist(entry, whitelist, blacklist, defaultValue) {
        if (Array.isArray(entry)) return entry.every(item => evaluateBlacklist(item, whitelist, blacklist, defaultValue))

        assert(isString(entry), "entry must be a string")
        assert(Array.isArray(whitelist), "whitelist must be an array")
        assert(Array.isArray(blacklist), "blacklist must be an array")

        if (blacklist.includes(entry)) return false
        if (whitelist.includes(entry) || whitelist.includes("*")) return true
        if (blacklist.includes("*")) return false
        return defaultValue
    }

    static #evaluateRisk(storeInfo, manifest, staticAnalysis) {
        return { likelihood: null, impact: null , global: null }
    }
}