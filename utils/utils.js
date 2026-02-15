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

String.prototype.isURL = function () { return URL_REGEX.test(this) }

String.prototype.toURL = function () {
    try {
        return new URL(this)
    } catch (error) {
        return null
    }
}

URL.prototype.toURL = function () {
    return this
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

String.prototype.truncate = function(maxLength) {
    if (this.length > maxLength) {
        return this.substring(0, maxLength) + "[truncated]";
    }
    return this.toString()
}

String.prototype.htmlNowrap = function () { return `<span style="white-space: nowrap;">${this}</span>` }

String.prototype.htmlMonospace = function () { return `<span style="font-family: 'Courier New', Courier, monospace;">${this}</span>` }

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

function cloneDeep(obj) {
    if (obj === null || typeof obj !== 'object') {
        return obj
    }

    if (obj instanceof Date) {
        return new Date(obj)
    }

    if (Array.isArray(obj)) {
        return obj.map(item => cloneDeep(item))
    }

    const clonedObj = {};
    for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
            clonedObj[key] = cloneDeep(obj[key])
        }
    }
    return clonedObj
}


/**
 * Checks if a hostname matches any domain in a given object of domain patterns
 * @param {string} hostname - The hostname to check (e.g., "host.domain.com")
 * @param {Object} domainPatterns - Object with domain patterns as keys
 * @returns {Object} - Returns value of matching domain key or null if no match
 */
function matchDomain(hostname, domainPatterns) {
    hostname = hostname ?? ""
    domainPatterns = domainPatterns ?? {}

    let parts = hostname.split('.');

    if (IPv4Range.isIPV4(hostname)) {
        parts = parts.reverse()
    }

    for (let i = 0; i < parts.length; i++) {
        const domainToCheck = parts.slice(i).join('.')
        const match = domainPatterns[domainToCheck]
        if (match) {
            return match
        }
    }

    return domainPatterns["*"]
}

function isExternalUser(username) {
    const domain = PasswordCheck.getDomainFromUsername(username)

    if (! domain) return false

    if (Object.keys(config.company.domains)?.length > 0) return ! matchDomain(domain, config.company.domains)

    return matchDomain(domain, config.domain.isPublicMail) === true
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

function debug(...params) {
    console.log(...params)
}

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

        if (once) chrome.runtime.onMessage.removeListener(safeListener)

        return listener(message, sender, sendResponse)
    }

    chrome.runtime.onMessage.addListener(safeListener)
}


/**
 * Helper function to log off a specific application by wiping cookies, local storage, etc.
 * @param {string} domain - The domain of application that should be logged off
 */

async function logOffDomain(domain) {
    // Remove cookies
    await chrome.cookies.getAll({ domain }, (cookies) => {
        cookies.forEach((cookie) => {
            const cookieDetails = {
                url: `http${cookie.secure ? 's' : ''}://${cookie.domain.startsWith('.') ? cookie.domain.substring(1) : cookie.domain}${cookie.path}`,
                name: cookie.name
            }

            chrome.cookies.remove(cookieDetails, () => {
                if (chrome.runtime.lastError) {
                    console.error(`Error removing cookie ${cookie.name}:`, chrome.runtime.lastError)
                }
            })
        })
    })

    // Clear storage, unregister service workers and clear cache
    await injectFuncIntoDomain(domain, () => {
        try {
            localStorage.clear()
            sessionStorage.clear()
            indexedDB?.databases()?.then(dbs => {
                dbs.forEach(db => {
                    indexedDB.deleteDatabase(db.name)
                })
            })
        } catch (e) {
            console.error('Error clearing storage:', e)
        }

        navigator?.serviceWorker.getRegistrations()
            .then(registrations => {
                for (let registration of registrations) {
                    registration.unregister()
                }
            })

        caches?.keys().then(names => {
            for (let name of names) {
                caches.delete(name)
            }
        })
    })
}

// clear all storage *except* for application statistics and extensions exceptions
async function clearStorage() {
    chrome.storage.local.clear()

    await AppStats.flush()
    await ExtensionTrust.flush()

    chrome.runtime.reload()
}

function navigateTo(tabId, url) {
    chrome.tabs.update(tabId, { url })
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
