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
        if (config.company.logo?.startsWith("data:")) {
            return config.company.logo
        }

        return navigator.onLine ? config.company.logo ?? Logo.DEFAULT : Logo.DEFAULT
    }
}

function openDashboard(tabName, foreground = true) {
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
 * Supported tags: <b>, <i>, <u>, <strong>, <em>, <link>, <code>
 * Links can have id attributes: <link id="mylink">click here</link>
 *
 * @param {string} text - Text with safe markup
 * @param {Object} handlers - Click handlers keyed by id
 * @returns {DocumentFragment} Safe DOM fragment
 */

if (typeof HTMLElement !== 'undefined') {
    HTMLElement.prototype.safeInnerHTML = function(text, handlers = {}) {
        const allowedTags = ['b', 'i', 'u', 'strong', 'em', 'code', 'link']
        const container = document.createDocumentFragment()
        const stack = [container]

        let currentText = ''
        let i = 0

        while (i < text.length) {
            if (text[i] === '<') {
                // Match: <link id="name" href="url">text</link> or <link id="name">text</link>
                const tagMatch = text.slice(i).match(/^<(\/?)([\w]+)(?:\s+id="([^"]*)")?(?:\s+href="([^"]*)")?>/);

                if (tagMatch) {
                    const [fullMatch, isClosing, tagName, id, href] = tagMatch

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
                            if (tagName === 'link') {
                                if (href) {
                                    // Real link with href - create <a> tag
                                    el = document.createElement('a')
                                    el.href = href
                                    el.target = '_blank'
                                    el.rel = 'noopener noreferrer'
                                } else {
                                    // Clickable action - create <span>
                                    el = document.createElement('span')
                                    el.className = 'i18n-link'
                                    el.style.cursor = 'pointer'

                                    if (id && handlers[id]) {
                                        el.addEventListener('click', handlers[id])
                                    }
                                }
                            } else {
                                el = document.createElement(tagName)
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
