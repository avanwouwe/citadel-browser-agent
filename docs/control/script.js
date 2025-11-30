// Platform tab switching with OS detection
document.addEventListener('DOMContentLoaded', function() {
    const tabButtons = document.querySelectorAll('.tab-button');
    const platformPanels = document.querySelectorAll('.platform-panel');

    // Detect OS
    function detectOS() {
        const userAgent = navigator.userAgent.toLowerCase();
        const platform = navigator.platform.toLowerCase();

        if (platform.includes('mac') || userAgent.includes('mac')) {
            return 'macos';
        } else if (platform.includes('win') || userAgent.includes('win')) {
            return 'windows';
        }
        // Default to Windows if unknown
        return 'windows';
    }

    // Function to switch platform
    function switchPlatform(platform) {
        // Remove active class from all buttons and panels
        tabButtons.forEach(btn => btn.classList.remove('active'));
        platformPanels.forEach(panel => panel.classList.remove('active'));

        // Add active class to selected button and corresponding panel
        const targetButton = document.querySelector(`[data-platform="${platform}"]`);
        const targetPanel = document.getElementById(platform);

        if (targetButton && targetPanel) {
            targetButton.classList.add('active');
            targetPanel.classList.add('active');
        }

        // Also switch verification panels if they exist (for DriveEncryption)
        const verifyPanel = document.getElementById(`${platform}-verify`);
        if (verifyPanel) {
            verifyPanel.classList.add('active');
        }
    }

    // Auto-detect and set initial platform
    const detectedOS = detectOS();
    switchPlatform(detectedOS);

    // Add click handlers for manual switching
    tabButtons.forEach(button => {
        button.addEventListener('click', function() {
            const targetPlatform = this.getAttribute('data-platform');
            switchPlatform(targetPlatform);
        });
    });
});