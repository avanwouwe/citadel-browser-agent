// Detects ClickFix / FileFix / pastejacking attacks, where a page places a shell command on the clipboard
// for the user to paste into PowerShell, the Win+R run dialog or the Explorer address bar.
class Clipboard {

    // leading-edge debounce keyed on clipboard content: the first sighting of a payload warns, the duplicate
    // relays a single copy produces (setData + the copy event, etc.) are swallowed for the window's duration
    static #changeDedup = new Debouncer(3 * ONE_SECOND, null, true)
    static #pasteDedup = new Debouncer(3 * ONE_SECOND, null, true)

    // shell tooling that has no business being on a clipboard the user is about to paste into a shell
    static #KEYWORDS = [
        // --- Windows ---
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
        /\bbash\b|\bsh\s+-c\b|\/bin\/(?:ba|z)?sh/i,   // + zsh path

        // --- recent Windows LOLBins seen in ClickFix / FileFix (conhost --headless, finger, forfiles) ---
        /\bconhost(?:\.exe)?\b/i,
        /\bfinger(?:\.exe)?\b/i,
        /\bforfiles(?:\.exe)?\b/i,

        // --- macOS ---
        /\bosascript\b/i,
        /do\s+shell\s+script/i,
        /\bzsh\b/i,
        /\bhdiutil\b/i,
        /\bxattr\b/i,
        /\blaunchctl\b/i,
        /\bdiskutil\b/i,
        /\bbase64\s+-{1,2}[dD]\b/,                     // base64 -d / --decode (mac/linux decode step)
    ]

    // high-confidence execution patterns (download-and-run, encoded commands, hidden windows)
    static #STRONG = [
        /-e(?:nc(?:odedcommand)?)?\b\s*[A-Za-z0-9+/=]{16,}/i,
        /\b(?:iex|invoke-expression)\b/i,
        /download(?:string|file|data)/i,
        /frombase64string/i,
        /-w(?:indowstyle)?\s+hidden|-nop(?:rofile)?\b|-ep\s+bypass|-executionpolicy\s+bypass/i,
        /\bmshta\b\s+(?:https?:|javascript:|vbscript:)/i,

        // FileFix: conhost.exe --headless used to run the real command with no visible window
        /\bconhost(?:\.exe)?\b[^\r\n]*--?headless/i,

        // FileFix: a real command hidden before a '#'-commented decoy file path
        /(?:powershell|pwsh|cmd|conhost|mshta)\b[^\r\n]*#[^\r\n]*(?:\.(?:docx?|pdf|xlsx?|txt)\b|[a-z]:\\|\/)/i,

        // macOS AMOS: do shell script ... with administrator privileges (forces a password prompt)
        /with\s+administrator\s+privileges/i,

        // macOS loader: curl|wget piped straight into a shell
        /(?:curl|wget)\b[^\r\n]*\|\s*(?:zsh|bash|sh)\b/i,

        // macOS Gatekeeper bypass: strip the quarantine xattr before launching
        /xattr\s+-[a-z]*\s*com\.apple\.quarantine/i,
    ]

    // a download (or anything) piped straight into a shell  (+ zsh, osascript)
    static #PIPE_TO_SHELL = /[|;&]\s*(?:iex|invoke-expression|bash|sh|zsh|powershell|pwsh|cmd|osascript)\b/i

    // a long base64 blob — suspicious on its own, decisive once it decodes to something shell-like
    static #BASE64_BLOB = /[A-Za-z0-9+/]{40,}={0,2}/

    // looks like a file path / URL / env-var path (FileFix disguises a command as one of these)
    // + /Volumes/ for the DMG-mount macOS variant, + Ctrl+L-style Explorer paths already covered
    static #PATH_LIKE = /^\s*(?:[a-z]:\\|\\\\|file:\/\/|\/(?:usr|bin|etc|tmp|opt|var|Volumes|Applications)\/|~\/|%[a-z]+%)/i

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

        const decoded = Clipboard.#decodeBase64(text)
        const haystacks = decoded ? [text, decoded] : [text]
        const matchesAny = (re) => haystacks.some(h => re.test(h))

        let keywords = 0
        for (const re of Clipboard.#KEYWORDS) {
            if (matchesAny(re)) keywords++
        }
        if (keywords > 0) {
            score += 3 + Math.min(keywords - 1, 2)
            signals.push("shell-keyword")
        }

        let strong = 0
        for (const re of Clipboard.#STRONG) {
            if (matchesAny(re)) strong++
        }
        if (strong > 0) {
            score += Math.min(3 + (strong - 1), 5)
            signals.push("execution-pattern")
        }

        if (matchesAny(Clipboard.#PIPE_TO_SHELL)) {
            score += 3
            signals.push("pipe-to-shell")
        }

        if (decoded && Clipboard.#KEYWORDS.some(re => re.test(decoded))) {
            score += 3
            signals.push("encoded-command")
        } else if (Clipboard.#BASE64_BLOB.test(text)) {
            score += 1
            signals.push("base64-blob")
        }

        if (Clipboard.#PATH_LIKE.test(text) && (keywords > 0 || strong > 0)) {
            score += 3
            signals.push("path-disguise")
        }

        if (Clipboard.#WHITESPACE_HIDE.test(text)) {
            score += 2
            signals.push("whitespace-padding")
        }

        if (Clipboard.#TRAILING_EXEC.test(text)) {
            score += 3
            signals.push("auto-execute")
        } else if (Clipboard.#CONTROL_CHARS.test(text)) {
            score += 2
            signals.push("control-chars")
        }

        const report = { score, signals }

        debug('performed clickfix scoring', report)

        if (score >= config.clipboard.clickfix.threshold) return report
    }

    // called from background message handler on every forwarded event
    static onEvent(event, senderUrl, tabId) {
        if (event.subtype === 'ClipboardPaste') Clipboard.checkLeaking(event.content, senderUrl, tabId)
        if (event.subtype === 'ClipboardCopy') Clipboard.checkClickFix(event.content, senderUrl, tabId)
    }

    static checkClickFix(content, url, tabId) {
        const eventLevel = config.clipboard.clickfix.level
        assert(Log.levels.includes(eventLevel), `invalid config.clipboard.clickfix.level : ${eventLevel}`)

        if (eventLevel === Log.NEVER || !Clipboard.scoreClickFix(content)) return

        // leading-edge debounce: warns on the first sighting, swallows the duplicate relays that follow
        Clipboard.#changeDedup.debounce(content, null, () => {
            const contact = config.company.contact.embedTag('nowrap')
            const onAcknowledge = { type: "explain-clickfix", label: t('clipboard.explain') }
            const onCancel = { label: t('global.ok') }
            Modal.createForTab(tabId, t("clipboard.clickfix.title"), t("clipboard.clickfix.message", { contact }), onAcknowledge, undefined, onCancel)

            logger.log(nowTimestamp(), "attack detected", "clipboard command attack", url, eventLevel,
                content.truncate(500, 'end'), `clipboard command-injection attack on ${url?.hostname}`)
        })
    }

    static checkLeaking(content, url, tabId) {
        const eventLevel = config.clipboard.leaking.level
        assert(Log.levels.includes(eventLevel), `invalid config.clipboard.leaking.level : ${eventLevel}`)
        if (eventLevel === Log.NEVER) return

        const findings = Gitleaks.scan(content)
        if (!findings.length) return

        Clipboard.#changeDedup.debounce(content, null, () => {
            const contact = config.company.contact.embedTag('nowrap')
            const onAcknowledge = { type: "explain-leaking", label: t('clipboard.explain') }
            const onCancel = { label: t('global.ok') }
            Modal.createForTab(tabId, t("clipboard.leaking.title"),
                t("clipboard.leaking.message", { contact }), onAcknowledge, undefined, onCancel)

            // redacted: rule ids + masked fingerprints ONLY — never the secret, never the full text
            const summary = findings.map(f => `${f.id}(${f.masked},len=${f.len})`).join(", ")
            logger.log(nowTimestamp(), "leak detected", "clipboard secret leak", url, eventLevel,
                summary, `clipboard secret-leak on ${url?.hostname}: ${summary}`)
        })
    }

    // decodes the base64 blobs found in the text so the keyword scan also sees encoded payloads
    // (PowerShell -EncodedCommand is base64 of UTF-16LE, hence the null-byte stripping)
    static #decodeBase64(text) {
        const matches = text.match(new RegExp(Clipboard.#BASE64_BLOB, "g"))
        if (!matches) return ""

        let out = ""
        for (const blob of matches.slice(0, 5)) {
            try {
                out += atob(blob).replace(/\x00/g, "")
            } catch (e) { /* not valid base64 */ }
        }
        return out
    }
}

