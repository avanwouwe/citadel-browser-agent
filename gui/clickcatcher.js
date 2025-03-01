document.addEventListener('DOMContentLoaded', () => {
    document.addEventListener('click', function(event) {
        chrome.runtime.sendMessage({type: "user-interaction", event});
    }, true);

    document.addEventListener('keydown', function(event) {
        if (event.key === 'Enter') {
            chrome.runtime.sendMessage({type: "user-interaction", event});
        }
    }, true);

    window.addEventListener('beforeprint', function() {
        chrome.runtime.sendMessage({type: 'print-dialog'});
    });

});