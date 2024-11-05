window.onload = function() {
    function getUrlParameter(name) {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get(name);
    }

    // Inject reason and contact into the page
    document.getElementById('title').textContent = getUrlParameter('title') || '';
    document.getElementById('message').innerHTML = getUrlParameter('message') || '';
};