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
    const url = chrome.runtime.getURL("gui/blocked.html")
    const params = new URLSearchParams({
        reason,
        value: blockedPage,
        contact: config.company.contact,
    })

    if (config.blacklist.exceptions.duration) {
        params.set('e', 12)     // security by obscurity, magic number, all true.. but it's better than nothing
    }

    chrome.tabs.update(tabId, { 'url' : `${url}?${params.toString()}` })
}

function blockDomainModal(domain, message, exceptionMessage) {
    const logo = config.company.logo || chrome.runtime.getURL('/gui/images/icon128.png')

    forAllTabs(domain, (message, logo, exceptionMessage) => {
        if (document.getElementById('blockOverlayShadowRootHost')) return

        const host = document.createElement('div')
        host.id = 'blockOverlayShadowRootHost'
        const shadow = host.attachShadow({ mode: 'closed' })
        const style = document.createElement('style')
        style.textContent = `
            #blockOverlay {
                all: initial;
                position:fixed;
                z-index:2147483647;
                left:0; top:0; width:100vw; height:100vh;
                background:rgba(0,0,0,0.7);
                display:flex; justify-content:center; align-items:center;
            }
            .modal {
                all: unset;
                background:white; padding:2em 3em; border-radius:10px; text-align:left;
                box-shadow:0 5px 20px #0004; display:flex; align-items:center; gap:1em;
                min-width:280px;
                min-height:120px;
                font-family: Arial, sans-serif;
                font-size: 16px;
                white-space: pre-wrap;
            }
            .icon {
                width:100px;
                margin-right:1em;
            }
            .column {
                display: flex;
                flex-direction: column;
                align-items: stretch;
                min-width:220px;
                flex: 1 1 0%;
            }
            .message {
                line-height:1.4;
                margin-bottom: 1em;
            }
            .exception-toggle {
                cursor: pointer;
                margin-bottom: 0.3em;
                user-select: none;
            }
            .clickable {
                color: #007bff;
                text-decoration: underline;
                transition: color .18s;
            }
            .exception-toggle:hover .clickable, 
            .exception-toggle:focus .clickable {
                color: #0056b3;
            }
            .exception-section {
                display: none;
                flex-direction: column;
                align-items: stretch;
                width:100%;
                margin-top:0.5em;
            }
            .exception-title { font-size: 1.1em; font-weight: bold; margin-bottom: 0.4em; }
            .exception-reason {
                width:100%; min-width:210px; min-height: 70px;
                padding: 0.4em; margin-bottom: 0.3em; resize:vertical;
            }
            .exception-submit {
                padding: 0.5em 1.5em; background-color: #007bff; color: white; border: none;
                cursor: pointer; border-radius: 4px; transition: background .2s;
            }
            .exception-submit:hover:not(:disabled) { background-color: #0056b3; }
            .exception-submit:disabled {
                background-color: #d3d3d3; color: #808080;
                cursor: not-allowed; opacity: 0.7;
            }
            .exception-success, .exception-error {
                margin-top:0.5em; font-weight:bold; color: green; text-align: center;
            }
            .exception-error { color: #990000; }
        `

        // Main overlay elements
        const overlay = document.createElement('div')
        overlay.id = 'blockOverlay'
        const modal = document.createElement('div')
        modal.className = 'modal'

        // Left icon
        const icon = document.createElement('img')
        icon.className = 'icon'
        icon.src = logo
        icon.alt = ''

        // Right column
        const column = document.createElement('div')
        column.className = 'column'

        const messageDiv = document.createElement('div')
        messageDiv.className = "message"
        messageDiv.innerHTML = message

        // --- Exception Request UI ---
        const toggle = document.createElement('div')
        toggle.className = 'exception-toggle'
        toggle.innerHTML = 'In urgent and exceptional cases you can <span class="clickable">request an exception</span> if you are blocked.'

        // Exception Section
        const exceptionSection = document.createElement('div')
        exceptionSection.className = 'exception-section'

        const label = document.createElement('div')
        label.className = 'exception-title'
        label.textContent = "Request an Exception"

        const textarea = document.createElement('textarea')
        textarea.className = 'exception-reason'
        textarea.placeholder = "Please provide your reason for requesting an exception"

        const submit = document.createElement('button')
        submit.className = 'exception-submit'
        submit.textContent = 'Submit Request'

        submit.disabled = true
        textarea.addEventListener('input', function() {
            submit.disabled = !textarea.value.trim()
        })

        const resultDiv = document.createElement('div')
        exceptionSection.appendChild(label)
        exceptionSection.appendChild(textarea)
        exceptionSection.appendChild(submit)
        exceptionSection.appendChild(resultDiv)

        column.appendChild(messageDiv)
        column.appendChild(toggle)
        column.appendChild(exceptionSection)

        toggle.onclick = () => {
            exceptionSection.style.display = (exceptionSection.style.display === 'flex') ? 'none' : 'flex'
        }

        submit.addEventListener('click', function() {
            const exceptionReason = textarea.value.trim()
            submit.disabled = true
            textarea.disabled = true
            resultDiv.textContent = ""
            resultDiv.className = ""

            exceptionMessage.reason = exceptionReason
            chrome.runtime.sendMessage(exceptionMessage)
        })

        modal.appendChild(icon)
        modal.appendChild(column)
        overlay.appendChild(modal)
        shadow.appendChild(style)
        shadow.appendChild(overlay)
        document.body.appendChild(host)
    }, [message, logo, exceptionMessage])
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
        iconUrl: chrome.runtime.getURL('/gui/images/icon128.png'),
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