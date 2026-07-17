injectPageScript('/utils/injected/bundle/citadel-bundle-idle.js')

function trySafe(fn, ...args) {
    try {
        return fn(...args)
    } catch (err) {
        return undefined
    }
}

function safeHandler(fn) {
    return async function (...args) {
        try {
            await fn(...args)
        } catch (e) {
            console.error(e)
        }
    }
}

const MAX_TRANSFER_ANALYSIS_LENGTH       = 1_000_000
const TEXT_MIME = /^text\//i
const TEXT_EXT  = /\.(env|txt|cfg|conf|ini|ya?ml|json|toml|xml|csv|log|md|key|pem|pfx|sh|bash|zsh|py|rb|[jt]s|go|rs|java|c|cpp|h|php|sql|npmrc|htpasswd|gitconfig)$/i
const uid       = () => crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)

const reportTransfer = (source, items, timestamp = Date.now()) => {
    items = items.filter(Boolean)
    if (!items.length) return

    trySafe(() => {
        chrome.runtime.sendMessage({
            type: 'transfer-event',
            subtype: source,
            eventId: uid(),
            timestamp,
            items,
        })
    })
}

const textItem = (data, type = 'text/plain') => {
    if (typeof data !== 'string' || !data) return null
    const truncated = data.length > MAX_TRANSFER_ANALYSIS_LENGTH
    return {
        kind: 'text',
        type,
        size: data.length,
        truncated,
        data: truncated ? data.slice(0, MAX_TRANSFER_ANALYSIS_LENGTH) : data
    }
}

const fileItem = async file => {
    const f = {
        kind: 'file',
        type: file.type || 'application/octet-stream',
        name: file.name ?? '',
        size: file.size,
        lastModified: trySafe(() => new Date(file.lastModified).toISOString()),
    }

    if (!TEXT_MIME.test(file.type) && !TEXT_EXT.test(file.name)) return f

    try {
        f.truncated = file.size > MAX_TRANSFER_ANALYSIS_LENGTH
        f.data = await (f.truncated ? file.slice(0, MAX_TRANSFER_ANALYSIS_LENGTH) : file).text()
    } catch (e) {
        f.truncated = false
        f.captureError = String(e)
    }

    return f
}

// ── MAIN world relay ──────────────────────────────────────────────────────

window.addEventListener('message', ev => {
    if (ev.source !== window || ev.origin !== location.origin) return
    const { type } = ev.data ?? {}
    if (!type) return
    if (type === 'screenshare-event') sendMessage(ev.data)
    if (type === 'transfer-main') {
        const { source, text, mime, timestamp } = ev.data
        reportTransfer(source, [textItem(text, mime)], timestamp)
    }
}, true)

// ── copy / cut ────────────────────────────────────────────────────────────

const onCopyCut = ev => {
    const text = ev.clipboardData?.getData?.('text/plain')
        || getSelection?.()?.toString() || ''
    reportTransfer('clipboard-' + ev.type, [textItem(text)])
}
document.addEventListener('copy', onCopyCut, true)
document.addEventListener('cut',  onCopyCut, true)

// ── paste ─────────────────────────────────────────────────────────────────

document.addEventListener('paste', ev => {
    const cd = ev.clipboardData
    if (!cd) return
    const text  = cd.getData('text/plain')
    const files = Array.from(cd.files ?? [])
    ;(async () => {
        reportTransfer('clipboard-paste', [
            textItem(text),
            ...(await Promise.all(files.map(fileItem))).filter(Boolean)
        ])
    })().catch(() => {})
}, true)

// ── file input ────────────────────────────────────────────────────────────

document.addEventListener('change', ev => {
    const t = ev.target
    if (t?.tagName !== 'INPUT' || t.type !== 'file' || !t.files?.length) return
        ;(async () => {
        reportTransfer('file-input', (await Promise.all(Array.from(t.files).map(fileItem))).filter(Boolean))
    })().catch(() => {})
}, true)

// ── drop ──────────────────────────────────────────────────────────────────

document.addEventListener('drop', ev => {
    const dt = ev.dataTransfer
    if (!dt) return
    const text  = dt.getData('text/plain')
    const files = Array.from(dt.files ?? [])
    ;(async () => {
        reportTransfer('file-drop', [
            textItem(text),
            ...(await Promise.all(files.map(fileItem))).filter(Boolean)
        ])
    })().catch(() => {})
}, true)

listeners.clickListener = safeHandler(async function(event) {
    sendMessage("user-interaction")

    const button = event.target.closest('button, input[type="button"], input[type="submit"]')
    if (button && !button.disabled && button.offsetParent != null && !button.isHidden()) {
        await checkLogin(event, button)
    }
})

listeners.keyListener = safeHandler(async function(event) {
    if (event.key === 'Enter') {
        sendMessage("user-interaction")

        if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA' || event.target.tagName === 'BUTTON') {
            await checkLogin(event, event.target)
        }
    }
})

