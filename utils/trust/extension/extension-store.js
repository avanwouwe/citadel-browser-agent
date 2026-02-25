class ExtensionStore {

    static of(url) {
        if (!url) return undefined

        if (url.startsWith("https://chromewebstore.google.com/detail") || url.startsWith("https://clients2.google.com/service/update")) {
            return ExtensionStore.Chrome
        } else if (url.startsWith("https://addons.mozilla.org/")) {
            return ExtensionStore.Firefox
        } else if (url.startsWith("https://microsoftedge.microsoft.com/addons/detail/") || url.startsWith("https://edge.microsoft.com/extensionwebstorebase/")) {
            return ExtensionStore.Edge
        } else if (url.startsWith("https://addons.opera.com/") || url.startsWith("https://extension-updates.opera.com/api/")) {
            return ExtensionStore.Opera
        }
    }

    static async extensionIdOf(storePage) {
        const store = ExtensionStore.of(storePage)
        const match = storePage?.match(store?.pattern)
        const id = match?.[1] ?? null

        if (!id) return null

        if (store === ExtensionStore.Firefox ||
            store === ExtensionStore.Opera && ! storePage.includes('/extensions/details/app_id/')
        ) {
            return store.slugToId(id)
        }

        return id
    }

    static pageOf = async (id, store = ExtensionStore.Chrome) => await store.pageOf(id)

    static async fetchStoreInfo(storePage) {
        const html = Context.isServiceWorker() ? await ExtensionStore.fetchPage(storePage) : await callServiceWorker('FetchExtensionPage', { url: storePage })
        const dom = html2dom(html.content)
        dom.url = storePage

        const storeInfo = await ExtensionStore.of(storePage).parsePage(dom)

        const uniqueCategories = new Map()
        storeInfo.categories.forEach(category => {
            const key = `${category.primary}|${category.secondary}`
            uniqueCategories.set(key, category)
        })
        storeInfo.categories = Array.from(uniqueCategories.values())
        storeInfo.storePage = storePage
        return storeInfo
    }

    static async fetchPage(url) {
        const store = ExtensionStore.of(url)
        if (!store) return

        // first normalize the URL, so that we always have the english version
        const extensionId = await ExtensionStore.extensionIdOf(url)
        url = await store.pageOf(extensionId)

        return Fetch.page(url)
    }

    /**
     * Praes an extension package and returns structured contents
     * @param {ArrayBuffer} buffer - buffer containing the extension CRX file
     * @returns {Promise<Object>} - Object containing CRX contents
     * */
    static async parsePackage(buffer) {
        buffer = await ExtensionStore.#stripCrxHeader(buffer)
        const { entries } = await unzipit.unzip(buffer);
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

        const manifest = await manifestEntry.json()
        manifest.content_scripts = manifest.content_scripts ?? []
        manifest.permissions = manifest.permissions ?? []
        manifest.host_permissions = manifest.host_permissions ?? []
        manifest.optional_permissions = manifest.optional_permissions ?? []
        manifest.optional_host_permissions = manifest.optional_host_permissions ?? []
        return manifest
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
        const manifest = await ExtensionStore.getManifest(entries)
        const scripts = await this.extractJavascript(entries)
        const analysis = this.analyseJavascript(scripts)
        return {
            name: manifest.name,
            manifest_version: manifest.manifest_version,
            permissions: manifest.permissions,
            host_permissions: manifest.host_permissions,
            content_scripts: manifest.content_scripts.length,
            background: !!manifest.background,
            files_analyzed: Object.keys(analysis).length,
            analysis
        }
    }

    static #stripCrxHeader(buffer, depth = 0) {
        if (depth > 4) throw new Error("CRX nesting depth exceeded")

        const arr = new Uint8Array(buffer)

        // Detect CRX by magic number "Cr24"
        if (arr[0] === 0x43 && arr[1] === 0x72 && arr[2] === 0x32 && arr[3] === 0x34) {
            const view = new DataView(buffer)
            const version = view.getUint32(4, true)

            let sliced
            if (version === 2) {
                const pubKeyLen = view.getUint32(8, true)
                const sigLen = view.getUint32(12, true)
                const headerLen = 16 + pubKeyLen + sigLen
                sliced = buffer.slice(headerLen)
            } else if (version === 3) {
                const headerLen = view.getUint32(8, true)
                sliced = buffer.slice(12 + headerLen)
            } else {
                throw new Error("Unknown CRX version: " + version)
            }

            // Recurse in case of nested CRX (Opera wraps CRX2 inside CRX3)
            return ExtensionStore.#stripCrxHeader(sliced, depth + 1)
        }

        // Detect ZIP by magic number "PK\x03\x04"
        if (arr[0] === 0x50 && arr[1] === 0x4B && arr[2] === 0x03 && arr[3] === 0x04) {
            return buffer
        }

        throw new Error("Unknown file: Not a CRX or ZIP archive")
    }

    static Chrome = class {
        static pattern = new RegExp('^https://chromewebstore.google.com/detail/[^/]+/([^/?#]+)')

        static pageOf = async (id) => `https://chromewebstore.google.com/detail/${id}/${id}`

        static async parsePage(dom) {
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

            const extensionId = await ExtensionStore.extensionIdOf(dom.url)
            if (!extensionId || dom?.url?.toURL()?.pathname?.endsWith("/error")) return

            // extensionName
            const extensionName = dom.querySelector('h1')

            const descriptionLine1 = extensionName?.parentNode?.parentNode
            const descriptionLine2 = descriptionLine1?.nextElementSibling
            const descriptionLine3 = descriptionLine2?.nextElementSibling

            // description
            const overviewSection = Array.from(dom.querySelectorAll('section'))
                .find(s => s.querySelector('h2')?.textContent?.trim() === 'Overview')

            const description = overviewSection.textContent
                ?? dom.querySelector('meta[property="og:description"]')?.getAttribute('content')
                ?? dom.querySelector('meta[name="description"]')?.getAttribute('content')

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

            const emailNode = [...dom.querySelectorAll('details')]
                ?.find(details => [...details.children].some(child => child.tagName === 'SUMMARY'))
            const email = emailNode?.querySelector(':scope > div')?.textContent
            const website = emailNode?.parentNode?.querySelector('a')?.href

            const downloadUrl = `https://clients2.google.com/service/update2/crx?response=redirect&acceptformat=crx2,crx3&prodversion=${Browser.version.version}&x=id%3D${extensionId}%26uc`

            return {
                browser: Browser.Chrome,
                id: extensionId,
                name: extensionName?.textContent,
                description,
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

        static pageOf = async (id) => {
            const slug = await ExtensionStore.Firefox.idToSlug(id)
            return slug ? `https://addons.mozilla.org/en-US/firefox/addon/${slug}/` : null
        }

        static async parsePage(dom) {
            const extensionId = await ExtensionStore.extensionIdOf(dom.url)
            if (!extensionId) return null

            const reduxState = JSON.parse(dom.querySelector('#redux-store-state')?.textContent ?? 'null')
            const addonData = reduxState?.addons?.byID ? Object.values(reduxState.addons.byID)[0] : null

            if (!addonData) return null

            // extensionName
            const extensionName = addonData.name
            const description = (addonData.summary ?? '') + '\n\n' + (addonData.description ?? '')

            // extensionLogo
            const extensionLogo = addonData.icons?.['64'] ?? addonData.icons?.['32']

            // isVerifiedExtension
            const isVerifiedExtension = addonData.promoted?.some(p =>
                p.category === 'recommended' || p.category === 'line'
            ) ?? false

            // rating & numRatings
            const rating = addonData.ratings?.average
            const numRatings = addonData.ratings?.count
            const numInstalls = addonData.average_daily_users

            // categories
            const categories = (addonData.categories ?? [])
                .map(slug => this.categories[slug])
                .filter(Boolean)

            const versionId = addonData.currentVersionId
            const versionData = reduxState?.versions?.byId?.[versionId]
            const downloadUrl = versionData?.file?.url

            return {
                browser: Browser.Firefox,
                id: extensionId,
                name: extensionName,
                description,
                extensionLogo,
                rating,
                numRatings,
                numInstalls,
                categories,
                isVerifiedExtension,
                downloadUrl
            }
        }

        static async slugToId(slug) {
            const data = await ExtensionStore.Firefox.getMetadata(slug)
            return data?.guid
        }

        static async idToSlug(id) {
            const data = await ExtensionStore.Firefox.getMetadata(id)
            return data?.slug
        }

        static async getMetadata(extensionId) {
            try {
                const response = await fetch(`https://addons.mozilla.org/api/v5/addons/addon/${extensionId}/`)
                if (!response.ok) throw new Error(`HTTP ${response.status}`)

                return await response.json()
            } catch (error) {
                console.trace(`Cannot find store URL for ${extensionId}:`, error)
                return null
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

        static pageOf = async (id) => `https://microsoftedge.microsoft.com/addons/detail/${id}/${id}`

        static async parsePage(dom) {
            const extensionId = await ExtensionStore.extensionIdOf(dom.url)
            if (!extensionId) return null

            const apiData = await ExtensionStore.Edge.getMetadata(extensionId)
            if (!apiData) return null

            return {
                browser: Browser.Edge,
                id: extensionId,
                name: apiData.name,
                description: apiData.description,
                extensionLogo: 'https:' + apiData.logoUrl,
                numInstalls: apiData.activeInstallCount,
                rating: apiData.averageRating,
                numRatings: apiData.ratingCount,
                categories: ExtensionStore.Edge.#mapCategories(apiData.categories),
                isVerifiedExtension: apiData.isBadgedAsFeatured ?? false,
                downloadUrl: `https://edge.microsoft.com/extensionwebstorebase/v1/crx?x=id%3D${extensionId}%26installsource%3Dondemand&response=redirect`
            }
        }

        static async getMetadata(extensionId) {
            try {
                const response = await fetch(`https://microsoftedge.microsoft.com/addons/getproductdetailsbycrxid/${extensionId}`)
                if (!response.ok) throw new Error(`HTTP ${response.status}`)
                return await response.json()
            } catch (error) {
                console.trace(`Cannot find Edge metadata for ${extensionId}:`, error)
                return null
            }
        }

        static #mapCategories(categories) {
            if (!categories) return []

            return categories
                .map(slug => this.categories[slug?.toLowerCase()])
                .filter(Boolean)
        }
    }

    static Opera = class {
        static pattern = new RegExp('^https://addons.opera.com/[^/]+/extensions/details/(?:app_id/)?([^/#?]+)')

        static categories = {
            'privacy-security':          { primary: 'make_chrome_yours', secondary: 'privacy' },
            'accessibility':             { primary: 'make_chrome_yours', secondary: 'functionality' },
            'appearance':                { primary: 'make_chrome_yours', secondary: 'functionality' },
            'blockchain-cryptocurrency': { primary: 'productivity',      secondary: 'tools' },
            'developer-tools':           { primary: 'productivity',      secondary: 'developer' },
            'downloads':                 { primary: 'make_chrome_yours', secondary: 'functionality' },
            'fun':                       { primary: 'lifestyle',         secondary: 'entertainment' },
            'music':                     { primary: 'lifestyle',         secondary: 'entertainment' },
            'news-weather':              { primary: 'lifestyle',         secondary: 'news' },
            'productivity':              { primary: 'productivity',      secondary: 'tools' },
            'search':                    { primary: 'productivity',      secondary: 'tools' },
            'shopping':                  { primary: 'lifestyle',         secondary: 'shopping' },
            'social':                    { primary: 'lifestyle',         secondary: 'social' },
            'translation':               { primary: 'productivity',      secondary: 'tools' },
        }

        static pageOf = async (id) => `https://addons.opera.com/en/extensions/details/app_id/${id}/`

        static async slugToId(id) {
            const storePage = `https://addons.opera.com/en/extensions/details/${id}/`
            const html = await Fetch.page(storePage)
            const match = html?.content?.match(/<meta property="aoc:app_id" content="([^"]+)"/)
            return match ? match[1] : null
        }

        static async getUpdateUrl(extensionId) {
            try {
                const url = 'https://extension-updates.opera.com/api/omaha/update/?response=updatecheck&x=' + encodeURIComponent(`id=${extensionId}&v=0.0.0&uc`)

                const response = await fetch(url)
                if (!response.ok) throw new Error(`omaha API call failed: ${response.status}`)

                const xml = await response.text()
                const codebase = xml.match(/codebase="([^"]+)"/)?.[1]
                if (!codebase) throw new Error('no codebase in omaha response')
                return codebase
            } catch (error) {
                console.trace(`Opera omaha lookup failed for ${extensionId}:`, error)
                return `https://addons.opera.com/extensions/download/${extensionId}/`
            }
        }

        static async parsePage(dom) {
            const parseInteger = str => str ? (parseInt(str.replace(/[\s,.']/g, '')) || null) : null
            const metaContent = selector => dom.querySelector(selector)?.getAttribute('content')?.trim()

            const extensionId = metaContent('meta[property="aoc:app_id"]')
            if (!extensionId) return null

            // extensionName
            const extensionName = metaContent('meta[property="og:title"]')
                ?? dom.querySelector('h1[itemprop="name"]')?.textContent?.trim()

            const summary = metaContent('meta[property="og:description"]')
            const description = dom.querySelector('[itemprop="description"]')?.textContent?.trim()

            const extensionLogo = metaContent('meta[property="og:image"]')
                ?? dom.querySelector('img.icon-pkg')?.getAttribute('src')

            // categories
            const categorySlug = dom.querySelector('.breadcrumb a[href*="/category/"]')
                ?.getAttribute('href')?.match(/\/category\/([^/?]+)/)?.[1]
            const categories = categorySlug ? [this.categories[categorySlug]].filter(Boolean) : []

            // ratings
            const rating = parseFloat(dom.querySelector('span.rating#rating-value')?.textContent)
            const numRatings = parseInteger(dom.querySelector('span#rating-count')?.textContent)

            // installs - only on real extensions, absent on built-ins
            const downloadsDt = [...dom.querySelectorAll('section.about dl dt')]
                .find(dt => dt.textContent.trim() === 'Downloads')
            const numInstalls = parseInteger(downloadsDt?.nextElementSibling?.textContent)

            const downloadUrl = await ExtensionStore.Opera.getUpdateUrl(extensionId)

            return {
                browser: Browser.Opera,
                id: extensionId,
                name: extensionName,
                description: summary + "\n\n" + description,
                extensionLogo,
                numInstalls,
                rating,
                numRatings,
                categories,
                downloadUrl
            }
        }
    }
}