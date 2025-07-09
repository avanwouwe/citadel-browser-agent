class AppStats {

    static #APPLICATION_STATISTICS_KEY = 'application-statistics'
    static #APPSTATS = new PersistentObject(this.#APPLICATION_STATISTICS_KEY).value()

    static getOrCreateApp(appName) {
        const existingApp = this.#APPSTATS[appName]
        if (existingApp) {
            return existingApp
        }

        debug(`identified new application '${appName}'`)

        const today = nowDatestamp()
        return this.#APPSTATS.getOrSet(appName, {
            lastUsed: today,
            usage: {
                [today]: 1
            }
        })
    }

    static forURL(url) {
        assert(url, "must specify url")

        const appName = getSitename(url)

        return appName ? AppStats.forAppName(appName) : undefined
    }

    static forAppName(appName) {
        assert(appName, "must specify app name")

        return AppStats.#APPSTATS[appName]
    }

    static getAccount(app, username) {
        assert(app && username, "must specify app and username")

        const accounts = app.getOrSet("accounts", {})
        return accounts.getOrSet(username, { domain: getDomainFromUsername(username) })
    }

    static allApps() {
        return Object.entries(this.#APPSTATS)
    }

    static allAccounts(app) {
        const accounts = app.getOrSet("accounts", {})
        return Object.entries(accounts)
    }

    static deleteApp(appName) {
        assert(appName, "must specify app name")

        this.#APPSTATS.delete(appName)

        AppStats.markDirty()
    }

    static deleteAccount(app, username) {
        assert(app && username, "must specify app and username")

        const accounts = app.getOrSet("accounts", { })
        delete accounts[username]

        AppStats.markDirty()
    }

    static getUsage(app) {
        assert(app, "must specify app")

        return app.getOrSet('usage', { })
    }

    static markUsed(app) {
        app.lastUsed = nowDatestamp()

        AppStats.markDirty()
    }

    static markDirty() {
        this.#APPSTATS.isDirty = true
    }

    static clear() {
        // clear all storage except for application statistics
        const appStats = new PersistentObject(this.#APPLICATION_STATISTICS_KEY)
        chrome.storage.local.clear()
        appStats.markDirty()

        chrome.runtime.reload()
    }

    static incrementInteraction(url) {
        const appName = getSitename(url)
        if (!appName) {
            return
        }

        const app = AppStats.forAppName(appName)

        if (app) {
            const today = nowDatestamp()
            const usage = AppStats.getUsage(app)
            const currInteractionCount = usage.getOrSet(today, 0)
            app.lastUsed = today
            usage[today] = currInteractionCount + 1
            AppStats.markDirty()

            debug(`interaction with ${appName}`)
        }
    }
}