window.addEventListener('beforeprint', safeHandler(function() {
    sendMessage("print-dialog")
}), true)

// Track which fields the browser has auto-filled. There is no dedicated DOM event for auto-fill, so we rely on a CSS
// animation keyed to :-webkit-autofill (see citadel-content-script.css) that fires "animationstart". This lets us tell,
// at login submission, whether a *saved* (and possibly synced) credential was used rather than one typed by hand.
const autofilledFields = new WeakSet()
document.addEventListener('animationstart', safeHandler(function(event) {
    if (event.animationName === 'citadel-onautofill' && event.target instanceof HTMLElement) {
        autofilledFields.add(event.target)
    }
}), true)

function wasAutofilled(el) {
    if (! el) return false
    if (autofilledFields.has(el)) return true

    // test each pseudo-class independently: matches() throws on a pseudo-class the engine does not support, and we
    // must not let one unsupported selector mask the other (Chromium/Edge use :-webkit-autofill, Firefox :autofill)
    for (const selector of [':-webkit-autofill', ':autofill']) {
        trySafe(() => { if (el.matches(selector)) return true })
    }
    return false
}

const system = window.location.origin
let sessionState
new SessionState(system).load().then(obj => sessionState = obj)

function findFormElements(element) {
    if (element.form) {
        return Array.from(element.form.elements)
    }

    // Use the nearest ancestor that contains at least one relevant input field (password, e-mail, etc)
    let fields = []
    let container = element.parentElement ?? document.body
    do {
        fields = Array.from(container.querySelectorAll('input[type="text"], input[type="email"], input[type="password"]'))
        if (fields.length > 0 && !fields.includes(element)) break
        container = container.parentElement
    } while (container && container !== document.body)

    return fields
}

function findUsernameInAncestors(startNode) {
    let node = startNode?.parentElement

    while (node && node !== document.body) {
        const walker = document.createTreeWalker(node, NodeFilter.SHOW_ELEMENT, null)
        let el = walker.currentNode

        while (el) {
            if (el.offsetParent === null) { // skip hidden elements
                el = walker.nextNode()
                continue
            }
            if (el.children.length === 0) { // only leaf nodes
                let text = el.textContent.trim()
                if (text && text.length <= 100) {
                    const email = findEmailPattern(text)
                    if (email) return email
                }
            }
            el = walker.nextNode()
        }
        node = node.parentElement
    }

    return null
}

function repeatEvent(event, target) {
    if (event.type === "keydown" || event.type === "keyup" || event.type === "keypress") {
        const synthEvent = new KeyboardEvent(event.type, {
            bubbles: true,
            cancelable: true,
            composed: event.composed,
            key: event.key,
            code: event.code,
            location: event.location,
            ctrlKey: event.ctrlKey,
            shiftKey: event.shiftKey,
            altKey: event.altKey,
            metaKey: event.metaKey,
            repeat: event.repeat,
            isComposing: event.isComposing
        })

        Object.defineProperties(synthEvent, {
            keyCode:  { value: event.keyCode,  writable: false, enumerable: true },
            which:    { value: event.which,    writable: false, enumerable: true },
            charCode: { value: event.charCode, writable: false, enumerable: true },
        })

        synthEvent.syntheticCitadelEvent = true
        target.dispatchEvent(synthEvent)

        // isTrusted=false blocks browser default action for keyboard events
        // synthetic keydown above handles SPAs that listen for keydown Enter explicitly
        // click below handles native forms and SPAs that don't
        // guard: only click if target is an input field, not a button, to avoid double submit
        const form = target.closest("form")

        const submitButton =
            // 1. explicit submit in a real form
            form?.querySelector('[type="submit"], button:not([type="button"])')
            // 2. SPA: walk up to find nearest ancestor that contains a submit-like button
            ?? target.closest("div, section, main, article, [role='dialog'], [role='main']")
                ?.querySelector('[type="submit"], button:not([type="button"])')

        if (submitButton) {
            const clickEvent = new MouseEvent("click", {
                bubbles: true,
                cancelable: true,
            })
            clickEvent.syntheticCitadelEvent = true
            submitButton.dispatchEvent(clickEvent)
        }

        return
    }

    if (event.type === "click") {
        let synthEvent

        if (window.PointerEvent && event instanceof PointerEvent) {
            synthEvent = new PointerEvent("click", {
                bubbles: true,
                cancelable: true,
                composed: true,
                clientX: event.clientX,
                clientY: event.clientY,
                screenX: event.screenX,
                screenY: event.screenY,
                pageX: event.pageX,
                pageY: event.pageY,
                button: event.button,
                buttons: event.buttons,
                ctrlKey: event.ctrlKey,
                shiftKey: event.shiftKey,
                altKey: event.altKey,
                metaKey: event.metaKey,
                pointerId: event.pointerId,
                width: event.width,
                height: event.height,
                pressure: event.pressure,
                tiltX: event.tiltX,
                tiltY: event.tiltY,
                pointerType: event.pointerType,
                isPrimary: event.isPrimary,
            })
        } else {
            synthEvent = new MouseEvent("click", {
                bubbles: true,
                cancelable: true,
                clientX: event.clientX,
                clientY: event.clientY,
                screenX: event.screenX,
                screenY: event.screenY,
                pageX: event.pageX,
                pageY: event.pageY,
                button: event.button,
                buttons: event.buttons,
                ctrlKey: event.ctrlKey,
                shiftKey: event.shiftKey,
                altKey: event.altKey,
                metaKey: event.metaKey,
            })
        }

        synthEvent.syntheticCitadelEvent = true
        target.dispatchEvent(synthEvent)
    }
}

