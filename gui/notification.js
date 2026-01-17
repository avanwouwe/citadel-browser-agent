class Notification {
    static #alerts = {}
    static #tabs = new Set()
    static showing
    static #persistence

    static async init() {
        Notification.#persistence = Notification.#persistence ?? new HydratedObject(
            'notifications',
            Notification,
            (data, target) => {
                target.#alerts = data.alerts ?? {}
                Notification.#updateState()
            },
            (target) => ({
                alerts: target.#alerts
            })
        )

        await Notification.#persistence.ready()
    }

    static setAlert(type, level, title, message) {
        if (level === State.PASSING) {
            delete Notification.#alerts[type]
            Notification.#updateState()
            return
        }

        // if the alert escalated, raise it to the attention of the user even if it was acknowledged before
        // and if the alert was showing and it de-escalated, it likely was because the user did something, so acknowledge
        const alert = Notification.#getOrCreateAlert(type)
        const currLevel = State.indexOf(alert.level)
        const newLevel = State.indexOf(level)
        if (newLevel > currLevel) {
            Notification.#setAcknowledge(alert, false)
        } else if (newLevel < currLevel && Notification.showing?.type === type) {
            Notification.#setAcknowledge(alert, true)
        }
        alert.level = level
        alert.notification = { title, message }

        Notification.#updateState()
    }

    static acknowledge(type, forMinutes) {
        const alert = Notification.#alerts[type]
        if (!alert) return

        alert.acknowledged = true

        const now = Date.now()
        if (forMinutes) {
            alert.acknowledgeExpiry = now + forMinutes * ONE_MINUTE
        } else {
            if (alert.level === State.FAILING) alert.acknowledgeExpiry = now + 7 * ONE_DAY
            else if (alert.level === State.WARNING) alert.acknowledgeExpiry = now + 1 * ONE_DAY
            else if (alert.level === State.BLOCKING) alert.acknowledgeExpiry = now + 1 * ONE_MINUTE
            else alert.acknowledgeExpiry = Infinity
        }

        Notification.#updateState()
    }

    static async showIfRequired(url, tabId) {
        if (!url || !tabId) return false

        Notification.#checkExpiredAcknowledgements()

        const alert = Notification.#alerts[Notification.showing?.type]
        if (!alert) return false

        const hostname = url.toURL()?.hostname
        const isProtected = matchDomain(hostname, config.company.applications) || matchDomain(hostname, config.company.domains)
        if (!isProtected) return false

        // if the issue related to the password of a site, don't block that site so the user can connect to correct the issue
        if (alert.type === AccountTrust.TYPE && alert.level === State.BLOCKING) {
            const blockedOverPassword = AccountTrust.getStatus(hostname)?.some(a => a?.report?.state === State.BLOCKING)
            if (blockedOverPassword) return false
        }

        const exceptions = config[alert.type]?.exceptions
        const onAcknowledge = { type: 'acknowledge-alert', alert }
        const onException = (alert.level === State.BLOCKING && exceptions?.duration > 0 && matchDomain(hostname, exceptions?.domains)) ? { type: 'allow-alert', alert } : undefined

        await Modal.createForTab(tabId, alert.notification.title, alert.notification.message, onAcknowledge, onException)
        Notification.#tabs.add(tabId)
        return true
    }

    static #checkExpiredAcknowledgements() {
        let acknowledgeExpired = false
        const now = Date.now()

        for (const alert of Object.values(Notification.#alerts)) {
            if (alert.acknowledgeExpiry < now) {
                Notification.#setAcknowledge(alert, false)
                acknowledgeExpired = true
            }
        }

        if (acknowledgeExpired) {
            this.#updateState()
        }
    }

    static #updateState() {
        Notification.#checkExpiredAcknowledgements()

        const prevAlert = Notification.showing
        Notification.showing = undefined

        // find both the worst alert, and the worst alert that is not acknowledged (i.e. 'showing')
        let worstAlert = { level: State.PASSING }
        for (const alert of Object.values(Notification.#alerts)) {
            const alertLevel = State.indexOf(alert.level)
            const worstAlertLevel = State.indexOf(worstAlert.level)

            if (alertLevel < worstAlertLevel) continue
            worstAlert = alert
            if (!alert.acknowledged && (!prevAlert || alert.type === prevAlert.type || alertLevel > worstAlertLevel)) {
                Notification.showing = { type: alert.type, level: alert.level }
            }
        }

        Notification.#updateBadge(worstAlert)

        if (prevAlert?.type === Notification.showing?.type && prevAlert?.level === Notification.showing?.level) {
            return
        }

        const clearModals = !Notification.showing || prevAlert?.type !== Notification.showing.type
        Notification.#updateInterface(clearModals)

        Notification.#persistence?.save()
    }

    static #updateBadge(worstAlert) {
        const warning = State.indexOf(State.WARNING)
        if (State.indexOf(worstAlert.level) >= warning) {
            chrome.action.setBadgeText({ text: "⚠️" })
            chrome.action.setBadgeBackgroundColor({ color: "#FF0000" })
        } else {
            chrome.action.setBadgeText({ text: "" })
            chrome.action.setBadgeBackgroundColor({ color: "#808080" })
        }
    }


    static #updateInterface(clearModals = false) {
        chrome.notifications.getAll()
            .then(notifications => Object.keys(notifications)
                .forEach(notification => chrome.notifications.clear(notification)))

        const alert = Notification.#alerts[Notification.showing?.type]

        if (alert) {
            const notification = {
                type: "basic",
                iconUrl: Logo.getLogo(),
                title: alert.notification.title,
                message: alert.notification.message
            }

            if (Browser.version.brand !== Browser.Firefox) {
                notification.requireInteraction = true
            }

            chrome.notifications.create(alert.type, notification)
        }

        Tabs.get(Array.from(Notification.#tabs))
            .then(tabs => tabs.forEach(tab => {
                Modal.removeFromTab(tab.id)
                    .then(() => {
                        if (!alert || clearModals) Notification.#tabs.clear()
                        Notification.showIfRequired(tab.url, tab.id)
                    })
                    .catch(err => console.trace(err))
            }))
    }

    static #setAcknowledge(alert, isAcknowledged) {
        if (isAcknowledged) {
            alert.acknowledged = true
            alert.acknowledgeExpiry = Infinity
        } else {
            alert.acknowledged = false
            alert.acknowledgeExpiry = Date.now()
        }
    }

    static #getOrCreateAlert(type) {
        return type ? Notification.#alerts.getOrSet(type, {
            type,
            level: State.PASSING,
            acknowledged: false,
            acknowledgeExpiry: Infinity,
        }) : undefined
    }
}