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


async function blockDomainModal(domain, message, exceptionEvent) {
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

    await forAllTabs(domain, createModal,['/gui/modal-block.html', '/gui/modal.css'])
    await forAllTabs(domain, async (options) => {
        const shadow = document.getElementById("CitadelOverlayShadowRootHost").shadowRoot
        shadow.getElementById('companyLogo').src = options.logo || ''
        shadow.getElementById('modalMessage').innerHTML = options.message || ''
        shadow.getElementById('exceptionToggle').innerHTML = options.exception.request || ''
        shadow.getElementById('exceptionTitle').innerText = options.exception.requestHeader || ''
        shadow.getElementById('exceptionTextarea').placeholder = options.exception.provideReason || ''
        shadow.getElementById('exceptionSubmit').innerText = options.exception.submitRequest || 'Submit'

        const toggle = shadow.getElementById('exceptionToggle')
        const exceptionSection = shadow.getElementById('exceptionSection')
        toggle.onclick = () => {
            exceptionSection.style.display =
                (exceptionSection.style.display === 'flex') ? 'none' : 'flex'
            if (exceptionSection.style.display === 'flex') {
                shadow.getElementById('exceptionTextarea').focus()
            }
        }

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

function removeModal(domain) {
    forAllTabs(domain, () => {
        document.getElementById("CitadelOverlayShadowRootHost")?.remove()
    })
}

async function createModal(page, css) {
    if (document.getElementById("CitadelOverlayShadowRootHost")) return

    page = await fetch(chrome.runtime.getURL(page))
    css = await fetch(chrome.runtime.getURL(css))
    const host = document.createElement('div')
    host.id = "CitadelOverlayShadowRootHost"
    document.body.appendChild(host)
    const shadow = host.attachShadow({mode: 'open'})
    shadow.innerHTML = `<style>${await css.text()}</style>${await page.text()}`
}

async function forAllTabs(domain, func, args = []) {
    const tabs = await chrome.tabs.query({ url: [`*://${domain}/*`, `*://*.${domain}/*`] })
    await Promise.all(
        tabs.map(tab => chrome.scripting.executeScript({ target: { tabId: tab.id }, func, args }))
    )
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