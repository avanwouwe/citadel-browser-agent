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
        return { likelihood: 2.0, impact: 6.0 , global: 8.0 }
    }

    static #blockPage(tabId, url) {
        tabState?.setState("ExtensionAnalysis", tabId, {
            url,
            logo: Logo.getLogo(),
            allowException: config.extensions.exceptions.allowed,
        })

        chrome.tabs.update(tabId, { url: chrome.runtime.getURL("gui/extension-analysis.html") })
    }
}