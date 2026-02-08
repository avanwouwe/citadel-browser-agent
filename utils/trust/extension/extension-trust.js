class ExtensionTrust {

    static #analysisStorage = new PersistentObject("extensions-accepted")

    static {
        ExtensionTrust.#analysisStorage.ready().then(() => {
            chrome.management.onInstalled.addListener(async extensionInfo => ExtensionAnalysis.Headless.ofExtension(extensionInfo, ExtensionAnalysis.ScanType.INSTALL))
            chrome.management.onEnabled.addListener(async extensionInfo => ExtensionAnalysis.Headless.ofExtension(extensionInfo, ExtensionAnalysis.ScanType.ENABLE))
        })
    }

    static async analysisOf(extensionId) {
        const storage = await ExtensionTrust.#analysisStorage.ready()
        return storage.value()[extensionId]
    }

    static async getStatus() {
        const storage = await ExtensionTrust.#analysisStorage.ready()

        const extensions = Object.entries(storage.value())
            .filter(([id, _]) => id !== "isDirty")
            .map(([id, extension]) => {
                extension.state = extension.evaluation.allowed ? State.PASSING : State.WARNING
                return [id, extension]
            })
        return extensions
    }

    static async isAllowed(extensionId) {
        const analysis = await ExtensionTrust.analysisOf(extensionId)

        return analysis?.allowed || analysis?.pending || false
    }

    static async allow(analysis) {
        const storage = await ExtensionTrust.#analysisStorage.ready()

        storage.value()[analysis.storeInfo.id] = analysis

        await ExtensionTrust.flush()
    }

    static async flush() {
        ExtensionTrust.#analysisStorage.markDirty()
        await ExtensionTrust.#analysisStorage.flush()
    }

}