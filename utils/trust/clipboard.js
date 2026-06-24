// Detects ClickFix / FileFix / pastejacking attacks, where a page places a shell command on the clipboard
// for the user to paste into PowerShell, the Win+R run dialog or the Explorer address bar.
class ClipboardCheck {

    // leading-edge debounce keyed on clipboard content: the first sighting of a payload warns, the duplicate
    // relays a single copy produces (setData + the copy event, etc.) are swallowed for the window's duration
    static #dedup = new Debouncer(3 * ONE_SECOND, null, true)

    // shell tooling that has no business being on a clipboard the user is about to paste into a shell
    static #KEYWORDS = [
        /powershell|pwsh/i,
        /\bcmd(?:\.exe)?\b/i,
        /\bmshta\b/i,
        /\b[wc]script\b/i,
        /\brundll32\b/i,
        /\bregsvr32\b/i,
        /\bcertutil\b/i,
        /\bbitsadmin\b/i,
        /\bmsiexec\b/i,
        /\bcurl\b/i,
        /\bwget\b/i,
        /\b(?:iwr|invoke-webrequest)\b/i,
        /\b(?:irm|invoke-restmethod)\b/i,
        /\bbash\b|\bsh\s+-c\b|\/bin\/(?:ba)?sh/i,
    ]

    // high-confidence execution patterns (download-and-run, encoded commands, hidden windows)
    static #STRONG = [
        /-e(?:nc(?:odedcommand)?)?\b\s*[A-Za-z0-9+/=]{16,}/i,
        /\b(?:iex|invoke-expression)\b/i,
        /download(?:string|file|data)/i,
        /frombase64string/i,
        /-w(?:indowstyle)?\s+hidden|-nop(?:rofile)?\b|-ep\s+bypass|-executionpolicy\s+bypass/i,
        /\bmshta\b\s+(?:https?:|javascript:|vbscript:)/i,
    ]

    // a download (or anything) piped straight into a shell
    static #PIPE_TO_SHELL = /[|;&]\s*(?:iex|invoke-expression|bash|sh|powershell|pwsh|cmd)\b/i

    // a long base64 blob — suspicious on its own, decisive once it decodes to something shell-like
    static #BASE64_BLOB = /[A-Za-z0-9+/]{40,}={0,2}/

    // looks like a file path / URL / environment-variable path (FileFix disguises a command as one of these)
    static #PATH_LIKE = /^\s*(?:[a-z]:\\|\\\\|file:\/\/|\/(?:usr|bin|etc|tmp|opt|var)\/|~\/|%[a-z]+%)/i

    // visible content, a long run of whitespace, then more content — used to push a command off-screen
    static #WHITESPACE_HIDE = /\S[ \t]{30,}\S/

    // a trailing newline / carriage-return auto-runs the command the instant it is pasted into a Run box or terminal
    static #TRAILING_EXEC = /[\r\n]\s*$/

    // control characters other than tab / newline / carriage-return (e.g. ESC, used for terminal escape tricks)
    static #CONTROL_CHARS = /[\x00-\x08\x0b\x0c\x0e-\x1f]/

    // Scores a clipboard payload. Returns { score, signals } when it crosses the threshold, else null.
    static scoreClickFix(text) {
        if (typeof text !== "string" || text.length === 0) return null

        const signals = []
        let score = 0

        const decoded = ClipboardCheck.#decodeBase64(text)
        const haystacks = decoded ? [text, decoded] : [text]
        const matchesAny = (re) => haystacks.some(h => re.test(h))

        let keywords = 0
        for (const re of ClipboardCheck.#KEYWORDS) {
            if (matchesAny(re)) keywords++
        }
        if (keywords > 0) {
            score += 3 + Math.min(keywords - 1, 2)
            signals.push("shell-keyword")
        }

        let strong = 0
        for (const re of ClipboardCheck.#STRONG) {
            if (matchesAny(re)) strong++
        }
        if (strong > 0) {
            score += Math.min(3 + (strong - 1), 5)
            signals.push("execution-pattern")
        }

        if (matchesAny(ClipboardCheck.#PIPE_TO_SHELL)) {
            score += 3
            signals.push("pipe-to-shell")
        }

        if (decoded && ClipboardCheck.#KEYWORDS.some(re => re.test(decoded))) {
            score += 3
            signals.push("encoded-command")
        } else if (ClipboardCheck.#BASE64_BLOB.test(text)) {
            score += 1
            signals.push("base64-blob")
        }

        if (ClipboardCheck.#PATH_LIKE.test(text) && (keywords > 0 || strong > 0)) {
            score += 3
            signals.push("path-disguise")
        }

        if (ClipboardCheck.#WHITESPACE_HIDE.test(text)) {
            score += 2
            signals.push("whitespace-padding")
        }

        if (ClipboardCheck.#TRAILING_EXEC.test(text)) {
            score += 3
            signals.push("auto-execute")
        } else if (ClipboardCheck.#CONTROL_CHARS.test(text)) {
            score += 2
            signals.push("control-chars")
        }

        if (score < config.clipboard.clickfix.threshold) return null

        return { score, signals }
    }

    static checkClickFix(content, url, tabId) {
        if (config.clipboard.clickfix.action === Action.NOTHING || config.clipboard.clickfix.action === Action.SKIP) return
        if (! ClipboardCheck.scoreClickFix(content)) return

        // leading-edge debounce: warns on the first sighting, swallows the duplicate relays that follow
        ClipboardCheck.#dedup.debounce(content, null, () => {
            const contact = config.company.contact.embedTag('nowrap')
            const onAcknowledge = { type: "acknowledge-clickfix" }
            Modal.createForTab(tabId, t("clickfix.warn.title"), t("clickfix.warn.message", { contact }), onAcknowledge)

            logger.log(nowTimestamp(), "attack detected", "clipboard command attack", url, Log.ERROR,
                content.truncate(500, 'end'), `clipboard command-injection attack on ${url?.hostname}`)
        })
    }

    // decodes the base64 blobs found in the text so the keyword scan also sees encoded payloads
    // (PowerShell -EncodedCommand is base64 of UTF-16LE, hence the null-byte stripping)
    static #decodeBase64(text) {
        const matches = text.match(new RegExp(ClipboardCheck.#BASE64_BLOB, "g"))
        if (! matches) return ""

        let out = ""
        for (const blob of matches.slice(0, 5)) {
            try {
                out += atob(blob).replace(/\x00/g, "")
            } catch (e) { /* not valid base64 */ }
        }
        return out
    }
}

