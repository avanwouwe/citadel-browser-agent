class AppStats {

    static #APPLICATION_STATISTICS_KEY = 'application-statistics'
    static #SITE_STATISTICS_KEY = 'site-statistics'

    static #SITESTATS = new PersistentObject(this.#SITE_STATISTICS_KEY).value()
    static #APPSTATS = new PersistentObject(this.#APPLICATION_STATISTICS_KEY).value()

    static forURL(url) {
        assert(url, "must specify url")

        const siteName = getSitename(url)
        const appName = this.#SITESTATS[siteName]?.appName

        return AppStats.forAppName(appName)
    }

    static forAppName(appName) {
        assert(appName, "must specify app name")

        return this.#APPSTATS.getOrSet(appName, {})
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

    static resetSitestats() {
        // reset daily counters interactions with sites not (yet) allocated to applications
        for (const stats of Object.values(this.#SITESTATS)) {
            if (stats.interactions) {
                stats.interactions = 0
            }
        }

        this.#SITESTATS.isDirty = true

    }

    static purgeSitestats() {
        // purge site statistics to prevent build-up of data and reset classifications
        const siteStats = new PersistentObject(this.#SITE_STATISTICS_KEY)
        siteStats.clear()

        chrome.runtime.reload()
    }

    static #incrementInteractionCounter(appName, increment = 1) {
        const today = nowDatestamp()
        const app = AppStats.forAppName(appName)
        const usage = AppStats.getUsage(app)
        const currInteractionCount = usage.getOrSet(today, 0)
        app.lastUsed = today
        usage[today] = currInteractionCount + increment
        AppStats.markDirty()

        debug(`incremented ${appName} with ${increment} interactions`)
    }

    static assignAppToSite(appName, url) {
        const site = this.#SITESTATS.getOrSet(getSitename(url), { })
        const prevAppName = site.appName
        site.appName = appName

        if (appName !== prevAppName) {
            if (prevAppName) {
                console.error(`${site} changed from ${prevAppName} to ${appName}`)
            }
            this.#SITESTATS.isDirty = true
        }

        if (site.interactions > 0) {
            AppStats.#incrementInteractionCounter(appName, site.interactions)
            site.interactions = 0
            this.#SITESTATS.isDirty = true
        }
    }

    static incrementInteraction(url) {
        const site = this.#SITESTATS.getOrSet(getSitename(url), { interactions: 0 })
        const appName = site.appName

        if (appName) {
            AppStats.#incrementInteractionCounter(appName)
        } else {
            site.interactions++
            this.#SITESTATS.isDirty = true
        }

    }
}
