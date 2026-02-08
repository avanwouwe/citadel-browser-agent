class ExtensionTrust {

    static #storage = new PersistentObject("extensions-accepted")

    static {
        ExtensionTrust.#storage.ready().then(() => {
            chrome.management.onInstalled.addListener(async extensionInfo => ExtensionAnalysis.Headless.ofExtension(extensionInfo, ExtensionAnalysis.ScanType.INSTALL))
            chrome.management.onEnabled.addListener(async extensionInfo => ExtensionAnalysis.Headless.ofExtension(extensionInfo, ExtensionAnalysis.ScanType.ENABLE))
        })
    }

    static async analysisOf(extensionId) {
        const storage = await ExtensionTrust.#storage.ready()
        return storage.value()[extensionId]
    }

    static async getStatus() {
        const storage = await ExtensionTrust.#storage.ready()

        return Object.entries(storage.value())
            .filter(([id, _]) => id !== "isDirty")
    }

    static async isAllowed(extensionId) {
        const analysis = await ExtensionTrust.analysisOf(extensionId)

        return analysis || false
    }

    static async allow(analysis) {
        const storage = await ExtensionTrust.#storage.ready()

        analysis = cloneDeep(analysis)
        analysis.state = State.PASSING

        storage.value()[analysis.storeInfo.id] = analysis

        await ExtensionTrust.flush()
    }

    static async disallow(extensionId) {
        const storage = await ExtensionTrust.#storage.ready()

        delete storage.value()[extensionId]

        await ExtensionTrust.flush()
    }

    static async disable(extensionId) {
        await Extension.disable(extensionId)
        Notification.setAlert(Extension.TYPE, State.FAILING, t('extension-analysis.disable-modal.title'), t('extension-analysis.disable-modal.message'))

        const analysis = await ExtensionTrust.analysisOf(extensionId)
        if (analysis) {
            analysis.state = State.BLOCKING
            await ExtensionTrust.flush()
        }
    }

    static async flush() {
        ExtensionTrust.#storage.markDirty()
        await ExtensionTrust.#storage.flush()
    }

}