// minimal clipboard hooks: capture whatever copy or paste action, and relay it to the background process for analysis
function patchNavigatorClipboard() {
    const trySafe = (fn) => { try { fn() } catch (e) {} }

    const report = (text, subtype) => {
        if (typeof text !== "string" || text.length === 0) return

        trySafe(() => {
            window.postMessage({
                type: "clipboard-event",
                subtype,
                content: text
            }, window.location.origin)
        })
    }

    const reportCopy = (text) => report(text, "ClipboardCopy")
    const reportPaste = (text) => report(text, "ClipboardPaste")

// write-side: programmatic writes via the async Clipboard API
    trySafe(() => {
        const clipboard = navigator.clipboard
        if (clipboard?.writeText) {
            const original = clipboard.writeText.bind(clipboard)
            clipboard.writeText = function(text) {
                trySafe(() => reportCopy(text))
                return original(text)
            }
        }
        if (clipboard?.write) {
            const originalWrite = clipboard.write.bind(clipboard)
            clipboard.write = function(items) {
                trySafe(() => {
                    for (const item of items || []) {
                        if (item?.types?.includes?.("text/plain") && item.getType) {
                            item.getType("text/plain")
                                .then(blob => blob.text())
                                .then(reportCopy)
                                .catch(() => {})
                        }
                    }
                })
                return originalWrite(items)
            }
        }
    })

// write-side: DataTransfer.setData, the classic pastejacking vector on a copy/cut handler
    trySafe(() => {
        const proto = window.DataTransfer?.prototype
        if (proto?.setData) {
            const originalSetData = proto.setData
            proto.setData = function(type, data) {
                trySafe(() => {
                    if (/text/i.test(type)) reportCopy(data)
                })
                return originalSetData.apply(this, arguments)
            }
        }
    })

// write-side: document.execCommand('copy'|'cut')
    trySafe(() => {
        const proto = window.Document?.prototype
        if (proto?.execCommand) {
            const originalExec = proto.execCommand
            proto.execCommand = function(command) {
                trySafe(() => {
                    if (typeof command === "string" && /^(?:copy|cut)$/i.test(command)) {
                        reportCopy(window.getSelection?.().toString())
                    }
                })
                return originalExec.apply(this, arguments)
            }
        }
    })

// read-side: provenance-agnostic. On a plain user copy clipboardData is empty, so fall back to the
// current selection — this covers the user manually copying a command the page only displays.
    const onCopy = (event) => {
        trySafe(() => {
            const data = event.clipboardData
            const text = (data?.getData?.("text/plain")) || window.getSelection?.().toString() || ""
            reportCopy(text)
        })
    }
    document.addEventListener("copy", onCopy, true)
    document.addEventListener("cut", onCopy, true)

// page pulling the clipboard programmatically — treat as paste
    trySafe(() => {
        const clipboard = navigator.clipboard
        if (clipboard?.readText) {
            const originalRead = clipboard.readText.bind(clipboard)
            clipboard.readText = function() {
                const p = originalRead()
                trySafe(() => p.then(reportPaste).catch(() => {}))
                return p
            }
        }
        if (clipboard?.read) {
            const originalRead = clipboard.read.bind(clipboard)
            clipboard.read = function() {
                const p = originalRead()
                trySafe(() => p.then(items => {
                    for (const item of items || []) {
                        if (item?.types?.includes?.("text/plain") && item.getType) {
                            item.getType("text/plain").then(b => b.text()).then(reportPaste).catch(() => {})
                        }
                    }
                }).catch(() => {}))
                return p
            }
        }
    })

// user pasting into the page — treat as paste
    document.addEventListener("paste", (event) => {
        trySafe(() => {
            const text = event.clipboardData?.getData?.("text/plain") || ""
            reportPaste(text)
        })
    }, true)

// read-side: programmatic reads via the async Clipboard API (page pulling the clipboard)
    trySafe(() => {
        const clipboard = navigator.clipboard
        if (clipboard?.readText) {
            const originalRead = clipboard.readText.bind(clipboard)
            clipboard.readText = function() {
                const p = originalRead()
                trySafe(() => p.then(text => reportPaste(text)).catch(() => {}))
                return p
            }
        }
        if (clipboard?.read) {
            const originalRead = clipboard.read.bind(clipboard)
            clipboard.read = function() {
                const p = originalRead()
                trySafe(() => p.then(items => {
                    for (const item of items || []) {
                        if (item?.types?.includes?.("text/plain") && item.getType) {
                            item.getType("text/plain").then(b => b.text()).then(t => reportPaste(t)).catch(() => {})
                        }
                    }
                }).catch(() => {}))
                return p
            }
        }
    })

// read-side: user pastes into the page
    document.addEventListener("paste", (event) => {
        trySafe(() => {
            const text = event.clipboardData?.getData?.("text/plain") || ""
            reportPaste(text, "paste")
        })
    }, true)
}

