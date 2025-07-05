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
