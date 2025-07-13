function showPopup(message, title = "Citadel browser agent"
                   , width = 350, height = 200
                   , left = 200, top = 200)
{
    const url = chrome.runtime.getURL("gui/popup.html")
    const params = new URLSearchParams({ message: message, title: title })

    chrome.windows.create({
        url: `${url}?${params.toString()}`,
        type: 'popup',
        width: width,
        height: height,
        left: left,
        top: top
    })
}

function blockPage(tabId, reason, blockedPage) {
    tabState?.setState(tabId, "BlockedPage", {
        reason,
        url: blockedPage,
        contact: config.company.contact,
        logo: config.company.logo,
        allowException: config.blacklist.exceptions.duration !== undefined
    })

    chrome.tabs.update(tabId, { url: chrome.runtime.getURL("gui/blocked.html") })
}


function blockDomainModal(domain, message, exceptionEvent) {
    const options = {
        logo: config.company.logo,
        message: message,
        exception: {
            request: t("block-modal.request-exception"),
            requestHeader: t("block-modal.request-exception-header"),
            provideReason: t("block-modal.provide-reason"),
            submitRequest: t("block-modal.submit-request"),
            exceptionEvent
        }
    }

    forAllTabs(domain, async (options) => {
        if (document.getElementById('blockOverlayShadowRootHost')) return

        const res = await fetch(chrome.runtime.getURL('/gui/modal.html'))
        const html = await res.text()

        const host = document.createElement('div')
        host.id = 'blockOverlayShadowRootHost'
        const shadow = host.attachShadow({ mode: 'closed' })
        shadow.innerHTML = html
        document.body.appendChild(host)

        shadow.getElementById('blockModalLogo').src = options.logo || ''
        shadow.getElementById('blockModalMessage').innerHTML = options.message || ''
        shadow.getElementById('exceptionToggle').innerHTML = options.exception.request || ''
        shadow.getElementById('exceptionLabel').innerText = options.exception.requestHeader || ''
        shadow.getElementById('exceptionTextarea').placeholder = options.exception.provideReason || ''
        shadow.getElementById('exceptionSubmit').innerText = options.exception.submitRequest || 'Submit'

        // Toggle logic (show/hide request exception section)
        const toggle = shadow.getElementById('exceptionToggle')
        const exceptionSection = shadow.getElementById('exceptionSection')
        toggle.onclick = () => {
            exceptionSection.style.display =
                (exceptionSection.style.display === 'flex') ? 'none' : 'flex'
            if (exceptionSection.style.display === 'flex') {
                shadow.getElementById('exceptionTextarea').focus()
            }
        }

        // Handle textarea input/enable submit button
        const textarea = shadow.getElementById('exceptionTextarea')
        const submit = shadow.getElementById('exceptionSubmit')
        const resultDiv = shadow.getElementById('exceptionResult')
        textarea.addEventListener('input', () => {
            submit.disabled = !textarea.value.trim()
        })

        submit.addEventListener('click', function() {
            const reason = textarea.value.trim()
            submit.disabled = true
            textarea.disabled = true
            resultDiv.textContent = ""
            resultDiv.className = ""

            let exceptionMessage = Object.assign({}, options.exception.exceptionEvent || {})
            exceptionMessage.reason = reason

            chrome.runtime.sendMessage(exceptionMessage)
        })
    }, [options])
}

function unblockDomainModal(domain) {
    forAllTabs(domain, () => {
        const host = document.getElementById('blockOverlayShadowRootHost')
        if (host) host.remove()
    })
}

function forAllTabs(domain, func, args = []) {
    chrome.tabs.query({url: [`*://*.${domain}/*`]}, (tabs) => {
        tabs.forEach((tab) => {
            chrome.scripting.executeScript( { target: { tabId: tab.id }, func, args } )
        })
    })
}

function setWarning(warning) {
    if (warning) {
        chrome.action.setBadgeText({ text: "⚠️" })
        chrome.action.setBadgeBackgroundColor({ color: "#FF0000" })
    } else {
        chrome.action.setBadgeText({ text: "" })
        chrome.action.setBadgeBackgroundColor({ color: "#808080" })
    }
}

function raiseAlert(id, title, message) {
    const notification = {
        type: "basic",
        iconUrl: config.company.logo,
        title: title,
        message: message
    }

    if (Browser.version.brand !== Browser.Firefox) {
        notification.requireInteraction = true
    }

    chrome.notifications.create(id, notification)
}

function cancelAlert(id) {
    chrome.notifications.clear(id)
}

chrome.notifications.onClicked.addListener(function(notificationId) {
    chrome.tabs.create({ url: chrome.runtime.getURL("/gui/dashboard.html") })
    chrome.notifications.clear(notificationId)
})