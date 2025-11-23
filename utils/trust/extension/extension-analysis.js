class ExtensionAnalysis {

    static #APPROVED_CACHE_SIZE = 100

    static approved = []

    static async start(tabId, url) {
        const extensionId = ExtensionStore.extensionIdOf(url)

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

    static calculateRisk(storeInfo, manifest, staticAnalysis) {
        return { likelihood: null, impact: null , global: null }
    }

    static approve(tabId, url) {
        const extensionId = ExtensionStore.extensionIdOf(url)
        ExtensionAnalysis.approved.push(extensionId)
        ExtensionAnalysis.approved.length = ExtensionAnalysis.#APPROVED_CACHE_SIZE
        navigateTo(tabId, url)
    }

    static #blockPage(tabId, url) {
        tabState?.setState("ExtensionAnalysis", tabId, {
            url,
            logo: Logo.getLogo(),
            config: config.extensions,
        })

        chrome.tabs.update(tabId, { url: chrome.runtime.getURL("gui/extension-analysis.html") })
    }
}