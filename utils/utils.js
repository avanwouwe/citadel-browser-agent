function assert(condition, message) {
  if (!condition) {
    throw new Error(message || "Assertion failed");
  }
}


function timestampToISO(timestamp) {
	const roundedTimestamp = Math.round(Number(timestamp));
	const date = new Date(roundedTimestamp);
    return date.toISOString()
}


async function fetchTextStream(url) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error('Network response was not OK, unable to retrieve ${url}');
    }
    
    return response.body.pipeThrough(new TextDecoderStream())
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
    const CACHE_NAME = 'http-cache';
    const cache = await caches.open(CACHE_NAME);

    const cachedResponse = await cache.match(url);
    if (cachedResponse && ! replace) {
        return cachedResponse;
    }

    // If not cached, fetch from network
    try {
        const networkResponse = await fetch(url);

        if (networkResponse.ok) {
            const cachedResponse = networkResponse.clone();
            cache.put(url, cachedResponse);
        } else {
            console.error('Network response was not OK:', networkResponse.status);
        }

        return networkResponse;
    } catch (error) {
        console.error('Fetch failed:', error);
        throw error;
    }
}
function getDomain(hostname) {
    const parts = hostname.split('.');

    if (parts.length < 2) {
        throw new Error(`Cannot retrieve TLD from ${hostname}`);
    }

    return parts.slice(-2).join('.');
}

function getSitename(url) {
    return isHttpUrl(url) ? new URL(url).hostname : null
}

function isKnownApplication(sitename) {
    const domain = getDomain(sitename)
    return config.domain.isKnownApplication[domain] === true
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

function daysSince(date) {
    date = new Date(date);
    if (isNaN(date)) {
        throw new Error("Invalid date format. Must be in YYYY-MM-DD format.");
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

String.prototype.htmlNowrap = function () { return `<span style="white-space: nowrap;">${this}</span>`; };

String.prototype.htmlMonospace = function () { return `<span style="font-family: 'Courier New', Courier, monospace;">${this}</span>`; };

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
