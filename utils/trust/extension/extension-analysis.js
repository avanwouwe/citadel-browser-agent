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

    static #blockPage(tabId, url) {
        tabState?.setState("ExtensionAnalysis", tabId, {
            url,
            logo: Logo.getLogo(),
            allowException: config.extensions.exceptions.allowed,
        })

        chrome.tabs.update(tabId, { url: chrome.runtime.getURL("gui/extension-analysis.html") })
    }
}