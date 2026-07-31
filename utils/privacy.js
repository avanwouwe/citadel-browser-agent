class Privacy {

    static TYPE = "privacy"

    static #storage = new PersistentObject("privacy")

    static async init() {
        await Config.ready()

        if (config.isStandalone) return

        const storage = await Privacy.#storage.ready()

        if (storage.value().shown) return

        const title = t('privacy.modal.title')
        const message = t('privacy.modal.message', { organization: config.company.name })

        if (! await Privacy.wasAcknowledged())  Notification.setAlert("privacy", State.BLOCKING, title, message)
    }

    static async wasAcknowledged() {
        const storage = await Privacy.#storage.ready()
        return !!storage.value().shown
    }

    static async acknowledge() {
        const storage = await Privacy.#storage.ready()

        storage.value().shown = true

        Privacy.#storage.markDirty()
    }

    static async flush() {
        await Privacy.#storage.flush()
    }

}