class Gitleaks {

    static #rules = []
    static #globalAllowRe = []
    static #globalStopwords = []
    static #loaded = false

    static get loaded() { return this.#loaded }

    // Fetch + (re)compile. Call on worker startup and on the periodic defs refresh.
    static async load(url) {
        const toml = await getCached(url).then(res => res.text())
        const parsed = Gitleaks.#parseToml(toml)
        console.log("parsed", parsed)

        let compiled = 0, dropped = 0
        const rules = []
        for (const r of parsed.rules) {
            try {
                rules.push({
                    id: r.id,
                    re: new RE2(r.regex),                       // wasm RE2 — throws on RE2-incompatible rule
                    keywords: (r.keywords || []).map(k => k.toLowerCase()),
                    entropy: typeof r.entropy === "number" ? r.entropy : null,
                    allowRe: (r.allowlist?.regexes || []).map(x => new RE2(x)),
                    allowStopwords: (r.allowlist?.stopwords || []).map(s => s.toLowerCase()),
                })
                compiled++
            } catch (e) {
                dropped++                                        // one bad upstream rule can't nuke the set
                debug("dropped incompatible gitleaks rule", r.id, e?.message)
            }
        }

        Gitleaks.#rules = rules
        Gitleaks.#globalAllowRe = (parsed.allowlist?.regexes || []).map(x => new RE2(x))
        Gitleaks.#globalStopwords = (parsed.allowlist?.stopwords || []).map(s => s.toLowerCase())
        Gitleaks.#loaded = true

        debug("loaded gitleaks rules", { compiled, dropped })
        return { compiled, dropped }
    }

    // gitleaks pipeline. Returns [{ id, masked, len }, ...] — redacted, never the raw secret.
    static scan(text) {
        if (!Gitleaks.#loaded || typeof text !== "string" || text.length === 0) return []

        const lower = text.toLowerCase()
        const findings = []

        for (const rule of Gitleaks.#rules) {
            // 1. keyword pre-filter (cheap substring scan) — skip regex unless a keyword is present
            if (rule.keywords.length && !rule.keywords.some(k => lower.includes(k))) continue

            // 2. regex — RE2, linear time, safe on page-controlled input
            const m = rule.re.exec(text)
            if (!m) continue

            const secret = Gitleaks.#extractSecret(m)

            // 3. entropy gate (on the matched secret, as gitleaks does)
            if (rule.entropy !== null && Gitleaks.#shannon(secret) < rule.entropy) continue

            // 4. allowlist: rule stopwords -> rule regexes -> global
            const sLower = secret.toLowerCase()
            if (rule.allowStopwords.some(w => sLower.includes(w))) continue
            if (rule.allowRe.some(re => re.test(secret))) continue
            if (Gitleaks.#globallyAllowed(secret, sLower)) continue

            findings.push({ id: rule.id, ...Gitleaks.#fingerprint(secret) })
        }
        return findings
    }

    // --- gitleaks internals ---

    static #globallyAllowed(secret, sLower) {
        if (Gitleaks.#globalStopwords.some(w => sLower.includes(w))) return true
        if (Gitleaks.#globalAllowRe.some(re => re.test(secret))) return true
        return false
    }

    // secret = highest non-empty capture group, else whole match
    static #extractSecret(match) {
        for (let i = match.length - 1; i >= 1; i--) {
            if (match[i]) return match[i]
        }
        return match[0]
    }

    static #shannon(str) {
        if (!str) return 0
        const freq = new Map()
        for (const ch of str) freq.set(ch, (freq.get(ch) || 0) + 1)
        let h = 0
        const n = str.length
        for (const c of freq.values()) {
            const p = c / n
            h -= p * Math.log2(p)
        }
        return h
    }

    // redacted fingerprint — NEVER the raw secret
    static #fingerprint(secret) {
        return { masked: `${secret.slice(0, 3)}…${secret.slice(-2)}`, len: secret.length }
    }

    // minimal parser for the [[rules]] + [allowlist] subset of gitleaks.toml
    static #parseToml(toml) {
        // TODO: hand-rolled subset parser or tiny TOML lib
        // -> { rules: [{ id, regex, keywords, entropy, allowlist:{regexes,stopwords} }], allowlist:{regexes,stopwords} }
    }
}