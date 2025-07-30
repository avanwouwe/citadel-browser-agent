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
            Notification.enable(type, title, message)
        }

        Notification.#updateState()
    }

    static acknowledge(type) {
        const alert = Notification.#alerts[type]
        if (!alert) return

        alert.acknowledged = true
        Notification.#updateState()

        Tabs.get(Array.from(alert.tabs))
            .then(tabs => tabs.forEach(tab => {
                Modal.removeFromTab(tab.id)
                Notification.showIfRequired(tab.url, tab.id)
            }))

        chrome.notifications.clear(type)
        alert.tabs = new Set()
    }

    static async showIfRequired(url, tabId) {
        if (!url || ! tabId) return false

        const alert = Notification.showing
        if (! alert ) {
            return false
        }

        const hostname = url.toURL()?.hostname
        const isProtected = matchDomain(hostname, config.company.applications) || matchDomain(hostname, config.company.domains)
        if (!isProtected) return false

        const onAcknowledge = { type: 'acknowledge-alert', alert }
        let onException
        if (alert.level === DeviceTrust.State.BLOCKING) {
            const blockedOverPassword = AccountTrust.failingAccounts(hostname)?.some(a => a?.report?.state === DeviceTrust.State.BLOCKING)
            if (blockedOverPassword) return false

            if (config.devicetrust.exceptions.duration > 0 && matchDomain(hostname, config.devicetrust.exceptions.domains)) {
                onException = { type: 'allow-alert', alert }
            }
        }

        alert.tabs.add(tabId)
        await Modal.createForTab(tabId, alert.notification.title, alert.notification.message, onAcknowledge, onException)
        return true
    }

    static #sinceLastNotification(type) {
        const lastNotification = Notification.#alerts.getOrSet(type, {}).lastNotification
        return Date.now() - lastNotification
    }

    static enable(type, title, message) {
        const notification = {
            type: "basic",
            iconUrl: Logo.getLogo(),
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

        Notification.#updateState()
    }

    static #updateState() {
        Notification.showing = undefined
        let worstAlert = { level: DeviceTrust.State.PASSING }
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
