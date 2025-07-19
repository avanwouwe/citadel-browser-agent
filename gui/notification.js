class Notification {
    static #alerts = { }
    static showing

    static setAlert(type, level, title, message) {
        if (level === DeviceTrust.State.PASSING) {
            Notification.acknowledge(type)
            delete Notification.#alerts[type]
            return
        }

        const alert = Notification.#getAlert(type)
        if (DeviceTrust.State.indexOf(level) > DeviceTrust.State.indexOf(alert.level)) {
            alert.lastNotification = 0
            alert.acknowledged = false
        }
        alert.level = level

        const sinceLastNotification = Notification.#sinceLastNotification(type)
        if (
            alert.level === DeviceTrust.State.FAILING && sinceLastNotification >= 7 * ONE_DAY||
            alert.level === DeviceTrust.State.WARNING && sinceLastNotification >= 1 * ONE_DAY ||
            alert.level === DeviceTrust.State.BLOCKING && sinceLastNotification >= 1 * ONE_DAY
        ) {
            Notification.#showNotification(type, title, message)
        }

        Notification.#updateState()
    }

    static acknowledge(type) {
        const alert = Notification.#alerts[type]

        if (alert) {
            alert.acknowledged = true

            Tabs.get(Array.from(alert.tabs))
                .then(tabs => tabs.forEach(tab => {
                    Modal.removeFromTab(tab.id)
                    Notification.showIfRequired(tab.url, tab.id)
                }))

            alert.tabs = new Set()

            chrome.notifications.clear(type)
        }

        Notification.#updateState()
    }

    static showIfRequired(url, tabId) {
        if (!url || ! tabId) return false

        const alert = Notification.showing
        if (! alert ) {
            return false
        }

        const hostname = url.toURL()?.hostname
        const isProtected = matchDomain(hostname, config.company.applications)
        if (isProtected) {
            alert.tabs.add(tabId)

            const onAcknowledge = {
                type: 'acknowledge-alert',
                alertType: alert.type
            }

            Modal.createForTab(tabId, alert.notification.title, alert.notification.message, onAcknowledge)
        }
    }

    static #sinceLastNotification(type) {
        const lastNotification = Notification.#alerts.getOrSet(type, {}).lastNotification
        return Date.now() - lastNotification
    }

    static #showNotification(type, title, message) {
        const notification = {
            type: "basic",
            iconUrl: config.company.logo,
            title: title,
            message: message
        }

        if (Browser.version.brand !== Browser.Firefox) {
            notification.requireInteraction = true
        }

        chrome.notifications.create(type, notification)

        const alert = Notification.#getAlert(type)
        alert.notification = notification
        alert.lastNotification = Date.now()
        alert.acknowledged = false
    }

    static #updateState() {
        Notification.showing = undefined
        let worstAlert = Notification.#getAlert()
        for (const alert of Object.values(Notification.#alerts)) {
            if (DeviceTrust.State.indexOf(alert.level) >= DeviceTrust.State.indexOf(worstAlert.level)) {
                if (! alert.acknowledged) {
                    Notification.showing = alert
                }
                worstAlert = alert
            }
        }

        const level = worstAlert.level
        const warning = DeviceTrust.State.indexOf(DeviceTrust.State.WARNING)

        if (DeviceTrust.State.indexOf(level) >= warning) {
            chrome.action.setBadgeText({ text: "⚠️" })
            chrome.action.setBadgeBackgroundColor({ color: "#FF0000" })
        } else {
            chrome.action.setBadgeText({ text: "" })
            chrome.action.setBadgeBackgroundColor({ color: "#808080" })
        }
    }

    static #getAlert(type) {
        return Notification.#alerts.getOrSet(type, {
            type,
            lastNotification: 0,
            level: DeviceTrust.State.PASSING,
            acknowledged: false,
            tabs: new Set()
        })
    }
}
