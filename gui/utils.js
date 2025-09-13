async function readJsonFile(path) {
    const response = await fetch(path)
    if (!response.ok) {
        throw new Error('File not found or cannot be loaded: ' + response.status)
    }
    return await response.json()
}

const htmlAttributes = {
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
const htmlAttributesRegex = new RegExp(`[${Object.keys(htmlAttributes).map(ch => '\\' + ch).join('')}]`, 'g')

String.prototype.escapeHtmlAttr= function () {
    return this.replace(htmlAttributesRegex, ch => htmlAttributes[ch])
}

class Logo {
    static DEFAULT = chrome.runtime.getURL('/gui/images/icon128.png')

    static getLogo() {
        if (config.company.logo.startsWith("data:")) {
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
    const template = document.createElement('template')
    template.innerHTML = html
    return template.content.cloneNode(true)
}

function containsSvg(element, dStr) {
    const paths = element.querySelectorAll('svg path')
    return Array.from(paths).some(path => path.getAttribute('d') === dStr)
}
