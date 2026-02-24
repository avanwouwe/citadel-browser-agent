class ExtensionTrust {

    static #storage = new PersistentObject("extensions")

    static {
        ExtensionTrust.#storage.ready().then(() => {
            chrome.management.onInstalled.addListener(async extensionInfo => ExtensionAnalysis.Headless.ofExtension(extensionInfo, ExtensionAnalysis.ScanType.INSTALL))
            chrome.management.onEnabled.addListener(async extensionInfo => ExtensionAnalysis.Headless.ofExtension(extensionInfo, ExtensionAnalysis.ScanType.ENABLE))
            chrome.management.onUninstalled.addListener(() => Dashboard.refreshExtension())
        })
    }

    static async #get(extensionId) {
        const storage = await ExtensionTrust.#storage.ready()
        return storage.value()[extensionId]
    }

    static async #set(analysis) {
        const storage = await ExtensionTrust.#storage.ready()

        analysis = cloneDeep(analysis)

        storage.value()[analysis.storeInfo.id] = analysis

        ExtensionTrust.#storage.markDirty()
    }

    static async analysisOf(extensionId) {
        const analysis = await ExtensionTrust.#get(extensionId)
        return cloneDeep(analysis)
    }

    static async getStatus() {
        const storage = await ExtensionTrust.#storage.ready()
        const analyses = cloneDeep(await storage.value())
        delete analyses.isDirty

        await Promise.all(
            Object.values(analyses).map(async analysis => {
                analysis.isInstalled = await Extension.isInstalled(analysis.storeInfo.id)
                analysis.issues = serializeToText(ExtensionAnalysis.issuesOf(analysis))
            })
        )

        return analyses
    }

    static async isAllowed(extensionId) {
        const analysis = await ExtensionTrust.#get(extensionId)

        return analysis != null && analysis.state !== State.BLOCKING
    }

    static async allow(analysis) {
        await ExtensionTrust.#set(analysis)
        await ExtensionTrust.setState(analysis.storeInfo.id, State.PASSING)

        Dashboard.refreshExtension()
    }

    static async block(analysis) {
        const prevAnalysis = await ExtensionTrust.#get(analysis.storeInfo.id)

        if (!prevAnalysis) await ExtensionTrust.#set(analysis)

        await ExtensionTrust.setState(analysis.storeInfo.id, State.BLOCKING)

        Dashboard.refreshExtension()

        Notification.setAlert(Extension.TYPE, State.FAILING, t('extension-analysis.disable-modal.title'), t('extension-analysis.disable-modal.message'))
    }

    static async delete(extensionId) {
        if (await Extension.isInstalled(extensionId)) return

        const storage = await ExtensionTrust.#storage.ready()

        delete storage.value()[extensionId]

        Dashboard.refreshExtension()
    }

    static async setState(extensionId, state) {
        assert(State.values.includes(state), `unknown state type ${state}`)

        const analysis = await ExtensionTrust.#get(extensionId)
        if (!analysis) return

        analysis.state = state

        if (state !== State.UNKNOWN) {
            const isEnabled = await Extension.isEnabled(extensionId)
            const isAllowed = state !== State.BLOCKING
            if (isEnabled && !isAllowed) await Extension.disable(extensionId)
        }

        ExtensionTrust.#storage.markDirty()
        Dashboard.refreshExtension()
    }

    static async flush() {
        await ExtensionTrust.#storage.flush()
    }

}