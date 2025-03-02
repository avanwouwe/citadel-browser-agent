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
    }, true);

    function copyFile(file) { return {
        lastModifiedDate: file.lastModifiedDate,
        name: file.name,
        size: file.size,
        type: file.type,
    } }

    document.addEventListener('change', function(event) {
        if (event.target?.type === 'file') {
            for (const file of event.target.files) {
                chrome.runtime.sendMessage({ type: 'file-select', subtype : 'picked file', file: copyFile(file)
             });
            }
        }
    }, true);

    document.addEventListener('drop', function(event) {
        Array.from(event.dataTransfer.files).forEach(file => {
            chrome.runtime.sendMessage({ type: 'file-select', subtype : 'dropped file', file: copyFile(file) });
        })

        Array.from(event.dataTransfer.items).forEach(item => {
            if (item.kind === 'file') {
                const file = item.getAsFile();
                chrome.runtime.sendMessage({ type: 'file-select', subtype : 'dropped file', file: copyFile(file) });
            }
        });

    }, true);

});