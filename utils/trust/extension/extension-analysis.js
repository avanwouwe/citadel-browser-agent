class ExtensionAnalysis {

    static #APPROVED_CACHE_SIZE = 100

    static approved = []

    static async showStorePage(tabId, url) {
        const extensionId = await ExtensionStore.extensionIdOf(url)
        ExtensionAnalysis.approved.unshift(extensionId)
        ExtensionAnalysis.approved.length = ExtensionAnalysis.#APPROVED_CACHE_SIZE
        navigateTo(tabId, url)
    }

    static ScanType = class {
        static INTERACTIVE = "interactive"
        static INIT = "init"
        static PERIODIC = "periodic"
        static INSTALL = "install"
        static UPDATE = "update"
        static ENABLE = "enable"
    }

    static Interactive = class {

        static async start(tabId, url) {
            Config.assertIsLoaded()

            const extensionId = await ExtensionStore.extensionIdOf(url)

            if (
                !extensionId ||
                evaluateBlacklist(extensionId, config.extensions.whitelist.allowInstall, config.extensions.blacklist, false) ||
                await ExtensionTrust.isAllowed(extensionId) ||
                ExtensionAnalysis.approved.includes(extensionId) ||
                await Extension.isInstalled(extensionId)
            ) {
                return
            }

            ExtensionAnalysis.Interactive.#blockPage(tabId, url)
        }

        static #blockPage(tabId, url) {
            tabState?.setState("ExtensionAnalysis", tabId, {
                url,
                logo: Logo.getLogo(),
                config,
            })

            chrome.tabs.update(tabId, { url: chrome.runtime.getURL("gui/extension-analysis.html") })
        }

    }

    static Headless = class {

        static queue = Promise.resolve()
        static isReady = false
        static debouncer = new Debouncer(200, (existing, incoming) => {
            // When installing we receive both INSTALL and ENABLE; merge into one INSTALL event
            const scanType = (existing.scanType === ExtensionAnalysis.ScanType.INSTALL ||
                incoming.scanType === ExtensionAnalysis.ScanType.INSTALL)
                ? ExtensionAnalysis.ScanType.INSTALL
                : incoming.scanType

            return { extensionInfo: incoming.extensionInfo, scanType }
        })

        static async #ensureOffscreen() {
            if (this.isReady) return

            if (!await chrome.offscreen.hasDocument()) {
                await chrome.offscreen.createDocument({
                    url: '/gui/extension-analysis.html',
                    reasons: ['DOM_PARSER'],
                    justification: 'retrieve extension store information'
                })

                // Wait for offscreen page to be ready
                for (let i = 0; i < 10; i++) {
                    try {
                        await sendMessagePromise('PING', {})
                        this.isReady = true
                        return
                    } catch {
                        await new Promise(resolve => setTimeout(resolve, 100))
                    }
                }
                throw new Error('Offscreen document failed to initialize')
            }

            this.isReady = true
        }

        static async resolveAnalysis(promise) {
            const analysis = {}
            try {
                analysis.storeInfo = await promise.storeInfo
                analysis.manifest = await promise.manifest
                analysis.evaluation = await promise.evaluation
            } catch (exception) {
                this.findErrorType(exception, analysis)
            }

            return analysis
        }

        static findErrorType(exception, analysis) {
            console.trace(exception)
            const message = exception?.message || String(exception)

            let errorType = 'error'
            if (!analysis?.evaluation) errorType = 'error-evaluation'
            if (!analysis?.manifest) errorType = 'error-manifest'
            if (!analysis.storeInfo) errorType = 'error-store'
            if (message === "fetch error") errorType = 'error-network'

            analysis.evaluation = analysis.evaluation ?? {}
            analysis.evaluation.rejection = { reasons: [errorType] }
            analysis.evaluation.allowed = false
            return errorType
        }

        static async fetch(extensionInfo) {
            this.queue = this.queue.then(async () => {
                try {
                    const store = ExtensionStore.of(extensionInfo.updateUrl) ??
                        (Browser.version.brand === Browser.Firefox ? ExtensionStore.Firefox : undefined)

                    if (!store) return ExtensionAnalysis.Headless.#error(extensionInfo.id, "error-unknown-store")

                    const storePage = await ExtensionStore.pageOf(extensionInfo.id, store)

                    if (!storePage) return ExtensionAnalysis.Headless.#error(extensionInfo.id, "error-unknown-storepage")

                    if (Browser.version.brand === Browser.Firefox) {
                        const analysis = ExtensionAnalysis.promiseOf(storePage, config)
                        return await this.resolveAnalysis(analysis)
                    } else {
                        await this.#ensureOffscreen()
                        return await sendMessagePromise('ANALYZE_EXTENSION', {
                            storePage,
                            logo: Logo.getLogo(),
                            config
                        })
                    }
                } catch (error) {
                    console.error('Extension analysis failed:', error)
                    return ExtensionAnalysis.Headless.#error(extensionInfo.id, "error")
                } finally {
                    this.isReady = false
                    if (chrome.offscreen) {
                        try {
                            await chrome.offscreen.closeDocument()
                        } catch {}
                    }
                }
            })

            return this.queue
        }

        static #error(extensionId,error) {
            return {
                storeInfo: { id: extensionId },
                evaluation: {
                    allowed: false,
                    rejection: {
                        reasons: [error]
                    }
                }
            }
        }

        static async ofAllInstalled(isfirstAnalysis = false) {
            for (const ext of await chrome.management.getAll()) {
                const scanType = isfirstAnalysis ? ExtensionAnalysis.ScanType.INIT : ExtensionAnalysis.ScanType.PERIODIC
                await ExtensionAnalysis.Headless.ofExtension(ext, scanType)
            }
        }

        static async ofExtension(extensionInfo, scanType) {
            this.debouncer.debounce(
                extensionInfo.id,
                { extensionInfo, scanType },
                async data => this.#ofExtension(data.extensionInfo, data.scanType)
            )
        }

        static async #ofExtension(extensionInfo, scanType) {
            assert(scanType !== ExtensionAnalysis.ScanType.INTERACTIVE, "this method is not meant for interactive scans")
            if (extensionInfo.type !== "extension" || extensionInfo.id === chrome.runtime.id) return
            const config = await Config.ready()

            debug("analyzing extension", scanType, extensionInfo)

            const prevAnalysis = await ExtensionTrust.analysisOf(extensionInfo.id)

            if (prevAnalysis?.pending) scanType = ExtensionAnalysis.ScanType.INIT
            if (scanType === ExtensionAnalysis.ScanType.INSTALL && prevAnalysis) scanType = ExtensionAnalysis.ScanType.UPDATE

            if (config.extensions.whitelist.bundled.includes(extensionInfo.id)) {
                ExtensionAnalysis.#log('extension kept', 'bundled and kept', Log.INFO, extensionInfo, undefined, scanType)
                return
            }

            if (Extension.isSideloaded(extensionInfo)) {
                const analysis = { storeInfo: { id: extensionInfo.id } }
                if (config.extensions.allowSideloading) {
                    analysis.allowed = true
                    await ExtensionTrust.allow(analysis)
                    ExtensionAnalysis.#log('extension kept', 'side-loaded but allowed', Log.INFO, extensionInfo, undefined, scanType)
                } else if (config.extensions.whitelist.allowAlways.includes(extensionInfo.id)) {
                    analysis.allowed = true
                    await ExtensionTrust.allow(analysis)
                    ExtensionAnalysis.#log('extension kept', 'side-loaded but whitelisted', Log.INFO, extensionInfo, undefined, scanType)
                } else {
                    analysis.allowed = false
                    await ExtensionTrust.block(analysis)
                    ExtensionAnalysis.#log('extension disabled', 'side-loaded and therefore disabled', Log.WARN, extensionInfo, undefined, scanType)
                }
                return
            }

            const currAnalysis = await ExtensionAnalysis.Headless.fetch(extensionInfo)

            // if we were unable to recover the analysis (network issues, site down, etc)
            // - raise a warning
            // - plan for a new initial scan (if it is for the installation of the extension or other extensions)
            const error = currAnalysis.evaluation.rejection?.reasons.filter(reason => reason.startsWith("error"))
            if (error?.length > 0) {
                if (scanType === ExtensionAnalysis.ScanType.INIT || scanType === ExtensionAnalysis.ScanType.INSTALL) {
                    await ExtensionTrust.allow({
                        storeInfo: { id: extensionInfo.id },
                        pending: true,
                    })
                }

                await ExtensionTrust.setState(extensionInfo.id, State.UNKNOWN)
                ExtensionAnalysis.#log('extension unchecked', `not checked due to '${error[0]}'`, Log.WARN, extensionInfo, prevAnalysis, scanType)
                return
            }

            // if the extension was allowed, or was previously allowed and the risk did not increase, fine
            const riskIncrease = ExtensionAnalysis.riskIncrease(prevAnalysis, currAnalysis)
            if (currAnalysis.evaluation.allowed ||
                prevAnalysis?.evaluation?.allowed && riskIncrease.length === 0
            ) {
                const action = scanType === ExtensionAnalysis.ScanType.INSTALL ? "installed" : "kept"

                await ExtensionTrust.allow(currAnalysis)
                ExtensionAnalysis.#log(`extension ${action}`, `validated`, Log.INFO, extensionInfo, currAnalysis, scanType)
                return
            }

            // if it is refused, it can still be allowed in specific cases
            // 1) grandfathering of pre-existing extensions
            if (scanType === ExtensionAnalysis.ScanType.INIT && config.extensions.allowExisting) {
                await ExtensionTrust.allow(currAnalysis)
                ExtensionAnalysis.#log('extension kept', 'grandfathered', Log.WARN, extensionInfo, currAnalysis, scanType)
                return
            }

            // 2) whitelisting
            let whitelistReason
            const isInstall = scanType === ExtensionAnalysis.ScanType.INSTALL || scanType === ExtensionAnalysis.ScanType.INIT
            if (config.extensions.whitelist.allowAlways.includes(extensionInfo.id)) whitelistReason = 'allowAlways'
            else if (isInstall && config.extensions.whitelist.allowInstall.includes(extensionInfo.id)) whitelistReason = 'allowInstall'

            if (whitelistReason) {
                await ExtensionTrust.allow(currAnalysis)
                ExtensionAnalysis.#log('extension kept', `whitelisted because '${whitelistReason}'`, Log.INFO, extensionInfo, currAnalysis, scanType)
                return
            }

            // if we arrive here, the extension presence, installation or update was too high risk should be disabled
            // if it was disabled anyway, just leave it disabled
            if (!extensionInfo.enabled) {
                await ExtensionTrust.block(currAnalysis)
                ExtensionAnalysis.#log('extension left disabled', `already disabled`, Log.INFO, extensionInfo, currAnalysis, scanType)
                return
            }

            // if it could not be disabled, it is probably admin-installed and should have been on the whitelist
            let unableReason
            if (!extensionInfo.installType === "admin") unableReason = 'admin installed'
            else if (!extensionInfo.mayDisable) unableReason = 'cannot disable'

            if (unableReason) {
                await ExtensionTrust.allow(currAnalysis)
                await ExtensionTrust.setState(extensionInfo.id, State.FAILING)
                ExtensionAnalysis.#log('extension disable failed', `could not be disabled because '${unableReason}'`, Log.WARN, extensionInfo, currAnalysis, scanType)
                return
            }

            // otherwise, disable it
            await ExtensionTrust.block(currAnalysis)
            ExtensionAnalysis.#log('extension disabled', 'high risk and therefore disabled', Log.WARN, extensionInfo, currAnalysis, scanType)
        }
    }

    static issuesOf(analysis) {
        const evaluation = analysis?.evaluation
        const rejection = evaluation?.rejection

        return {
            isBroad: evaluation?.permissionCheck?.isBroad,
            blockingPermissions: evaluation?.permissionCheck?.blockingPermissions,
            protectedDomains: evaluation?.permissionCheck?.protectedDomains,
            reasons: rejection?.reasons
        }
    }

    static riskIncrease(prevAnalysis, currAnalysis) {
        assert(currAnalysis?.evaluation, "cannot analyse risk increase without current evaluation")
        const reasons = []

        if (!prevAnalysis || prevAnalysis.pending) return currAnalysis.evaluation.rejection?.reasons ?? reasons

        const prevEvaluation = prevAnalysis.evaluation
        const currEvaluation = currAnalysis.evaluation

        // diff of two arrays, only keep items that were added in the current set
        const arrayDiff = ((prev, curr) => curr ? curr.filter(elem => ! prev?.includes(elem)) : [])

        const newReasons = arrayDiff(prevEvaluation?.rejection?.reasons, currEvaluation?.rejection?.reasons)
        reasons.push(...newReasons)

        const newProtectedDomains= arrayDiff(prevEvaluation?.permissionCheck?.protectedDomains, currEvaluation.permissionCheck.protectedDomains)
        const newBlockingPermissions= arrayDiff(prevEvaluation?.permissionCheck?.blockingPermissions, currEvaluation.permissionCheck.blockingPermissions)

        if (newProtectedDomains.length > 0 && !currAnalysis.evaluation.isBroad && !reasons.includes("protected-domain")) reasons.push("protected-domain")
        if (newBlockingPermissions.length > 0 && !reasons.includes("forbidden-permission")) reasons.push("forbidden-permission")

        return reasons
    }

    static promiseOf(storePage, config) {
        const analysis = {}
        analysis.storeInfo = ExtensionStore.fetchStoreInfo(storePage)

        analysis.manifest = analysis.storeInfo.then(storeInfo => fetch(storeInfo.downloadUrl))
            .then(async response => {
                if (!response.ok) throw new Error("unable to download extension: " + response.status)

                const buffer = await response.arrayBuffer()
                const entries = await ExtensionStore.parsePackage(buffer)
                return await ExtensionStore.getManifest(entries)
            })

        analysis.evaluation = ExtensionAnalysis.#evaluateExtension(analysis.storeInfo, analysis.manifest, config)

        return analysis
    }

    static async #evaluateExtension(storeInfo, manifest, config) {
        storeInfo = await storeInfo
        manifest = await manifest

        const evaluation = {
            permissionCheck: ExtensionAnalysis.#evaluatePermissions(manifest, config),
            scores: this.#evaluateRisk(storeInfo, manifest),
            rejection: {
                reasons: []
            }
        }

        // TODO temporarily turn off risk analysis since it is not yet implemented
        const scores = evaluation.scores
        scores.global = scores.global ?? 0
        scores.impact = scores.impact ?? 0
        scores.likelihood = scores.likelihood ?? 0

        const extConfig = config.extensions
        const rejection = evaluation.rejection

        const blacklistExtension = !evaluateBlacklist(storeInfo.id, extConfig.whitelist.allowInstall, extConfig.blacklist, true)
        const blacklistCategory = !evaluateBlacklist(storeInfo.categories.flatMap(c => [c.primary, c.secondary]), [], extConfig.category.forbidden, true)
        const allowVerified = !extConfig.verified.required || storeInfo.isVerifiedPublisher || storeInfo.isVerifiedExtension
        const allowInstallationCnt = storeInfo.numInstalls >= extConfig.installations.required ?? 0
        const allowRating = storeInfo.rating >= (extConfig.ratings.minRatingLevel ?? 0) && storeInfo.numRatings >= (extConfig.ratings.minRatingCnt ?? 0)

        if (blacklistExtension) rejection.reasons.push('blacklist-extension')

        if (blacklistCategory) rejection.reasons.push('blacklist-category')

        if (evaluation.scores.global == null || evaluation.scores.global > extConfig.risk.maxGlobal) rejection.reasons.push('risk-global')

        if (evaluation.scores.impact == null || evaluation.scores.impact > extConfig.risk.maxImpact) rejection.reasons.push('risk-impact')

        if (evaluation.scores.likelihood == null || evaluation.scores.likelihood > extConfig.risk.maxLikelihood) rejection.reasons.push('risk-likelihood')

        if (!allowVerified) rejection.reasons.push('not-verified')

        if (!allowInstallationCnt) rejection.reasons.push('installation-count')

        if (!allowRating) rejection.reasons.push('poor-rating')

        if (!evaluation.permissionCheck.allowPermissions) rejection.reasons.push('forbidden-permission')
        if (rejection.reasons.length === 1) rejection.example = evaluation.permissionCheck.blockingPermissions[0]

        if (!evaluation.permissionCheck.allowAllDomains) rejection.reasons.push('all-domains')
        if (rejection.reasons.length === 1) rejection.example = evaluation.permissionCheck.broadHostPermissions[0]

        if (!evaluation.permissionCheck.allowProtectedDomains) rejection.reasons.push('protected-domains')
        if (rejection.reasons.length === 1) rejection.example = evaluation.permissionCheck.protectedDomains[0]

        const bypassVerified = extConfig.verified.allowed && (storeInfo.isVerifiedPublisher || storeInfo.isVerifiedExtension)
        const bypassInstallationCnt = storeInfo.numInstalls >= extConfig.installations.allowed

        evaluation.allowed = rejection.reasons.length === 0 || bypassVerified || bypassInstallationCnt

        return evaluation
    }

    static #evaluatePermissions(manifest, config) {
        const protectedDomains = ExtensionAnalysis.#canAccessProtected(manifest, config, 5)
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
        const allowed = allowPermissions && allowAllDomains && allowProtectedDomains

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

                if (domains.length >= maxMatches) {
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

    static #evaluateRisk(storeInfo, manifest, staticAnalysis) {
        return { likelihood: null, impact: null , global: null }
    }

    static #log(result, action, level, extensionInfo, analysis, scanType) {
        const storePage = analysis?.storeInfo?.storePage
        const logObj = ExtensionAnalysis.toLogObject(analysis ?? extensionInfo, scanType)
        logger.log(Date.now(), "extension", result, storePage, level, logObj, `extension '${extensionInfo.id}' was ${action} during ${scanType} scan`)
    }

    static toLogObject(input, scanType) {
        if (input.id && input.name) {
            const extensionInfo = input

            return {
                type: "extension",
                value: {
                    name: extensionInfo.name,
                    id: extensionInfo.id,
                    version: extensionInfo.version,
                    scanType
                }
            }
        }

        const analysis = input
        const evaluation = analysis.evaluation
        const rejection = evaluation?.rejection

        const score = evaluation?.scores?.global
        const rejectionReason = rejection ? rejection.reasons[0] : undefined
        const issues = serializeToText(ExtensionAnalysis.issuesOf(analysis))

        return {
            type: "extension",
            value: {
                name: analysis.storeInfo?.name,
                id: analysis.storeInfo?.id,
                version: analysis.manifest?.version,
                scanType,
                score: score != null ? Number(score).toFixed(1) : score,
                rejectionReason,
                issues,
            }
        }
    }
}