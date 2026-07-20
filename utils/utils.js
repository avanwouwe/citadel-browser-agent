function assert(condition, message) {
  if (!condition) {
      console.trace(message)
      throw new Error(message || "Assertion failed")
  }
}


function timestampToISO(timestamp) {
	const roundedTimestamp = Math.round(Number(timestamp));
	const date = new Date(roundedTimestamp);
    return date.toISOString()
}

const LINE_SPLIT_REGEX = /\r?\n/;

async function processTextStream(stream, callback) {
  const reader = stream.getReader();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += value;
    const lines = buffer.split(LINE_SPLIT_REGEX);

    // Process all complete lines
    for (let i = 0; i < lines.length - 1; i++) {
      callback(lines[i]);
    }

    // Keep any leftover data as it might not be a full line
    buffer = lines[lines.length - 1];
  }

  // Process any remaining data in the buffer
  if (buffer) {
    callback(buffer);
  }

  reader.releaseLock();
}

class LRUCache {

    #map
    #maxSize

    constructor(maxSize) {
        this.#maxSize = maxSize
        this.#map = new Map()
    }

    get(key) {
        if (!this.#map.has(key)) return undefined

        // Refresh: move to end (= most recently used)
        const value = this.#map.get(key)
        this.#map.delete(key)
        this.#map.set(key, value)
        return value
    }

    set(key, value) {
        if (this.#map.has(key)) {
            this.#map.delete(key)          // refresh position
        } else if (this.#map.size >= this.#maxSize) {
            // First key = least recently used → evict it
            this.#map.delete(this.#map.keys().next().value)
        }
        this.#map.set(key, value)
    }

    /**
     * Returns the cached value for `key`.
     * If missing, calls `fn(key)`, caches, and returns the result.
     *
     * `fn` must be synchronous. For async factories use `getOrSetAsync()`.
     *
     * @param {*}            key
     * @param {function(*):*} fn  - Factory, receives `key` as argument
     * @returns {*}
     */
    getOrSet(key, fn) {
        if (this.#map.has(key)) return this.get(key)

        const value = fn(key)

        if (value instanceof Promise) throw new TypeError('getOrSet(): factory returned a Promise — use getOrSetAsync() instead')

        this.set(key, value)
        return value
    }

    /**
     * Async variant of `getOrSet()`.
     * Always returns a Promise. Stampede-safe: concurrent calls for the
     * same missing key share one in-flight Promise instead of firing
     * the factory multiple times.
     *
     * Failed promises are not cached — the next call will retry.
     *
     * @param {*}                      key
     * @param {function(*):Promise<*>} fn  - Factory, may be async or return a plain value
     * @returns {Promise<*>}
     */
    getOrSetAsync(key, fn) {
        if (this.#map.has(key)) return Promise.resolve(this.get(key))

        // Cache the promise immediately — any concurrent call hitting this
        // key before the factory resolves will get the same promise
        const promise = Promise.resolve(fn(key))
            .then(value => {
                // Only replace if this promise is still the cached one —
                // a delete() or clear() in the meantime should not re-insert
                if (this.get(key) === promise) {
                    this.set(key, value)
                }
                return value
            })
            .catch(err => {
                if (this.get(key) === promise) {
                    this.delete(key)    // don't cache failures
                }
                throw err
            })

        this.set(key, promise)
        return promise
    }

    has(key)    { return this.#map.has(key) }
    delete(key) { return this.#map.delete(key) }
    get size()  { return this.#map.size }
    clear()     { this.#map.clear() }
}

async function getCached(url, replace = true) {
    const CACHE_NAME = 'http-cache'
    const cache = await caches.open(CACHE_NAME)

    const cachedResponse = await cache.match(url)
    if (cachedResponse && ! replace) {
        return cachedResponse
    }

    // If not cached, fetch from network
    try {
        const networkResponse = await fetch(url)

        if (networkResponse.ok) {
            const cachedResponse = networkResponse.clone()
            await cache.put(url, cachedResponse)
        } else {
            console.error(`HTTP error ${networkResponse.status} when fetching ${url}`)
        }

        return networkResponse
    } catch (error) {
        console.error('Fetch failed:', error)
        throw error
    }
}

// load() must throw on failure; success side-effects live inside load()
async function scheduleReload({ errorKey, errorTag, label, url, freqMin, getStatus, load, onError }) {
    async function tick() {
        setTimeout(tick, freqMin * ONE_MINUTE)

        const failureEvents = new EventAccumulator(
            errorKey,
            config.system.downloadReportingFreq * freqMin * ONE_MINUTE,
            (eventCount) => {
                const status = getStatus()
                const isLoaded = status === "loaded"
                const errorRate = eventCount / config.system.downloadReportingFreq

                let level
                if (isLoaded || errorRate <= 0.1) level = Log.TRACE
                else if (errorRate <= 0.25) level = Log.INFO
                else if (errorRate <= 0.75) level = Log.WARN
                else level = Log.ERROR

                logger.log(nowTimestamp(), "report", errorTag, url, level, eventCount,
                    `${label} could not be downloaded ${eventCount} times, current state is '${status}'`)
            })

        try {
            await load()
        } catch (error) {
            onError?.(error)
            failureEvents.increment()
        }
        failureEvents.report()
    }

    return tick()
}

function cachedCall(ttl, fn) {
    let value
    let expiry = 0
    let inflight = null

    return async function (...args) {
        const now = Date.now()

        // Fresh cached value → return immediately
        if (now < expiry) return value

        // A refresh is already running → await it (avoids parallel calls)
        if (inflight) return inflight

        inflight = (async () => {
            try {
                value  = await fn(...args)
                expiry = Date.now() + ttl
                return value
            } finally {
                inflight = null
            }
        })()

        return inflight
    }
}

const CCTLD_WITH_SLD = [
    "uk",
    "jp",
    "au",
    "ca",
    "fr",
    "in",
    "za"
]

const SLD_DOMAINS = [
    "gouv.fr",
    "govt.nz",
    "info.au",
    "nom.za",
    "gob.mx"
];

function stripSubdomain(host) {
    const parts = host.split('.')
    if (parts.length <= 1) return host
    return parts.slice(1).join('.')
}

function inSameDomain(hostA, hostB) {
    return stripSubdomain(hostA) === stripSubdomain(hostB);
}

function getDomain(hostname) {
    if (!hostname) return

    const parts = hostname.split('.');
    const twoPart = parts.slice(-2).join('.')
    const threePart = parts.slice(-3).join('.')
    const tld = parts[parts.length - 1]
    const sld = parts[parts.length - 2]

    if (parts.length < 2) {
        return hostname
    }

    if (CCTLD_WITH_SLD.includes(tld) && sld.length <= 3) {
        return threePart
    }

    if (SLD_DOMAINS.includes(twoPart)) {
        return threePart
    }

    return twoPart
}

const URL_REGEX = /^[a-z]{1,5}:\/\//i

String.prototype.isURL = function() { return URL_REGEX.test(this) }

String.prototype.isWebURL = function() { return this.startsWith('http://') || this.startsWith('https://') }

String.prototype.toURL = function() {
    try {
        return new URL(this)
    } catch (error) {
        return null
    }
}

URL.prototype.isURL = function() { return true }

URL.prototype.isWebURL = function() { return this.protocol === 'http:' || this.protocol === 'https:' }

URL.prototype.toURL = function() { return this }

function safeHref(url) {
    return url?.isWebURL() ? url : null
}

function setInitiator(details) {
    details.initiator = details.documentUrl ?? details.initiator
}

function getSitename(url) {
    return url?.toURL()?.hostname
}

function getRandomInt(min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER) {
    min = Math.ceil(min);
    max = Math.floor(max);
    const coefficient = max - min === 0 ? 1 : max - min
    return Math.floor(Math.random() * coefficient) + min;
}

function nowTimestamp() {
    return new Date().toISOString();
}

function parseTimestamp(str) {
    return str ? new Date(str) : str
}

function nowDatestamp() {
    const date = new Date();
    const year = date.getFullYear();

    // getMonth() returns month from 0 to 11, so we add 1 and pad with zeros if necessary
    const month = String(date.getMonth() + 1).padStart(2, '0');

    // getDate() returns the day of the month from 1 to 31, so we pad with zeros if necessary
    const day = String(date.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
}

function daysSince(str) {
    const date = new Date(str);
    if (isNaN(date)) {
        throw new Error(`Not in YYYY-MM-DD format : ${str}`);
    }

    const today = new Date(nowDatestamp());
    const diff = today - date;
    return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function isString(str) { return typeof str === 'string'; }

String.prototype.isEmpty = function () { return this !== undefined && this !== null && this.length === 0; };

String.prototype.isNotEmpty = function () { return ! this.isEmpty() };

String.prototype.truncate = function (maxLength, position = 'middle', marker = '[truncated]') {
    if (this.length <= maxLength) return this.toString()

    if (maxLength <= marker.length) return this.slice(0, maxLength)

    const remaining = maxLength - marker.length

    // Keep right part
    if (position === 'start') return marker + this.slice(this.length - remaining)

    // Keep left part
    if (position === 'end') return this.slice(0, remaining) + marker

    // Keep middle part
    if (maxLength <= marker.length + 2) return this.slice(0, maxLength)

    const startLength = Math.ceil(remaining / 2)
    const endLength = Math.floor(remaining / 2)

    return this.slice(0, startLength) + marker + this.slice(this.length - endLength)
}

function htmlToPlainText(html) {
    if (html == null) return ""

    let s = String(html)

    // 1. Normalize <br> to a single newline
    s = s.replace(/<br\s*\/?>/gi, "\n")

    // 2. Block-level tags -> newline (covers <p>, <p/>, </p>, <div>, <li>, <h1>..)
    const block = "p|div|li|ul|ol|h[1-6]|section|article|header|footer|blockquote|tr|table"
    s = s.replace(new RegExp(`</?(?:${block})\\b[^>]*>`, "gi"), "\n")

    // 3. Remove any remaining (inline) tags: <b>, </u>, <span ...>, <link ...>, </link>
    s = s.replace(/<\/?[a-z][^>]*>/gi, "")

    // 4. Decode the entities a browser would render
    s = s
        .replace(/&nbsp;/gi, "\u00a0")
        .replace(/&amp;/gi, "&")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;|&apos;/gi, "'")

    // 5. Collapse horizontal whitespace (spaces, tabs) — but NOT newlines
    s = s.replace(/[ \t\f\v]+/g, " ")

    // 6. Trim each line, drop the spaces hugging newlines
    s = s.replace(/[ \t]*\n[ \t]*/g, "\n")

    // 7. Cap runs of blank lines to at most one blank line (like paragraph spacing)
    s = s.replace(/\n{3,}/g, "\n\n")

    // 8. Trim leading/trailing whitespace overall
    return s.trim()
}

function collapseWhitespace(str) {
    return str.replace(/\s+/g, ' ')
}

String.prototype.embedTag = function (tag) { return `<${tag}>${this}</${tag}>` }

Object.prototype.getOrSet = function (attr, defaultValue) {
    if (this.hasOwnProperty(attr)) {
        return this[attr];
    } else {
        this[attr] = defaultValue;
        return defaultValue;
    }
}

Object.prototype.hashCode = function () {
    const str = typeof this == 'string' ? this : JSON.stringify(this);

    return Array.from(str)
        .reduce((s, c) => Math.imul(31, s) + c.charCodeAt(0) | 0, 0)
}

Object.prototype.hashDJB2 = function () {
    const str = typeof this == 'string' ? this : JSON.stringify(this);

    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) + hash) + str.charCodeAt(i); // hash * 33 + c
    }
    return (hash >>> 0).toString(16); // Ensure unsigned integer and convert to hex
}

function isObject(item) {
    return item && typeof item === 'object' && !Array.isArray(item);
}

function mergeDeep(source, target) {
    for (const key in source) {
        if (Object.prototype.hasOwnProperty.call(source, key)) {
            if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue

            if (isObject(source[key])) {
                // If the property is an object, we need to merge recursively
                if (!target[key]) {
                    target[key] = {};
                }
                mergeDeep(source[key], target[key]);
            } else {
                // For primitive values or arrays, just copy the value from source
                target[key] = source[key];
            }
        }
    }
    return target;
}

const DATE_REGEX = /[0-9]{4}-[0-9]{2}-[0-9]{2}/

function isDate(str) {
    return DATE_REGEX.test(str)
}

/**
 * Checks if a hostname matches any domain in a given object of domain patterns
 * Supports exact keys ("domain.com") and wildcard keys ("*.domain.com").
 * @param {string} hostname - The hostname to check (e.g., "host.domain.com")
 * @param {Object} domainPatterns - Object with domain patterns as keys
 * @returns {Object} - Returns value of matching domain key or null if no match
 */
function matchDomain(hostname, domainPatterns) {
    hostname = hostname ?? ""
    domainPatterns = domainPatterns ?? {}

    let parts = hostname.split(".")
    const isIP = IPv4Range.isIPV4(hostname)

    if (isIP) {
        parts = parts.reverse()
    }

    for (let i = 0; i < parts.length; i++) {
        const suffix = parts.slice(i).join(".")

        if (isIP) {
            if (Object.hasOwn(domainPatterns, suffix)) return domainPatterns[suffix]
            continue
        }

        // exact match, only against the full hostname
        if (i === 0 && Object.hasOwn(domainPatterns, hostname)) {
            return domainPatterns[hostname]
        }

        // wildcard key matches the apex (i===0) AND any subdomain (i>0)
        const wildcard = "*." + suffix
        if (Object.hasOwn(domainPatterns, wildcard)) {
            return domainPatterns[wildcard]
        }
    }

    return domainPatterns["*"]
}

String.prototype.replaceWords = function (dictionary) {
    return this
        .split(/(\s+)/)
        .map(token => dictionary[token] ?? token)
        .join('')
}

function isExternalUser(config, username) {
    const domain = PasswordCheck.getDomainFromUsername(username)

    if (! domain) return false

    if (Object.keys(config.company.domains)?.length > 0) return ! matchDomain(domain, config.company.domains)

    return matchDomain(domain, config.domain.publicMail) === true
}

function getPath(obj, path) {
    return path.reduce((acc, key) => acc?.[key], obj)
}

function setPath(obj, path, value) {
    let last = path.pop()
    let target = path.reduce((acc, key) => acc[key], obj)
    target[last] = value
}

function applyPath(obj, attributePaths, func) {
    assert(Array.isArray(attributePaths), "expecting an array", attributePaths)

    for (const dotPath of attributePaths) {
        const path = dotPath.split(".")
        const currValue = getPath(obj, path)

        if (currValue === undefined) continue

        const newValue = func(currValue)
        setPath(obj, [...path], newValue)
    }
}

const debug = console.log.bind(console)

async function sleep(time) {
    await new Promise(r => setTimeout(r, time))
}

class Tabs {
    static async get(tabIds) {
        const tabs = await Promise.all(
            tabIds.map(tabId => chrome.tabs.get(tabId).catch(() => undefined))
        )
        return tabs.filter(Boolean)
    }
}

function onMessage(type, listener, once= false) {
    if (typeof type !== 'string') {
        once = listener
        listener = type
        type = undefined
    }

    function safeListener(message, sender, sendResponse) {
        if (sender && sender.id !== chrome.runtime.id) return

        if (type && message.type !== type) return

        // let the sender specify the sender.url, to allow senders to handle pushState-manipulation of URL bar
        const context = {...sender}
        if (message.pageUrl?.toURL()?.origin === sender.url?.toURL()?.origin) {
            context.url = message.pageUrl ?? sender.url
        }

        if (once) chrome.runtime.onMessage.removeListener(safeListener)

        return listener(message, context, sendResponse)
    }

    chrome.runtime.onMessage.addListener(safeListener)
}


/**
 * Helper function to log off a specific application by wiping cookies, local storage, etc.
 * @param {string} domain - The domain of application that should be logged off
 */

async function logOffDomain(domain) {
    // Remove cookies
    const cookies = await chrome.cookies.getAll({ domain })
    await Promise.all(cookies.map(cookie =>
        chrome.cookies.remove({
            url: `http${cookie.secure ? 's' : ''}://${cookie.domain.startsWith('.') ? cookie.domain.substring(1) : cookie.domain}${cookie.path}`,
            name: cookie.name
        })
    ))

    // Clear storage, unregister service workers and clear cache
    await injectFuncIntoDomain(domain, async () => {
        try {
            localStorage.clear()
            sessionStorage.clear()

            const dbs = await indexedDB.databases()
            await Promise.all(dbs.map(db => {
                const req = indexedDB.deleteDatabase(db.name)
                return new Promise((res, rej) => {
                    req.onsuccess = res
                    req.onerror = rej
                })
            }))
        } catch (e) {
            console.error('Error clearing storage:', e)
        }

        const registrations = await navigator.serviceWorker.getRegistrations()
        await Promise.all(registrations.map(r => r.unregister()))

        const names = await caches.keys()
        await Promise.all(names.map(name => caches.delete(name)))
    })
}

function evaluateBlacklist(entry, whitelist, blacklist, defaultValue) {
    if (Array.isArray(entry)) return entry.every(item => evaluateBlacklist(item, whitelist, blacklist, defaultValue))

    assert(isString(entry), "entry must be a string")
    assert(Array.isArray(whitelist), "whitelist must be an array")
    assert(Array.isArray(blacklist), "blacklist must be an array")

    if (blacklist.includes(entry)) return false
    if (whitelist.includes(entry) || whitelist.includes("*")) return true
    if (blacklist.includes("*")) return false
    return defaultValue
}

class RingBuffer {
    constructor(size) {
        this.size = size
        this.buffer = new Array(size)
        this.pointer = 0
        this.isFull = false
    }

    push(item) {
        this.buffer[this.pointer] = item
        this.pointer = (this.pointer + 1) % this.size
        if (this.pointer === 0) this.isFull = true
    }

    get() {
        if (!this.isFull) {
            return this.buffer.slice(0, this.pointer)
        } else {
            return this.buffer.slice(this.pointer)
                .concat(this.buffer.slice(0, this.pointer))
        }
    }
}

function serializeError(error) {
    if (error instanceof Error) {
        return {
            message: error.message,
            name: error.name,
            stack: error.stack,
        }
    }

    if (typeof error === "object" && error !== null) {
        return {
            message: error.message || JSON.stringify(error),
            name: error.name || "NonErrorObject",
            info: error, // optional, if it’s small and structured-cloneable
        }
    }

    if (typeof error === "string") {
        return { message: error, name: "StringError" }
    }

    return { message: String(error), name: typeof error }
}

function serializeToText(obj, indent = 0) {
    const indentStr = '  '.repeat(indent)
    let text = ''

    if (Array.isArray(obj)) {
        obj.forEach((item) => {
            if (typeof item === 'object' && item !== null) {
                text += serializeToText(item, indent)
            } else {
                text += `${indentStr}- ${item}\n`
            }
        });
    } else if (typeof obj === 'object' && obj !== null) {
        Object.entries(obj).forEach(([key, value]) => {
            if (value === undefined) {
                return
            }

            if (Array.isArray(value)) {
                text += `${indentStr}${key}:\n`
                text += serializeToText(value, indent + 1)
            } else if (typeof value === 'object' && value !== null) {
                text += `${indentStr}${key}:\n`;
                text += serializeToText(value, indent + 1)
            } else {
                text += `${indentStr}${key}: ${value}\n`
            }
        })
    }

    return text
}

function mergeArrays(...arrays) {
    return [...new Set(arrays.flat())]
}

async function confirmLogin(tabId, url, maxSeconds) {
    const POLL = 2
    let waited = 0

    while (true) {
        await sleep(POLL * ONE_SECOND)
        waited += POLL

        // tab gone? trust MFA presence to tell us if the password was accepted
        const tab = await chrome.tabs.get(tabId).catch(() => null)
        if (!tab) return MFACheck.isRunning(url)

        // path moved => server accepted the password
        const prevPath = url.origin + url.pathname
        const currPath = tab.url.origin + tab.url.pathname
        if (prevPath !== currPath) return true

        if (waited >= maxSeconds) {
            // SPA case: no URL move, but an MFA challenge is live => password was accepted
            return MFACheck.isRunning(url)

        }
    }
}

function sendMessage(type, message, handler) {
    if (type && typeof type !== 'string') {
        handler = message
        message = type
        type = undefined
    }

    if (message && typeof message !== 'object') {
        handler = message
        message = undefined
    }

    message = message ?? { }
    if (typeof message !== 'object') assert("message must be an object")
    if (message?.type != null) type = message.type
    if (type != null && message != null) message.type = type

    // ensure that sender.url will have URL currently in bar, and not just the page that was originally loaded
    if (typeof window !== 'undefined' ) {
        message.pageUrl = window.location.href
    }

    chrome.runtime.sendMessage(message, handler)
}

async function sendMessagePromise(type, message) {
    return new Promise((resolve, reject) => {
        sendMessage(type, message, result => {
            if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError)
            } else if (result && result.error) {
                reject(result.error)
            } else {
                resolve(result)
            }
        })
    })
}

const callServiceWorker = (type, message) => sendMessagePromise(type, message).then(result => result?.data)

function restartExtension() {
    // If notifications are showing when we restart, the extension context of those tabs will be invalidated
    // thus making it impossible for users to remove the modals. To prevent that, better removed them.
    // This does mean that in some edge cases, pages that were "blocked for security reasons" are unblocked.
    Modal.removeFromDomain("*").then(() => chrome.runtime.reload())
}

function isLocalLoopback(hostname) { return IPv4Range.isLoopback(hostname) || hostname.toLowerCase() === 'localhost'}

/**
 * Compares two semver strings.
 * Returns -1 if a < b, 0 if a === b, 1 if a > b
 */
function compareSemver(a, b) {
    const parse = v => v.split(".").map(Number)
    const [aMajor, aMinor, aPatch] = parse(a)
    const [bMajor, bMinor, bPatch] = parse(b)

    if (aMajor !== bMajor) return aMajor < bMajor ? -1 : 1
    if (aMinor !== bMinor) return aMinor < bMinor ? -1 : 1
    if (aPatch !== bPatch) return aPatch < bPatch ? -1 : 1
    return 0
}

function semverBefore(version, threshold) {
    return compareSemver(version, threshold) === -1
}

function trySafe(fn, ...args) {
    try {
        const result = fn(...args)
        if (result instanceof Promise)
            return result.catch(e => console.warn("trySafe caught:", e))
        return result
    } catch (err) {
        console.warn("trySafe caught:", err)
    }
}