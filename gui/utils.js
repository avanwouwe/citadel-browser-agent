class Icons {
    static delete = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="55 0 402 512" width="12" height="16" fill="currentColor" aria-hidden="true">
                      <path d="M88.6,464.7C91,491.5,113.4,512,140.2,512h231.5c26.9,0,49.3-20.5,51.6-47.3l25.6-335.9H63L88.6,464.7zM420.8,154.9l-23.5,307.5c-1.2,13.4-12.2,23.4-25.6,23.4H140.2c-13.4,0-24.4-10.1-25.6-23.1L91.1,154.9H420.8z"/>
                      <path d="M183,435.3c5.9-.3,10.4-5.4,10-11.3l-10.1-202.2c-.4-5.9-5.4-10.3-11.3-10c-5.9.4-10.4,5.4-10,11.3l10.1,202.2C172,431.2,177.1,435.7,183,435.3zM256,435.4c5.9,0,10.7-4.8,10.7-10.6V222.5c0-5.9-4.8-10.6-10.7-10.6c-5.9,0-10.7,4.8-10.7,10.6v202.2C245.3,430.6,250.1,435.4,256,435.4zM329,435.3c5.9,.4,10.9-4.1,11.3-10l10.1-202.2c.3-5.9-4.1-10.9-10-11.3c-5.9-.4-10.9,4.1-11.3,10L319.1,424.1C318.7,429.9,323.2,435,329,435.3z"/>
                      <path d="M439.1,64.5c0,0-34.1-5.7-43.3-8.5c-8.3-2.5-80.8-13.6-80.8-13.6l-2.7-19.3C310.4,9.9,299.5,0,286.6,0h-30.7H225.3c-12.8,0-23.7,9.9-25.6,23.2l-2.7,19.3c0,0-72.5,11-80.8,13.6c-9.3,2.8-43.4,8.5-43.4,8.5C62.5,67.4,55.3,77.2,55.3,88.4v21.9h200.7h200.7V88.4C456.7,77.2,449.5,67.4,439.1,64.5zM276.3,38.8h-40.6c-3.6,0-6.5-2.9-6.5-6.5s2.9-6.5,6.5-6.5h40.6c3.6,0,6.5,2.9,6.5,6.5S279.9,38.8,276.3,38.8z"/>
                    </svg>`

    static search = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 102 102"
                          width="19" height="19" fill="currentColor" aria-hidden="true">
                       <path d="M81.1,17.1c-10.9-10.9-28.7-10.9-39.6,0c-10,10-10.8,25.6-2.6,36.6l-4.9,4.9c-2.3-.5-4.8.2-6.6,2l-20.9,20.9c-2.8,2.8-2.8,7.4,0,10.3s7.4,2.8,10.3,0l20.9-20.9c1.8-1.8,2.4-4.3,2-6.6l4.9-4.9c11,8.2,26.6,7.3,36.6-2.6C92,45.8,92,28,81.1,17.1zM47.1,51c-7.8-7.8-7.8-20.5,0-28.3c7.8-7.8,20.5-7.8,28.3,0c7.8,7.8,7.8,20.5,0,28.3C67.6,58.8,54.9,58.8,47.1,51z"/>
                     </svg>`
}

async function readJsonFile(path) {
    const response = await fetch(path)
    if (!response.ok) {
        throw new Error('File not found or cannot be loaded: ' + response.status)
    }
    return await response.json()
}

const htmlEscapeChars = {
    '&': '&amp;',
    '"': '&quot;',
    "'": '&#39;',
    '<': '&lt;',
    '>': '&gt;',
    '`': '&#96;',
    '=': '&#61;',
    '/': '&#47;',
    '\\': '&#92;',
    '{': '&#123;',
    '}': '&#125;',
    '%': '&#37;'
}
const htmlEscapeRegex = new RegExp(`[${Object.keys(htmlEscapeChars).map(ch => '\\' + ch).join('')}]`, 'g')

String.prototype.escapeHtmlEntities= function () {
    return this.replace(htmlEscapeRegex, ch => htmlEscapeChars[ch])
}

class Logo {
    static DEFAULT = chrome.runtime.getURL('/gui/images/icon128.png')

    static getLogo() {
        return config.company.logo ?? Logo.DEFAULT
    }
}

function navigateTo(tabId, url) {
    chrome.tabs.update(tabId, { url })
}

function openDashboard(tabName = undefined, foreground = true) {
    const dashboardRoot = chrome.runtime.getURL("/gui/dashboard.html");
    const dashboardUrl = dashboardRoot + (tabName ? `?tab=${tabName}` : '')

    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
        const currentTab = tabs[0]
        if (currentTab && currentTab.url.startsWith(dashboardUrl)) {
            chrome.tabs.update(currentTab.id, { url: dashboardUrl })
        } else {
            chrome.tabs.create({ url: dashboardUrl, active: foreground })
        }
    })
}

