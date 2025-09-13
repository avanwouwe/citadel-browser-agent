class ExtensionStore {

    static of(url) {
        if (url.startsWith("https://chromewebstore.google.com/detail")) {
            return ExtensionStore.Chrome
        } else if (url.startsWith("https://addons.mozilla.org/")) {
            return ExtensionStore.Firefox
        } else if (url.startsWith("https://microsoftedge.microsoft.com/addons/detail/")) {
            return ExtensionStore.Edge
        } else if (url.startsWith("https://addons.opera.com/")) {
            return ExtensionStore.Opera
        }
    }

    static extensionIdOf(url) {
        const store = ExtensionStore.of(url)
        const match = url?.match(store?.pattern)
        return match?.[1] ?? null
    }

    static async fetchPage(url) {
        const store = ExtensionStore.of(url)
        if (!store) return

        const response = await Fetch.page(url)
        if (! response.ok) return

        return response
    }

    /**
     * Fetches Chrome extension CRX3, extracts and returns the manifest.json as JSON object.
     * @param {string} url - The URL of the file containing the extension.
     * @returns {Promise<Object>} Resolves to manifest.json object.
     */
    static async fetchManifest(url) {
        const response = await fetch(url)
        if (!response.ok) throw new Error("Failed to download crx: " + response.status)

        const buffer = await response.arrayBuffer()

        const zipBuffer = ExtensionStore.#stripCrxHeader(buffer)

        const { entries } = await unzipit.unzip(zipBuffer)

        const manifestEntry = entries["manifest.json"] || Object.values(entries).find(e => e.name.endsWith("/manifest.json"))
        if (!manifestEntry) throw new Error("manifest.json not found")

        return await manifestEntry.json()
    }

    static #stripCrxHeader(buffer) {
        const arr = new Uint8Array(buffer)

        // Detect CRX by magic number "Cr24"
        if (arr[0] === 0x43 && arr[1] === 0x72 && arr[2] === 0x32 && arr[3] === 0x34) {
            const view = new DataView(buffer)
            const version = view.getUint32(4, true)

            if (version === 2) {
                const pubKeyLen = view.getUint32(8, true)
                const sigLen = view.getUint32(12, true)
                const headerLen = 16 + pubKeyLen + sigLen
                return buffer.slice(headerLen)
            } else if (version === 3) {
                const headerLen = view.getUint32(8, true)
                return buffer.slice(12 + headerLen)
            } else {
                throw new Error("Unknown CRX version: " + version)
            }
        }

        // Detect ZIP by magic number "PK\x03\x04"
        if (arr[0] === 0x50 && arr[1] === 0x4B && arr[2] === 0x03 && arr[3] === 0x04) {
            return buffer // no stripping necessary
        }

        throw new Error("Unknown file: Not a CRX or ZIP archive")
    }

    static Chrome = class {
        static pattern = new RegExp('^https://chromewebstore.google.com/detail/[^/]+/([^/]+)')

        static parsePage(dom = document) {
            function parseRatingsNumber(str) {
                str = str.trim()
                const match = str.match(/^(\d+(?:[.,]\d+)?)/)
                if (!match) {
                    return null
                }

                let numberStr = match[1]

                if (numberStr.indexOf('.') !== -1 || numberStr.indexOf(',') !== -1) {
                    numberStr = numberStr.replace(',', '.')
                    return Math.round(parseFloat(numberStr) * 1000)
                } else {
                    return parseInt(numberStr, 10)
                }
            }

            function parseInstalledNumber(str) {
                str = str.trim()
                let match = str.match(/^([\d\s,.']+)/)
                if (!match) return null

                let numberStr = match[1].replace(/[\s,.']/g, '')

                return parseInt(numberStr)
            }

            const extensionId = ExtensionStore.extensionIdOf(dom.location.href)
            if (!extensionId) return

            // extensionName
            const extensionName = dom.querySelector('h1')

            const descriptionLine1 = extensionName.parentNode.parentNode
            const descriptionLine2 = descriptionLine1.nextElementSibling
            const descriptionLine3 = descriptionLine2.nextElementSibling

            // rating
            const ratingNode = Array.from(dom.querySelectorAll('[style]'))
                .find(el => el.style.getPropertyValue('--star-icon-size') !== '')
            const rating = parseRatingsNumber(ratingNode.childNodes[0].childNodes[0].textContent) / 1000

            // numInstalls
            const numInstalls = descriptionLine3 ?
                Array.from(descriptionLine3.childNodes)
                    .filter(node => node.nodeType === Node.TEXT_NODE)
                    .map(textNode => parseInstalledNumber(textNode.textContent))
                    .find(count => count !== null) || null
                : null

            // isVerifiedPublisher
            const isVerifiedPublisher = containsSvg(descriptionLine2,"M23 11.99L20.56 9.2l.34-3.69-3.61-.82L15.4 1.5 12 2.96 8.6 1.5 6.71 4.69 3.1 5.5l.34 3.7L1 11.99l2.44 2.79-.34 3.7 3.61.82 1.89 3.2 3.4-1.47 3.4 1.46 1.89-3.19 3.61-.82-.34-3.69 2.44-2.8zm-3.95 1.48l-.56.65.08.85.18 1.95-1.9.43-.84.19-.44.74-.99 1.68-1.78-.77-.8-.34-.79.34-1.78.77-.99-1.67-.44-.74-.84-.19-1.9-.43.18-1.96.08-.85-.56-.65L3.67 12l1.29-1.48.56-.65-.09-.86-.18-1.94 1.9-.43.84-.19.44-.74.99-1.68 1.78.77.8.34.79-.34 1.78-.77.99 1.68.44.74.84.19 1.9.43-.18 1.95-.08.85.56.65 1.29 1.47-1.28 1.48z")

            // isVerifiedExtension
            const isVerifiedExtension = containsSvg(descriptionLine2, "M20 10c0-4.42-3.58-8-8-8s-8 3.58-8 8c0 2.03.76 3.87 2 5.28V23l6-2 6 2v-7.72c1.24-1.41 2-3.25 2-5.28zm-8-6c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6 2.69-6 6-6zm0 15-4 1.02v-3.1c1.18.68 2.54 1.08 4 1.08s2.82-.4 4-1.08v3.1L12 19zm-3-9c0-1.66 1.34-3 3-3s3 1.34 3 3-1.34 3-3 3-3-1.34-3-3z")

            // numRatings
            const anchor = dom.querySelector('a[href*="/' + extensionId + '/reviews"]')
            const numRatings = parseRatingsNumber(anchor.textContent)

            // categories
            const categories = descriptionLine3 ?
                Array.from(descriptionLine3.querySelectorAll('a[href*="./category/extensions/"]'))
                    .map(link => {
                        const href = link.getAttribute('href')
                        const categoryMatch = href.match(/\/category\/extensions\/([^/]+)(?:\/([^/]+))?/)
                        if (categoryMatch) {
                            return { primary: categoryMatch[1], secondary: categoryMatch[2] }
                        }
                    })
                    .filter(category => !!category)
                : []

            const downloadUrl = `https://clients2.google.com/service/update2/crx?response=redirect&acceptformat=crx2,crx3&prodversion=${Browser.version.version}&x=id%3D${extensionId}%26uc`

            return {
                browser: Browser.Chrome,
                id: extensionId,
                name: extensionName.textContent,
                categories,
                rating,
                numRatings,
                numInstalls,
                isVerifiedExtension,
                isVerifiedPublisher,
                downloadUrl
            }
        }
    }

    static Firefox = class {

        static pattern = new RegExp('^https://addons.mozilla.org/[^/]+/firefox/addon/([^/?]+)')

        static categories = {
            'tabs': { primary: 'make_chrome_yours', secondary: 'functionality' },
            'appearance': { primary: 'make_chrome_yours', secondary: 'functionality' },
            'bookmarks': { primary: 'make_chrome_yours', secondary: 'functionality' },
            'language-support': { primary: 'make_chrome_yours', secondary: 'functionality' },
            'download-management': { primary: 'make_chrome_yours', secondary: 'functionality' },
            'feeds-news-blogging': { primary: 'lifestyle', secondary: 'news' },
            'games-entertainment': { primary: 'lifestyle', secondary: 'entertainment' },
            'photos-music-videos': { primary: 'lifestyle', secondary: 'entertainment' },
            'privacy-security': { primary: 'make_chrome_yours', secondary: 'privacy' },
            'alerts-updates': { primary: 'productivity', secondary: 'tools' },
            'search-tools': { primary: 'productivity', secondary: 'tools' },
            'shopping': { primary: 'lifestyle', secondary: 'shopping' },
            'social-communication': { primary: 'lifestyle', secondary: 'social' },
            'web-development': { primary: 'productivity', secondary: 'developer' },
            'other': null,
        }

        static parsePage(dom = document) {
            const extensionId = ExtensionStore.extensionIdOf(dom.location.href)
            if (!extensionId) return null

            // extensionName
            const header = dom.querySelector('header.Addon-header')
            const titleElement = header.querySelector('.AddonTitle')
            const extensionName = titleElement ?
                titleElement.textContent.replace(titleElement.querySelector('.AddonTitle-author')?.textContent || '', '').trim() :
                null

            // isVerifiedExtension
            const isVerifiedExtension = !!header.querySelector('div.Badge[data-testid="badge-recommended"]')

            // rating & numRatings
            let rating = null
            let numRatings = null
            const ratingBadge = header.querySelector('div.Badge[data-testid="badge-star-full"] .Badge-content')
            if (ratingBadge) {
                const ratingText = ratingBadge.textContent.trim()
                const match = ratingText.match(/(\d+(?:\.\d+)?)\s*\((\d[\d\s',.]+)\s*/)
                if (match) {
                    rating = parseFloat(match[1])
                    numRatings = parseInt(match[2].replace(/[\s,.]/g, ''), 10)
                }
            }

            // numInstalls
            let numInstalls = null
            const userBadge = header.querySelector('div.Badge[data-testid="badge-user-fill"] .Badge-content')
            if (userBadge) {
                const usersText = userBadge.textContent.trim()
                const match = usersText.match(/(\d[\d\s',.]+)/)
                if (match) {
                    numInstalls = parseInt(match[1].replace(/[\s',.]/g, ''))
                }
            }

            // categories
            const categories = []
            const categoryLinks = dom.querySelectorAll('.AddonMoreInfo-related-category-link')
            categoryLinks.forEach(link => {
                const href = link.getAttribute('href')
                const categorySlugMatch = href.match(/\/firefox\/extensions\/category\/([^/]+)\//)
                if (categorySlugMatch) {
                    const category = this.categories[categorySlugMatch[1]]
                    if (category) {
                        categories.push(category)
                    }
                }
            })

            const downloadUrl = dom.querySelector('.Addon-install a[href^="https://addons.mozilla.org/firefox/downloads/file"]')?.href

            return {
                browser: Browser.Firefox,
                id: extensionId,
                name: extensionName,
                rating,
                numRatings,
                numInstalls,
                categories,
                isVerifiedExtension,
                downloadUrl,
            }
        }
    }

    static Edge = class {

        static pattern = new RegExp('^https://microsoftedge.microsoft.com/addons/detail/[^/]+/([^/?#]+)')

        static categories = {
            'accessibility': { primary: 'make_chrome_yours', secondary: 'accessibility' },
            'blogging': { primary: 'lifestyle', secondary: 'news' },
            'communication': { primary: 'lifestyle', secondary: 'social' },
            'developer-tools': { primary: 'productivity', secondary: 'developer' },
            'entertainment': { primary: 'lifestyle', secondary: 'entertainment' },
            'news-and-weather': { primary: 'lifestyle', secondary: 'news' },
            'photos': { primary: 'lifestyle', secondary: 'entertainment' },
            'productivity': { primary: 'productivity', secondary: 'tools' },
            'search-tools': { primary: 'productivity', secondary: 'tools' },
            'shopping': { primary: 'lifestyle', secondary: 'shopping' },
            'social': { primary: 'lifestyle', secondary: 'social' },
            'sports': { primary: 'lifestyle', secondary: 'entertainment' }
        }

        static parsePage(dom = document) {
            function parseInstalledNumber(str) {
                const match = str.match(/([0-9.,'\s]+)/)
                if (!match) return null

                const numeric = match[1].replace(/[\s,.']/g, '')
                return Number(numeric).valueOf()
            }

            const extensionId = ExtensionStore.extensionIdOf(dom.location.href)
            if (!extensionId) return null

            const extensionName = dom.querySelector('title')?.textContent?.replace(' - Microsoft Edge Addons', '')

            // rating & numRatings, numInstalls
            const ratingMeta = dom.querySelector('meta[itemprop="ratingValue"]')
            const numRatingsMeta = dom.querySelector('meta[itemprop="ratingCount"]')
            const numInstallsMeta = dom.querySelector('meta[itemprop="userInteractionCount"]')

            const rating = parseFloat(ratingMeta?.getAttribute('content')) ?? null
            const numRatings = parseInt(numRatingsMeta?.getAttribute('content')) ?? null
            const numInstalls = parseInstalledNumber(numInstallsMeta?.getAttribute('content'))

            // isVerifiedExtension
            const isVerifiedExtension = !!dom.querySelector('a[href*="featured-badge"]')

            // categories
            const categories = []
            const categoryElem = dom.getElementById('categoryText')
            if (categoryElem && categoryElem.href) {
                const categorySlug = categoryElem.href.match(/\/addons\/category\/([^/]+)/i)?.[1]?.toLowerCase()
                if (categorySlug) {
                    const category = this.categories[categorySlug]
                    if (category) categories.push(category)
                }
            }

            const downloadUrl = `https://edge.microsoft.com/extensionwebstorebase/v1/crx?x=id%3D${extensionId}%26installsource%3Dondemand&response=redirect`

            return {
                browser: Browser.Edge,
                id: extensionId,
                name: extensionName,
                numInstalls,
                rating,
                numRatings,
                categories,
                isVerifiedExtension,
                downloadUrl
            }
        }
    }

    static Opera = class {
        static pattern = new RegExp('^https://addons.opera.com/[^/]+/extensions/details/([^/]+)')

        static categories = {
            'accessibility': { primary: 'make_chrome_yours', secondary: 'accessibility' },
            'appearance': { primary: 'make_chrome_yours', secondary: 'appearance' },
            'blockchain-cryptocurrency': { primary: 'productivity', secondary: 'crypto' },
            'developer-tools': { primary: 'productivity', secondary: 'developer' },
            'downloads': { primary: 'lifestyle', secondary: 'downloads' },
            'fun': { primary: 'lifestyle', secondary: 'entertainment' },
            'music': { primary: 'lifestyle', secondary: 'entertainment' },
            'news-weather': { primary: 'lifestyle', secondary: 'news' },
            'productivity': { primary: 'productivity', secondary: 'tools' },
            'search': { primary: 'productivity', secondary: 'tools' },
            'shopping': { primary: 'lifestyle', secondary: 'shopping' },
            'social': { primary: 'lifestyle', secondary: 'social' },
            'translation': { primary: 'productivity', secondary: 'translation' },
        }

        static parsePage(dom = document) {
            function parseInteger(str) {
                if(!str) return null
                str = str.replace(/[\s,.']/g, '')
                const num = parseInt(str)
                return isNaN(num) ? null : num
            }

            const extensionId = ExtensionStore.extensionIdOf(dom.location.href)
            if (!extensionId) return null

            const extensionName = dom.querySelector('h1[itemprop="name"]')?.textContent.trim() || null
            const rating = parseFloat(dom.querySelector('span.rating#rating-value')?.textContent)
            const numRatings = parseInt(dom.querySelector('span#rating-count')?.textContent)

            const about = Array.from(dom.querySelectorAll('section.about dl dd'))
            const installsNode = about[0]
            const numInstalls = parseInteger(installsNode?.textContent)

            const isVerifiedPublisher = !!dom.querySelector('h2[itemprop="brand"] > img.verified')
            const categoriesNode = !!numInstalls ? about[1] : about[0]
            const catMatch = categoriesNode?.childNodes?.[0]?.getAttribute('href').match(/\/category\/([^/?]+)/)

            const categories = []
            if (catMatch) {
                const category = this.categories[catMatch[1].toLowerCase()]
                if (category) {
                    categories.push(category)
                }
            }

            return {
                browser: Browser.Opera,
                id: extensionId,
                name: extensionName,
                numInstalls,
                rating,
                numRatings,
                categories,
                isVerifiedPublisher,
            }
        }
    }
}