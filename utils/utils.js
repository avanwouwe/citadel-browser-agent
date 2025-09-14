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


function getDomain(hostname) {
    if (!hostname) return

    const parts = hostname.split('.');
    const twoPart = parts.slice(-2).join('.')
    const threePart = parts.slice(-3).join('.')
    const tld = parts[parts.length - 1]
    const sld = parts[parts.length - 2]

    if (parts.length < 2) {
        throw new Error(`Cannot retrieve TLD from ${hostname}`);
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

String.prototype.capitalize = function () {
    return this[0].toUpperCase() + this.slice(1).toLowerCase()
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

function isApplication(sitename) {
    return matchDomain(sitename, config.domain.isApplication)  === true || matchDomain(sitename, config.company.applications) === true
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
    return this;
}

function truncateString(str, maxLength) { return isString(str) ? str.truncate(maxLength) : str; }

String.prototype.emptyToUndefined = function() { return this.isEmpty() ? undefined : this }

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

const Tabs = {
    get: (tabIds) => Promise.all(tabIds.map(tabId =>
        new Promise((resolve, reject) => {
            chrome.tabs.get(tabId, tab => {
                if (chrome.runtime.lastError) reject(chrome.runtime.lastError)
                else resolve(tab)
            })
        })
    ))
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
