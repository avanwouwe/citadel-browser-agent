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
            return null
        } else if (/Safari/i.test(version.brand)) {
            brand = Browser.Safari
        } else if (/Firefox/i.test(version.brand)) {
            brand = Browser.Firefox
        } else if (/Brave/i.test(version.brand)) {
            brand = Browser.Brave
        } else if (/Edge|Microsoft Edge/i.test(version.brand)) {
            brand = Browser.Edge
        } else if (/Opera/i.test(version.brand)) {
            brand = Browser.Opera
        } else if (/Safari/i.test(version.brand)) {
            brand = Browser.Safari
        } else if (/Chrome/i.test(version.brand)) {
            brand = Browser.Chrome
        }

        return { brand, version: version.version }
    }

    static #latestEOLVersion(software) {
        return fetch(`https://endoflife.date/api/${software.toLowerCase()}.json`)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`API returned ${response.status}`)
                }
                return response.json()
            })
            .then(data => {
                if (!data || !data.length || !data[0]) {
                    throw new Error('Invalid API response format')
                }

                return data[0].latest
            })
            .catch(error => {
                console.error(`Error fetching ${software} version:`, error)
                return null
            })
    }

    static #latestGithubVersion(repo) {
        return fetch(`https://api.github.com/repos/${repo}/releases/latest`)
            .then(response => response.json())
            .then(data => {
                // The tag_name typically contains the version (e.g., "v1.43.93")
                // Remove the 'v' prefix if present
                return data.tag_name.replace(/^v/, '')
            })
            .catch(error => {
                console.error(`Error fetching version for repo '${repo}':`, error)
                return null
            })
    }

    static latestChromeVersion() {
        let platform
        switch (Browser.platform) {
            case Browser.Windows:
                platform = 'win'
                break
            case Browser.MacOS:
                platform = 'mac'
                break
            default:
                throw new Error(`Unsupported platform ${Browser.platform}`)
        }

        return fetch(`https://versionhistory.googleapis.com/v1/chrome/platforms/${platform}/channels/stable/versions`)
            .then(response => response.json())
            .then(data => {

                return data.versions[0].version
            })
            .catch(error => {
                console.error('Error fetching Chrome version:', error)
                return null
            })
    }

    static latestEdgeVersion() {
        // Microsoft doesn't provide a simple API like Chrome
        // Using the Microsoft Edge update API
        return fetch('https://edgeupdates.microsoft.com/api/products')
            .then(response => response.json())
            .then(data => {
                const stableProduct = data.find(product => product.Product === 'Stable')

                if (! stableProduct?.Releases) {
                    return null
                }

                let platformFilter
                if (Browser.platform === Browser.MacOS) {
                    platformFilter = "MacOS"
                } else if (Browser.platform === Browser.Windows) {
                    platformFilter = "Windows"
                } else {
                    return null
                }

                let latestRelease = stableProduct.Releases
                    .filter(release => release.Platform === platformFilter)
                    .sort((a, b) => new Date(b.PublishedTime) - new Date(a.PublishedTime))[0]

                return latestRelease?.ProductVersion
            })
            .catch(error => {
                console.error('Error fetching Edge version:', error)
                return null
            })
    }

    static latestOperaVersion() {
        return fetch('https://get.geo.opera.com/ftp/pub/opera/desktop/')
            .then(response => response.json())
            .then(data => {
                // Get the latest version folder
                const versions = data.map(item => item.name.replace('/', ''))
                    .filter(name => /^\d+\.\d+\.\d+\.\d+$/.test(name))
                    .sort((a, b) => {
                        const partsA = a.split('.').map(Number)
                        const partsB = b.split('.').map(Number)

                        for (let i = 0; i < 4; i++) {
                            if (partsA[i] !== partsB[i]) {
                                return partsB[i] - partsA[i] // Descending order
                            }
                        }
                        return 0
                    })

                return versions.length > 0 ? versions[0] : null
            })
            .catch(error => {
                console.error('Error fetching Opera version:', error)
                return null
            })
    }

    static latestBraveVersion() {
        return this.#latestGithubVersion('brave/brave-browser')
    }

    static latestFirefoxVersion() {
        return this.#latestEOLVersion(Browser.Firefox)
    }

    static async getInfo() {
        const versions = await navigator.userAgentData?.getHighEntropyValues(["fullVersionList"]).then(list => list.fullVersionList)
        let version

        // for Firefox use another method
        if (!versions) {
            const info = await chrome.runtime.getBrowserInfo()
            version = { brand: info.name, version: info.version }
        } else {
            version = versions?.length > 0 ? versions[versions.length - 1] : null
        }

        return this.#normalizeVersion(version)
    }

    static async #latestVersion() {
        const info = await this.getInfo()

        if (!info || info.brand === this.Unknown) {
            console.error('Could not determine the browser brand')
            return null
        }

        switch (info.brand) {
            case this.Chrome:
                return this.latestChromeVersion()
            case this.Edge:
                return this.latestEdgeVersion()
            case this.Opera:
                return this.latestOperaVersion()
            case this.Brave:
                return this.latestBraveVersion()
            case this.Firefox:
                return this.latestFirefoxVersion()
            default:
                console.error(`Unsupported browser: ${info.brand}`)
                return null
        }
    }


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

    static #version = {}

    static async version() {
        // only refresh values once per day (or after browser restart)
        if (! (this.#version.lastCheck >= nowDatestamp())) {
            const info = await this.getInfo()

            const version = {
                lastCheck : nowDatestamp(),
                latestVersion : await this.#latestVersion(),
                currVersion: info.version,
                brand: info.brand
            }

            const wasLatest = this.#version?.isLatest
            version.isLatest = version.latestVersion <= version.currVersion
            version.outdatedSince = ((! version.outdatedSince || wasLatest) && ! version.isLatest) ? version.lastCheck : null

            this.#version = version
        }

        return this.#version
    }

}
