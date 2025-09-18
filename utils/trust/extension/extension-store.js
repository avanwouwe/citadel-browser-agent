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
     * Fetches and extracts an extension package
     * @param {string} url - URL to download the extension from
     * @returns {Promise<Object>} - Object containing unzipped entries
     */
    static async fetchPackage(url) {
        const response = await fetch(url)
        if (!response.ok) throw new Error("Failed to download extension: " + response.status)

        const buffer = await response.arrayBuffer()
        const zipBuffer = ExtensionStore.#stripCrxHeader(buffer)
        const { entries } = await unzipit.unzip(zipBuffer)
        return entries
    }

    /**
     * Fetches Chrome extension CRX3, extracts and returns the manifest.json as JSON object.
     * @param {Object} entries - An Object containing the package.
     * @returns {Promise<Object>} Resolves to manifest.json object.
     */
    static async getManifest(entries) {
        const manifestEntry = entries["manifest.json"] || Object.values(entries).find(e => e.name.endsWith("/manifest.json"))
        if (!manifestEntry) throw new Error("manifest.json not found")

        return await manifestEntry.json()
    }

    /**
     * Extracts JavaScript files from extension entries
     * @param {Object} entries - Unzipped extension entries
     * @returns {Object} - Object mapping file paths to their content
     */
    static extractJavascript(entries) {
        const manifest = ExtensionStore.getManifest(entries)
        const scripts = {}
        const jsFilePaths = new Set()

        if (manifest.background) {
            if (manifest.background.service_worker) {
                jsFilePaths.add(manifest.background.service_worker)
            } else if (manifest.background.scripts) {
                manifest.background.scripts.forEach(script => jsFilePaths.add(script))
            } else if (manifest.background.page) {
                jsFilePaths.add(manifest.background.page)
            }
        }

        if (manifest.content_scripts) {
            manifest.content_scripts.forEach(cs => {
                if (cs.js) cs.js.forEach(script => jsFilePaths.add(script))
            })
        }

        const popupPage = manifest.action?.default_popup || manifest.browser_action?.default_popup
        if (popupPage) jsFilePaths.add(popupPage)

        // Extract all JS files
        for (const [path, entry] of Object.entries(entries)) {
            if (path.endsWith('.js')) {
                try {
                    // We need to await here but can't use await in a forEach
                    scripts[path] = entry.text()
                } catch (error) {
                    scripts[path] = Promise.resolve(`// Error extracting file: ${error.message}`)
                }
            }
        }

        // Extract scripts from HTML files that are referenced in the manifest
        for (const filePath of jsFilePaths) {
            if ((filePath.endsWith('.html') || filePath.endsWith('.htm')) && !scripts[filePath]) {
                try {
                    const htmlEntry = entries[filePath] ||
                        Object.values(entries).find(e => e.name.endsWith('/' + filePath))

                    if (htmlEntry) {
                        scripts[filePath] = htmlEntry.text().then(content => {
                            // Extract inline scripts
                            const scriptMatches = content.match(/<script\b[^>]*>([\s\S]*?)<\/script>/gm) || []
                            return scriptMatches.join('\n')
                        })
                    }
                } catch (error) {
                    scripts[filePath] = Promise.resolve(`// Error extracting HTML: ${error.message}`)
                }
            }
        }

        // Resolve all promises to get the actual content
        return Promise.all(
            Object.entries(scripts).map(async ([path, contentPromise]) => {
                return [path, await contentPromise]
            })
        ).then(entries => Object.fromEntries(entries))
    }

    /**
     * Analyzes JavaScript code using acorn
     * @param {Object} scripts - Object mapping file paths to their content
     * @returns {Object} - Analysis results
     */
    static analyseJavascript(scripts) {
        const analysis = {}

        for (const [path, content] of Object.entries(scripts)) {
            if (!content || typeof content !== 'string') {
                analysis[path] = { error: "Invalid content" }
                continue
            }

            try {
                const ast = acorn.parse(content, {
                    ecmaVersion: 2022,
                    sourceType: 'module',
                    locations: true
                })

                const fileAnalysis = {
                    functions: [],
                    chrome_api_calls: [],
                    network_requests: [],
                    event_listeners: [],
                    permissions_used: new Set(),
                    storage_access: [],
                    message_passing: []
                }

                // Walk the AST to analyze patterns
                acorn.walk.recursive(ast, {}, {
                    FunctionDeclaration(node, state, c) {
                        fileAnalysis.functions.push({
                            type: 'function',
                            name: node.id?.name || 'anonymous',
                            params: node.params.length,
                            loc: node.loc
                        })
                        node.body && c(node.body, state)
                    },

                    ArrowFunctionExpression(node, state, c) {
                        fileAnalysis.functions.push({
                            type: 'arrow',
                            params: node.params.length,
                            loc: node.loc
                        });
                        node.body && c(node.body, state)
                    },

                    CallExpression(node, state, c) {
                        // Chrome API calls
                        if (node.callee.type === 'MemberExpression') {
                            let obj = node.callee.object

                            // Check for chrome.* API
                            if (obj.type === 'MemberExpression' &&
                                obj.object.type === 'Identifier' &&
                                obj.object.name === 'chrome') {

                                const api = `chrome.${obj.property.name}.${node.callee.property.name}`;
                                fileAnalysis.chrome_api_calls.push({
                                    api,
                                    loc: node.loc
                                })

                                // Infer permissions from API usage
                                if (obj.property.name === 'tabs') {
                                    fileAnalysis.permissions_used.add('tabs');
                                } else if (obj.property.name === 'storage') {
                                    fileAnalysis.permissions_used.add('storage');
                                    fileAnalysis.storage_access.push({
                                        operation: node.callee.property.name,
                                        loc: node.loc
                                    })
                                } else if (obj.property.name === 'runtime' &&
                                    ['sendMessage', 'onMessage'].includes(node.callee.property.name)) {
                                    fileAnalysis.message_passing.push({
                                        type: node.callee.property.name,
                                        loc: node.loc
                                    })
                                }
                            }

                            // Network requests
                            if ((obj.type === 'Identifier' && obj.name === 'fetch') ||
                                (node.callee.property.name === 'open' &&
                                    obj.type === 'Identifier' &&
                                    obj.name === 'XMLHttpRequest')) {

                                let url = null
                                if (node.arguments.length > 0 &&
                                    node.arguments[0].type === 'Literal') {
                                    url = node.arguments[0].value
                                }

                                fileAnalysis.network_requests.push({
                                    type: obj.name === 'XMLHttpRequest' ? 'xhr' : 'fetch',
                                    url,
                                    loc: node.loc
                                })

                                fileAnalysis.permissions_used.add('*://*/*')
                            }
                        }

                        // Process all nested elements
                        node.arguments.forEach(arg => c(arg, state))
                        c(node.callee, state)
                    },

                    MemberExpression(node, state, c) {
                        // Event listeners
                        if (node.property.type === 'Identifier' &&
                            ['addEventListener', 'removeEventListener'].includes(node.property.name)) {
                            fileAnalysis.event_listeners.push({
                                type: node.property.name,
                                loc: node.loc
                            })
                        }

                        c(node.object, state);
                        if (node.computed) c(node.property, state)
                    }
                })

                // Convert Set to Array for serialization
                fileAnalysis.permissions_used = [...fileAnalysis.permissions_used]

                analysis[path] = fileAnalysis;
            } catch (error) {
                analysis[path] = {
                    error: error.message,
                    partial_content: content.substring(0, 100) + '...'
                }
            }
        }

        return analysis
    }

    /**
     * Parses and analyzes the JavaScript files of an extension
     * @param {string} entries - The contents of te package to analyze
     * @returns {Promise<Object>} - Analysis results of the extension code
     */
    static async analyseStatically(entries) {
        const manifest = ExtensionStore.getManifest(entries)
        const scripts = await this.extractJavascript(entries)
        const analysis = this.analyseJavascript(scripts)
        return {
            name: manifest.name,
            manifest_version: manifest.manifest_version,
            permissions: manifest.permissions || [],
            host_permissions: manifest.host_permissions || [],
            content_scripts: manifest.content_scripts?.length || 0,
            background: !!manifest.background,
            files_analyzed: Object.keys(analysis).length,
            analysis
        }
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
        static pattern = new RegExp('^https://chromewebstore.google.com/detail/[^/]+/([^/?#]+)')

        static parsePage(dom) {
            function parseRatingsNumber(str) {
                str = str?.trim()
                const match = str?.match(/^(\d+(?:[.,]\d+)?)/)
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
                str = str?.trim()
                let match = str?.match(/^([\d\s,.']+)/)
                if (!match) return null

                let numberStr = match[1].replace(/[\s,.']/g, '')

                return parseInt(numberStr)
            }

            const extensionId = ExtensionStore.extensionIdOf(dom.url)
            if (!extensionId) return

            // extensionName
            const extensionName = dom.querySelector('h1')

            const descriptionLine1 = extensionName?.parentNode?.parentNode
            const descriptionLine2 = descriptionLine1?.nextElementSibling
            const descriptionLine3 = descriptionLine2?.nextElementSibling

            // extensionLogo
            const extensionLogo = dom.querySelector('meta[property="og:image"]')?.getAttribute('content')

            // rating
            const ratingNode = Array.from(dom.querySelectorAll('[style]'))
                .find(el => el.getAttribute('style')?.includes('--star-icon-size'))
            const rating = parseRatingsNumber(ratingNode?.childNodes[0]?.childNodes[0]?.textContent) / 1000

            // numInstalls
            const numInstalls = descriptionLine3 ?
                Array.from(descriptionLine3?.childNodes)
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
            const numRatings = parseRatingsNumber(anchor?.textContent)

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
                extensionLogo,
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

        static pattern = new RegExp('^https://addons.mozilla.org/[^/]+/firefox/addon/([^/?#]+)')

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

        static parsePage(dom) {
            const extensionId = ExtensionStore.extensionIdOf(dom.url)
            if (!extensionId) return null

            // extensionName
            const header = dom.querySelector('header.Addon-header')
            const titleElement = header.querySelector('.AddonTitle')
            const extensionName = titleElement ?
                titleElement.textContent.replace(titleElement.querySelector('.AddonTitle-author')?.textContent || '', '').trim() :
                null

            // extensionLogo
            const extensionLogo = dom.querySelector('img.Addon-icon-image')?.getAttribute('src')

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
                extensionLogo,
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

        static parsePage(dom) {
            function parseInstalledNumber(str) {
                const match = str.match(/([0-9.,'\s]+)/)
                if (!match) return null

                const numeric = match[1].replace(/[\s,.']/g, '')
                return Number(numeric).valueOf()
            }

            const extensionId = ExtensionStore.extensionIdOf(dom.url)
            if (!extensionId) return null

            const extensionName = dom.querySelector('title')?.textContent?.replace(' - Microsoft Edge Addons', '')
            const extensionLogo = dom.querySelector('img[src^="https://store-images.s-microsoft.com"]')?.getAttribute('src')

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
                extensionLogo,
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
        static pattern = new RegExp('^https://addons.opera.com/[^/]+/extensions/details/([^/#?]+)')

        static categories = {
            'privacy-security': { primary: 'make_chrome_yours', secondary: 'privacy' },
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

        static parsePage(dom) {
            function parseInteger(str) {
                if(!str) return null
                str = str.replace(/[\s,.']/g, '')
                const num = parseInt(str)
                return isNaN(num) ? null : num
            }

            const extensionId = ExtensionStore.extensionIdOf(dom.url)
            if (!extensionId) return null

            const extensionName = dom.querySelector('h1[itemprop="name"]')?.textContent.trim()
            const extensionLogo = dom.querySelector('img.icon-pkg')?.getAttribute('src')
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

            const downloadUrl = `https://addons.opera.com/extensions/download/${extensionId}/`

            return {
                browser: Browser.Opera,
                id: extensionId,
                name: extensionName,
                extensionLogo,
                numInstalls,
                rating,
                numRatings,
                categories,
                isVerifiedPublisher,
                downloadUrl
            }
        }
    }
}