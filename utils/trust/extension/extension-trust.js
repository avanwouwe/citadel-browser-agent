class ExtensionTrust {

    static #storage = new PersistentObject("extensions-accepted")

    static {
        ExtensionTrust.#storage.ready().then(() => {
            chrome.management.onInstalled.addListener(async extensionInfo => ExtensionAnalysis.Headless.ofExtension(extensionInfo, ExtensionAnalysis.ScanType.INSTALL))
            chrome.management.onEnabled.addListener(async extensionInfo => ExtensionAnalysis.Headless.ofExtension(extensionInfo, ExtensionAnalysis.ScanType.ENABLE))
        })
    }

    static async #analysisOf(extensionId) {
        const storage = await ExtensionTrust.#storage.ready()
        return storage.value()[extensionId]
    }

    static async analysisOf(extensionId) {
        const analysis = ExtensionTrust.#analysisOf(extensionId)
        return cloneDeep(analysis)
    }

    static async getStatus() {
        const storage = await ExtensionTrust.#storage.ready()
        const analyses = cloneDeep(await storage.value())
        delete analyses.isDirty
        Object.values(analyses).forEach(analysis => analysis.issues = serializeToText(ExtensionAnalysis.issuesOf(analysis)))

        return analyses
    }

    static async isAllowed(extensionId) {
        const analysis = await ExtensionTrust.#analysisOf(extensionId)

        return analysis || false
    }

    static async allow(analysis) {
        const storage = await ExtensionTrust.#storage.ready()

        analysis = cloneDeep(analysis)
        analysis.state = State.PASSING

        storage.value()[analysis.storeInfo.id] = analysis

        Dashboard.refreshExtension()
    }

    static async disallow(extensionId) {
        const storage = await ExtensionTrust.#storage.ready()

        delete storage.value()[extensionId]
    }

    static async disable(extensionId) {
        await Extension.disable(extensionId)
        Notification.setAlert(Extension.TYPE, State.FAILING, t('extension-analysis.disable-modal.title'), t('extension-analysis.disable-modal.message'))

        const analysis = await ExtensionTrust.#analysisOf(extensionId)
        if (analysis) {
            analysis.state = State.BLOCKING

            ExtensionTrust.#storage.markDirty()

            Dashboard.refreshExtension()
        }
    }

    static async flush() {
        await ExtensionTrust.#storage.flush()
    }

}