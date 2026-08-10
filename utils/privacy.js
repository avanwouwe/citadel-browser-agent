class Privacy {

    static TYPE = "privacy"

    static #storage = new PersistentObject("privacy")

    static async init() {
        await Config.ready()
        await Notification.init()

        if (config.isStandalone || await Privacy.wasAcknowledged()) return

        const title = t('privacy.modal.title')
        const message = t('privacy.modal.message', { organization: config.organization.name })
        Notification.setAlert("privacy", State.BLOCKING, title, message)
    }

    static async wasAcknowledged() {
        const storage = await Privacy.#storage.ready()
        return !!storage.value().shown
    }

    static async acknowledge() {
        Notification.setAlert(Privacy.TYPE, State.PASSING)

        const storage = await Privacy.#storage.ready()

        storage.value().shown = true

        Privacy.#storage.markDirty()
    }

    static async flush() {
        await Privacy.#storage.flush()
    }

}