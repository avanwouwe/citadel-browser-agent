window.onload = function() {
    function getUrlParameter(name) {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get(name);
    }

    // Inject reason and contact into the page
    document.getElementById('value').textContent = getUrlParameter('value') || 'Not specified';
    document.getElementById('reason').textContent = getUrlParameter('reason') || 'Not specified';
    document.getElementById('contact').textContent = getUrlParameter('contact') || 'your IT support';
};