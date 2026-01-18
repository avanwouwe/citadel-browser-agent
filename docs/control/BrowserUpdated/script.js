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

    // Set the link if we detected a supported browser
    if (detectedBrowser && configUrl) {
        configLink.href = configUrl;
        configLink.textContent = detectedBrowser + "'s startup configuration";
    } else if (detectedBrowser === 'Safari') {
        // Special case for Safari
        configLink.removeAttribute('href');
        configLink.style.cursor = 'default';
        configLink.style.textDecoration = 'none';
        const parent = configLink.parentElement;
        parent.innerHTML = 'For Safari, open <strong>System Settings</strong> → <strong>General</strong> → <strong>Safari</strong> and check <strong>"Reopen windows from last session"</strong>.';
    } else {
        // Unknown browser - make it non-clickable
        configLink.removeAttribute('href');
        configLink.style.cursor = 'default';
        configLink.style.textDecoration = 'none';
        configLink.textContent = "your browser's startup settings";
    }
});
