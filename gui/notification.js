class Notification {
    static #alerts = { }
    static showing

    static setAlert(type, level, title, message) {
        const currNotif = Notification.showing
        if (currNotif && currNotif.type === type && currNotif.level !== level) {
            Notification.acknowledge(type)
        }

        if (level === DeviceTrust.State.PASSING) {
            delete Notification.#alerts[type]
            Notification.#updateState()
            return
        }

        const alert = Notification.#getAlert(type)
        alert.level = level
        alert.notification = { title, message }

        if (DeviceTrust.State.indexOf(level) > DeviceTrust.State.indexOf(alert.level)) {
            Notification.#enable(type)
        }

        Notification.#updateState()
    }

    static acknowledge(type, forMinutes) {
        const alert = Notification.#alerts[type]
        if (!alert) return

        alert.acknowledged = true
        if (forMinutes) {
            alert.lastNotification = Date.now() + forMinutes * ONE_MINUTE
        }

        Notification.#updateState()

        chrome.notifications.clear(type)
        Tabs.get(Array.from(alert.tabs))
            .then(tabs => tabs.forEach(tab => {
                Modal.removeFromTab(tab.id)
                    .then(() => Notification.showIfRequired(tab.url, tab.id))
                    .catch(err => console.trace(err))
            }))

        alert.tabs.clear()
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
        if (alert.type === AccountTrust.TYPE && alert.level === DeviceTrust.State.BLOCKING) {
            // if the issue related to the password of a site, don't block that site so the user can connect to correct the issue
            const blockedOverPassword = AccountTrust.failingAccounts(hostname)?.some(a => a?.report?.state === DeviceTrust.State.BLOCKING)
            if (blockedOverPassword) return false

            const exceptions = config[alert.type].exceptions
            if (exceptions.duration > 0 && matchDomain(hostname, exceptions.domains)) {
                onException = { type: 'allow-alert', alert }
            }
        }

        await Modal.createForTab(tabId, alert.notification.title, alert.notification.message, onAcknowledge, onException)
        alert.tabs.add(tabId)
        return true
    }

    static #enable(type) {
        const alert = Notification.#getAlert(type)
        alert.lastNotification = Date.now()
        alert.acknowledged = false

        const notification = {
            type: "basic",
            iconUrl: Logo.getLogo(),
            title: alert.notification.title,
            message: alert.notification.message
        }

        if (Browser.version.brand !== Browser.Firefox) {
            notification.requireInteraction = true
        }

        chrome.notifications.create(type, notification)
    }

    static #updateState() {
        let worstAlert = { level: DeviceTrust.State.PASSING }
        const currAlert = Notification.showing
        const currAlertLevel = DeviceTrust.State.indexOf(currAlert?.level)

        Notification.showing = undefined

        for (const alert of Object.values(Notification.#alerts)) {
            const sinceLastNotification = Date.now() - alert.lastNotification
            if (
                alert.level === DeviceTrust.State.FAILING && sinceLastNotification >= 7 * ONE_DAY||
                alert.level === DeviceTrust.State.WARNING && sinceLastNotification >= 1 * ONE_DAY ||
                alert.level === DeviceTrust.State.BLOCKING && sinceLastNotification >= 1 * ONE_MINUTE
            ) {
                Notification.#enable(alert.type)
            }

            const alertLevel = DeviceTrust.State.indexOf(alert.level)
            if (alertLevel >= DeviceTrust.State.indexOf(worstAlert.level) && (alert === currAlert || alertLevel > currAlertLevel)) {
                if (! alert.acknowledged) {
                    Notification.showing = alert
                }
                worstAlert = alert
            }
        }

        const warning = DeviceTrust.State.indexOf(DeviceTrust.State.WARNING)

        if (DeviceTrust.State.indexOf(worstAlert.level) >= warning) {
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
