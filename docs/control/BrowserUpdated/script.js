// Browser configuration URLs
const browserConfig = {
    'Chrome': {
        test: /Chrome/i,
        url: 'chrome://settings/onStartup'
    },
    'Firefox': {
        test: /Firefox/i,
        url: 'about:preferences#general'
    },
    'Edge': {
        test: /Edg/i,
        url: 'edge://settings/onStartup'
    },
    'Opera': {
        test: /OPR|Opera/i,
        url: 'opera://settings/onStartup'
    },
    'Brave': {
        test: /Brave/i,
        url: 'brave://settings/onStartup'
    },
    'Safari': {
        test: /^((?!Chrome|Edg).)*Safari/i,
        url: null // Safari uses System Preferences
    }
};

// Copy URL to clipboard
function copyConfigUrl(url, event) {
    event.preventDefault();
    navigator.clipboard.writeText(url).then(() => {
        alert('URL copied! Paste it into your address bar and press Enter.');
    }).catch(() => {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = url;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        alert('URL copied! Paste it into your address bar and press Enter.');
    });
}

// Detect browser and set startup config link
document.addEventListener('DOMContentLoaded', function() {
    const configLink = document.getElementById('startup-config-link');
    if (!configLink) return;

    const userAgent = navigator.userAgent;
    let detectedBrowser = null;
    let configUrl = null;

    // Check each browser pattern
    // Note: Order matters - check more specific patterns first
    if (browserConfig.Edge.test.test(userAgent)) {
        detectedBrowser = 'Edge';
        configUrl = browserConfig.Edge.url;
    } else if (browserConfig.Brave.test.test(userAgent)) {
        detectedBrowser = 'Brave';
        configUrl = browserConfig.Brave.url;
    } else if (browserConfig.Opera.test.test(userAgent)) {
        detectedBrowser = 'Opera';
        configUrl = browserConfig.Opera.url;
    } else if (browserConfig.Chrome.test.test(userAgent)) {
        detectedBrowser = 'Chrome';
        configUrl = browserConfig.Chrome.url;
    } else if (browserConfig.Firefox.test.test(userAgent)) {
        detectedBrowser = 'Firefox';
        configUrl = browserConfig.Firefox.url;
    } else if (browserConfig.Safari.test.test(userAgent)) {
        detectedBrowser = 'Safari';
        configUrl = browserConfig.Safari.url;
    }

    const parent = configLink.parentElement;

    // Set the content based on detected browser
    if (detectedBrowser && configUrl) {
        parent.innerHTML = `
            Visit ${detectedBrowser}'s startup configuration 
            (<a href="#" onclick="copyConfigUrl('${configUrl}', event)" style="text-decoration: none;">
                <code style="background: #f4f4f4; padding: 2px 6px; border-radius: 3px; user-select: all; cursor: pointer; color: #0066cc;">${configUrl}</code>
            </a>) 
            to enable this feature.
            <br><small style="color: #666; margin-top: 8px; display: inline-block;">
                Click the URL to copy it, then paste it into your browser's address bar and press Enter.
            </small>
        `;
    } else if (detectedBrowser === 'Safari') {
        // Special case for Safari
        parent.innerHTML = 'For Safari, open <strong>System Settings</strong> → <strong>General</strong> → <strong>Safari</strong> and check <strong>"Reopen windows from last session"</strong>.';
    } else {
        // Unknown browser - provide generic instructions
        parent.innerHTML = 'Open your browser\'s settings and look for startup or session options to enable tab restoration.';
    }
});