window.onload = function() {
    function getUrlParameter(name) {
        const urlParams = new URLSearchParams(window.location.search)
        return urlParams.get(name)
    }

    // Inject reason and contact into the page
    const blacklistedUrl = getUrlParameter('value')
    const blacklistReason = getUrlParameter('reason')
    const allowException = getUrlParameter('e')
    document.getElementById('value').textContent = blacklistedUrl || 'Not specified'
    document.getElementById('reason').textContent = blacklistReason || 'Not specified'
    document.getElementById('contact').textContent = getUrlParameter('contact') || 'your IT support'

    const exceptionSectionToggle = document.getElementById('exceptionSectionToggle')
    const exceptionSection = document.getElementById('exceptionSection')

    if (allowException) {
        exceptionSectionToggle.style.display = 'block'

        exceptionSectionToggle.addEventListener('click', function() {
            exceptionSection.style.display = 'block'
            exceptionSectionToggle.style.display = 'none'
        })

        const exceptionReasonInput = document.getElementById('exceptionReason')
        const submitButton = document.getElementById('submitException')

        // Enable submit button only when text field is filled
        submitButton.disabled = true
        exceptionReasonInput.addEventListener('input', function() {
            submitButton.disabled = !exceptionReasonInput.value.trim()
        })

        // Handle exception request submission
        submitButton.addEventListener('click', function() {
            const exceptionReason = exceptionReasonInput.value.trim()

            chrome.runtime.sendMessage({
                type: 'allow-blacklist',
                url: blacklistedUrl,
                description: blacklistReason,
                reason: exceptionReason
            })

            alert('Your exception request has been submitted. You can retry the operation.')

            history.go(-2)
        })

    }
}