// Minimal clipboard hooks: capture whatever lands on the clipboard (ClickFix / FileFix / pastejacking) and
// relay it to the service worker, which does the scoring. No analysis happens here, by design.
function patchNavigatorClipboard() {
    const report = (text) => {
        if (typeof text !== "string" || text.length === 0) return
        try { window.postMessage({ channel: "CitadelClickFix", content: text }, window.location.origin) } catch (e) {}
    }

    // write-side: programmatic writes via the async Clipboard API
    try {
        const clipboard = navigator.clipboard
        if (clipboard?.writeText) {
            const original = clipboard.writeText.bind(clipboard)
            clipboard.writeText = function(text) {
                try { report(text) } catch (e) {}
                return original(text)
            }
        }
        if (clipboard?.write) {
            const originalWrite = clipboard.write.bind(clipboard)
            clipboard.write = function(items) {
                try {
                    for (const item of items || []) {
                        if (item?.types?.includes?.("text/plain") && item.getType) {
                            item.getType("text/plain").then(blob => blob.text()).then(report).catch(() => {})
                        }
                    }
                } catch (e) {}
                return originalWrite(items)
            }
        }
    } catch (e) {}

    // write-side: DataTransfer.setData, the classic pastejacking vector on a copy/cut handler
    try {
        const proto = window.DataTransfer?.prototype
        if (proto?.setData) {
            const originalSetData = proto.setData
            proto.setData = function(type, data) {
                try { if (/text/i.test(type)) report(data) } catch (e) {}
                return originalSetData.apply(this, arguments)
            }
        }
    } catch (e) {}

    // write-side: document.execCommand('copy'|'cut')
    try {
        const proto = window.Document?.prototype
        if (proto?.execCommand) {
            const originalExec = proto.execCommand
            proto.execCommand = function(command) {
                try {
                    if (typeof command === "string" && /^(?:copy|cut)$/i.test(command)) {
                        report(window.getSelection?.().toString())
                    }
                } catch (e) {}
                return originalExec.apply(this, arguments)
            }
        }
    } catch (e) {}

    // read-side: provenance-agnostic. On a plain user copy clipboardData is empty, so fall back to the
    // current selection — this covers the user manually copying a command the page only displays.
    const onCopy = (event) => {
        try {
            const data = event.clipboardData
            const text = (data && data.getData && data.getData("text/plain")) || window.getSelection?.().toString() || ""
            report(text)
        } catch (e) {}
    }
    document.addEventListener("copy", onCopy, true)
    document.addEventListener("cut", onCopy, true)
}