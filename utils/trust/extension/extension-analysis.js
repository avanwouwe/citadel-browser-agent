class ExtensionAnalysis {

    static async start(tabId, url) {
        const extensionId = ExtensionStore.extensionIdOf(url)

        if (
            !extensionId ||
            config.extensions.id.allowed.includes("*") ||
            config.extensions.id.allowed.includes(extensionId) ||
            await Extension.isInstalled(extensionId)
        ) {
            return
        }

        ExtensionAnalysis.#blockPage(tabId, url)
    }

    static calculateRisk(storeInfo, manifest, staticAnalysis) {
        return { likelihood: 10.0, impact: 2.0 , global: 2.0 }
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