checkLogin = async function(event, button) {
    const setPointerBusy = (isBusy = true) => isBusy ? document.body.classList.add('citadel-busy') : document.body.classList.remove('citadel-busy')

    if (event.syntheticCitadelEvent) return

    const fields = findFormElements(button)
    const loginForm = analyzeForm(fields, button)

    if (loginForm?.password) {
        // if this is the first time we're connecting to the site, first check if the password is reused (could be phishing)
        if (PasswordCheck.isFirstConnection(loginForm.username)) {
            try {
                setPointerBusy()

                event.preventDefault()
                event.stopImmediatePropagation()

                const encryptionKey = await SecureMessage.getPublicKey()
                const report = await SecureMessage.sendMessage("AuditPassword", loginForm, encryptionKey)
                if (report && report.password.reuse) {
                    await sendMessage("warn-reuse", { report })
                    await callServiceWorker("DeletePassword", { username: loginForm.username })
                    return
                }
            } catch (error) {
                console.error('exception when analyzing login', error.stack)
            } finally {
                setPointerBusy(false)
            }

            repeatEvent(event, button)
        }

        try {
            const encryptionKey = await SecureMessage.getPublicKey()
            await SecureMessage.sendMessage("AccountUsage",{ subtype: "password", username: loginForm.username, password: loginForm.password }, encryptionKey)

            if (loginForm.autofilled) {
                await SecureMessage.sendMessage("AccountAutofill", { username: loginForm.username }, encryptionKey)
            }
        } catch (error) {
            console.error('exception when analyzing login', error.stack)
        }
    }

    if (loginForm?.totp) sendMessage("receive-totp")
}

function analyzeForm(formElements, eventElement) {
    formElements = formElements.filter(elem => elem.value?.length < 100 && ! PasswordCheck.isCreditCard(elem.value))

    let username, password, totp, passwordAutofilled
    const formHasPassword = formElements.some(elem => elem.type === 'password')

    for (let elem of formElements) {
        if (elem.value === "" || elem.value === undefined || elem.isHidden()) continue

        if (elem.type === 'password' || MFACheck.isMFA(elem.name) || MFACheck.isMFA(elem.id) || MFACheck.isMFA(window.location.pathname)) {
            if (MFACheck.isTOTP(elem.value)) {
                debug("found TOTP", elem.value)

                totp = elem.value
                continue
            }
        }

        if (elem.type === 'password' || isPasswordField(elem.name) || isPasswordField(elem.id)) {
            if (! MFACheck.isTOTP(elem.value) && !PasswordCheck.isMasked(elem.value)) {
                debug("found password")

                password = elem.value
                passwordAutofilled = wasAutofilled(elem)
                continue
            }
        }

        if (username === undefined &&
            (elem.type === 'text' || elem.type === 'email') &&
            (
                formHasPassword ||
                elem.autocomplete === 'email' || elem.autocomplete === 'username' ||
                MFACheck.findAuthPattern(window.location.pathname) && (
                    isUsernameField(elem.name) ||
                    isUsernameField(elem.id) ||
                    findEmailPattern(elem.value)
                )
            )
        ) {
            debug("found username (in form)", elem.value)
            username = elem.value
        }
    }

    if (username === undefined && formHasPassword) {
        username = findUsernameInAncestors(eventElement)
    }

    if (PasswordCheck.isSecret(username)) {
        username = PasswordCheck.maskSecret(username)
    }

    debug("form username is ", username)
    debug("form password is ", password ? "<masked>" : undefined)
    debug("form TOTP is ", totp)

    if (username !== undefined) sessionState.setUsername(username)
    if (password !== undefined) sessionState.setPassword()
    if (totp !== undefined) sessionState.setTOTP()

    if (sessionState.auth.password === undefined) return
    if (password === undefined && totp === undefined) return

    const login = {
        username: sessionState.auth.username,
        password,
        totp: sessionState.auth.totp,
        autofilled: passwordAutofilled === true
    }

    if (sessionState.auth.totp) {
        sessionState.init()
    }

    sessionState.save()

    return login
}