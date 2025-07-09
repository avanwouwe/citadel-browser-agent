async function readJsonFile(path) {
    const response = await fetch(path)
    if (!response.ok) {
        throw new Error('File not found or cannot be loaded: ' + response.status)
    }
    return await response.json()
}


function getQueryParam(name) {
    const params = new URLSearchParams(window.location.search)
    return params.get(name)
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