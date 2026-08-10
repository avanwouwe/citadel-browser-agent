class AlertSuppression {
    static #persistent = new PersistentObject("alert-suppression", {})
    static #queue = Promise.resolve()

    static ready() {
        return AlertSuppression.#persistent.ready()
    }

    static #serialized(fn) {
        const result = AlertSuppression.#queue.then(fn, fn)
        AlertSuppression.#queue = result.catch(() => {})
        return result
    }

    static suppressFor(site, alertType, durationMinutes) {
        return AlertSuppression.#serialized(async () => {
            await AlertSuppression.#persistent.ready()

            const key = JSON.stringify([site, alertType])

            AlertSuppression.#persistent.value()[key] = {
                ...(AlertSuppression.#persistent.value()[key] ?? {}),
                suppressedUntil: Date.now() + durationMinutes * ONE_MINUTE,
                reason: "user-trust"
            }

            await AlertSuppression.#persistent.flush()
        })
    }

    static isSuppressed(origin, alertType) {
        return AlertSuppression.#serialized(async () => {
            await AlertSuppression.#persistent.ready()

            const key = JSON.stringify([origin, alertType])
            const entry = AlertSuppression.#persistent.value()[key]

            return (entry?.suppressedUntil ?? 0) > Date.now()
        })
    }
}