function html2dom(html) {
    return new DOMParser().parseFromString(html, 'text/html')
}

/**
 * Enforce a maximum reason length on a textarea and keep a live "characters
 * remaining" counter in sync, turning it red as it approaches the limit.
 *
 * @param {HTMLTextAreaElement} textarea - the reason input
 * @param {HTMLElement} counter - element used to display the remaining count
 * @param {(remaining: number) => string} formatRemaining - builds the counter label
 */
async function attachReasonLimit(textarea, counter, formatRemaining) {
    const { maxReasonLength } = await callServiceWorker("GetConfig")

    textarea.maxLength = maxReasonLength
    const threshold = Math.max(10, Math.ceil(maxReasonLength * 0.1))

    const update = () => {
        const remaining = maxReasonLength - textarea.value.length
        counter.textContent = formatRemaining(remaining)
        counter.classList.toggle('reason-counter-warning', remaining <= threshold)
    }

    textarea.addEventListener('input', update)
    update()
}

function domReady() {
    return new Promise(resolve => {
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", resolve, { once: true })
        } else {
            resolve()
        }
    })
}

function containsSvg(element, dStr) {
    const paths = element?.querySelectorAll('svg path') ?? []
    return Array.from(paths).some(path => path.getAttribute('d') === dStr)
}

async function getSecurityAnalysisUrl(input) {
    if (IPv4Range.isIPV4(input)) {
        return `https://www.virustotal.com/gui/ip-address/${input}`
    }

    if (input.isURL()) {
        const hash = await sha256Hash(input);
        return `https://www.virustotal.com/gui/url/${hash}`
    }

    return `https://www.virustotal.com/gui/domain/${input}`
}

async function sha256Hash(str) {
    const encoder = new TextEncoder()
    const data = encoder.encode(str)
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
    return hashHex
}


/**
 * Parse safe markup and create DOM elements
 * Supported tags: <b>, <i>, <u>, <strong>, <em>, <link>, <code>, <nowrap>, <mono>, <p>, <br>
 * Links can have id attributes: <link id="mylink">click here</link>
 *
 * @param {string} text - Text with safe markup
 * @param {Object} handlers - Click handlers keyed by id
 * @returns {DocumentFragment} Safe DOM fragment
 */

if (typeof HTMLElement !== 'undefined') {
    HTMLElement.prototype.safeInnerHTML = function(text, handlers = {}) {
        const allowedTags = ['p', 'br', 'b', 'i', 'u', 'strong', 'em', 'code', 'link', 'nowrap', 'mono']
        const container = document.createDocumentFragment()
        const stack = [container]

        let currentText = ''
        let i = 0

        while (i < text.length) {
            if (text[i] === '<') {
                const tagMatch = text.slice(i).match(/^<(\/?)([\w]+)(?:\s+id="([^"]*)")?(?:\s+href="([^"]*)")?>/);

                if (tagMatch) {
                    const [fullMatch, isClosing, rawTagName, id, href] = tagMatch
                    const tagName = rawTagName.toLowerCase()

                    if (allowedTags.includes(tagName)) {
                        if (currentText) {
                            stack[stack.length - 1].appendChild(document.createTextNode(currentText))
                            currentText = ''
                        }

                        if (isClosing === '/') {
                            if (stack.length > 1) {
                                const el = stack.pop()
                                stack[stack.length - 1].appendChild(el)
                            }
                        } else {
                            let el
                            if (tagName === 'br') {
                                stack[stack.length - 1].appendChild(document.createElement('br'))
                                i += fullMatch.length
                                continue
                            } else if (tagName === 'link') {
                                if (href) {
                                    el = document.createElement('a')
                                    el.href = href
                                    el.target = '_blank'
                                    el.rel = 'noopener noreferrer'
                                } else {
                                    el = document.createElement('span')
                                    el.className = 'i18n-link'
                                    el.style.cursor = 'pointer'
                                    if (id && handlers[id]) {
                                        el.addEventListener('click', handlers[id])
                                    }
                                }
                            } else if (tagName === 'nowrap') {
                                el = document.createElement('span')
                                el.style.whiteSpace = 'nowrap'
                            } else if (tagName === 'mono') {
                                el = document.createElement('span')
                                el.style.fontFamily = "'Courier New', Courier, monospace"
                            } else {
                                el = document.createElement(tagName)                         // handles <b>, <i>, <p>, etc.
                            }

                            if (id) {
                                el.id = id
                            }

                            stack.push(el)
                        }

                        i += fullMatch.length
                        continue
                    }
                }
            }

            currentText += text[i]
            i++
        }

        if (currentText) {
            stack[stack.length - 1].appendChild(document.createTextNode(currentText))
        }

        while (stack.length > 1) {
            const el = stack.pop()
            stack[stack.length - 1].appendChild(el)
        }

        this.appendChild(container)
    }
}