class Browser {
    static Chrome = 'Chrome'
    static Firefox = 'Firefox'
    static Edge = 'Microsoft Edge'
    static Opera = 'Opera'
    static Brave = 'Brave'
    static Safari = 'Safari'
    static Unknown = 'Unknown'

    static MacOS = 'MacOS'
    static Windows = 'Windows'

    static #normalizeVersion(version) {
        let brand = Browser.Unknown

        if (! version) {
            brand = Browser.Unknown
        } else if (/Safari/i.test(version.brand)) {
            brand = Browser.Safari
        } else if (/Firefox/i.test(version.brand)) {
            brand = Browser.Firefox
        } else if (/Brave/i.test(version.brand)) {
            brand = Browser.Brave
        } else if (/Edge/i.test(version.brand)) {
            brand = Browser.Edge
        } else if (/Opera/i.test(version.brand)) {
            brand = Browser.Opera
        } else if (/Chrome/i.test(version.brand)) {
            brand = Browser.Chrome
        }

        return { brand, version: version?.version }
    }

    static version = (async () => {
        const versions = await navigator.userAgentData?.getHighEntropyValues(["fullVersionList"]).then(list => list.fullVersionList)
        let version

        // for Firefox use another method
        if (!versions) {
            const info = await chrome.runtime.getBrowserInfo()
            version = { brand: info.name, version: info.version }
        } else {
            for (const i of versions) {
                if (this.#normalizeVersion(i)?.brand !== Browser.Unknown) {
                    version = i
                }
            }
        }

        Browser.version = this.#normalizeVersion(version)
    })()

    static platform = (() => {
        if (/Mac|MacIntel|MacPPC/i.test(navigator.platform)) {
            return Browser.MacOS
        }
        else if (/Win|Windows/i.test(navigator.platform)) {
            return Browser.Windows
        }
        else {
            return Browser.Unknown
        }
    })()

    static compareVersions(a, b) {
        const pa = a.split('.').map(Number)
        const pb = b.split('.').map(Number)

        assert(pa.length === pb.length, `tried to compare version ${a} with different structure ${b}`)

        const len = pa.length
        for (let i = 0; i < len; i++) {
            const na = pa[i] || 0
            const nb = pb[i] || 0
            if (na > nb) return 1
            if (na < nb) return -1
        }

        return 0
    }

    static startTime

    static {
        if (Context.isServiceWorker()) {
            (async () => {
                const result = await chrome.storage.session.get(['browserStartTime'])

                if (result.browserStartTime) {
                    Browser.startTime = result.browserStartTime
                } else {
                    Browser.startTime = Date.now()
                    await chrome.storage.session.set({ browserStartTime: Browser.startTime })
                }
            })()
        }
    }

}
