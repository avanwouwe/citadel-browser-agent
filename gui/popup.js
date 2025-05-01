window.onload = function() {
    const urlParams = new URLSearchParams(window.location.search)

    document.getElementById('title').textContent = urlParams.get('title') || ''
    document.getElementById('message').innerHTML = urlParams.get('message') || ''
}