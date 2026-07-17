// checks for secrets in transfers (copy / paste, file select / drop)
class DLP {

    // debounce copy/paste events with the same clipboard content
    static #debouncer = new Debouncer(3 * ONE_SECOND, null, true)

    static async check(request, senderUrl, tabId) {
        const eventType = request.subtype.replaceAll('-', ' ')
        const findings = await Promise.all(
            request.items.map(item =>
                DLP.#debouncer.debounce(item.data, null, () => Gitleaks.scan(item.data))
            )
        )

        const dedupeKey = f => `${f.id}|${f.masked}|${f.len}`;
        const seen = new Set()
        const uniqueFindings = findings
            .flat()
            .filter(f => f && !seen.has(dedupeKey(f)) && seen.add(dedupeKey(f)));


        if (uniqueFindings.length > 0) DLP.#warn(eventType, uniqueFindings, senderUrl, tabId)
    }

    static #warn(eventType, findings, url, tabId) {
        const eventLevel = config.clipboard.leaking.level
        assert(Log.levels.includes(eventLevel), `invalid config.clipboard.leaking.level : ${eventLevel}`)
        if (eventLevel === Log.NEVER) return

        const examples = findings.slice(0, 3)
            .map(f => `• ${f.id} : ${f.masked}`)
            .join("\n")
        const contact = config.company.contact.embedTag('nowrap')
        const onAcknowledge = { type: "explain-leaking", label: t('clipboard.explain') }
        const onCancel = { label: t('global.ok') }
        Modal.createForTab(tabId, t("clipboard.leaking.title"),
            t("clipboard.leaking.message", { contact, examples }), onAcknowledge, undefined, onCancel)

        const exampleSecretType = findings[0].id
        logger.log(nowTimestamp(), "dlp", eventType, url, eventLevel, exampleSecretType, `found ${exampleSecretType} during '${eventType}' on ${url?.hostname}`)
    }
}

class ClickFix {

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
    static score(text) {
        if (typeof text !== "string" || text.length === 0) return null

        const signals = []
        let score = 0

        const decoded = ClickFix.#decodeBase64(text)
        const haystacks = decoded ? [text, decoded] : [text]
        const matchesAny = (re) => haystacks.some(h => re.test(h))

        let keywords = 0
        for (const re of ClickFix.#KEYWORDS) {
            if (matchesAny(re)) keywords++
        }
        if (keywords > 0) {
            score += 3 + Math.min(keywords - 1, 2)
            signals.push("shell-keyword")
        }

        let strong = 0
        for (const re of ClickFix.#STRONG) {
            if (matchesAny(re)) strong++
        }
        if (strong > 0) {
            score += Math.min(3 + (strong - 1), 5)
            signals.push("execution-pattern")
        }

        if (matchesAny(ClickFix.#PIPE_TO_SHELL)) {
            score += 3
            signals.push("pipe-to-shell")
        }

        if (decoded && ClickFix.#KEYWORDS.some(re => re.test(decoded))) {
            score += 3
            signals.push("encoded-command")
        } else if (ClickFix.#BASE64_BLOB.test(text)) {
            score += 1
            signals.push("base64-blob")
        }

        // The checks below deliberately run against the raw `text` only, never the decoded base64.
        // They detect structural obfuscation of the payload *as it will be pasted* (auto-exec newline,
        // off-screen padding, control chars, leading path-disguise) — properties of the literal clipboard
        // bytes. The decoded blob is a synthetic string that never reaches the paste target, so testing it
        // here would only manufacture false positives.
        if (ClickFix.#PATH_LIKE.test(text) && (keywords > 0 || strong > 0)) {
            score += 3
            signals.push("path-disguise")
        }

        if (ClickFix.#WHITESPACE_HIDE.test(text)) {
            score += 2
            signals.push("whitespace-padding")
        }

        if (ClickFix.#TRAILING_EXEC.test(text)) {
            score += 3
            signals.push("auto-execute")
        } else if (ClickFix.#CONTROL_CHARS.test(text)) {
            score += 2
            signals.push("control-chars")
        }

        const report = { score, signals }

        debug('performed clickfix scoring', report)

        if (score >= config.clipboard.clickfix.threshold) return report
    }

    static check(content, url, tabId) {
        const eventLevel = config.clipboard.clickfix.level
        assert(Log.levels.includes(eventLevel), `invalid config.clipboard.clickfix.level : ${eventLevel}`)

        if (eventLevel === Log.NEVER || ! ClickFix.score(content)) return false

        const contact = config.company.contact.embedTag('nowrap')
        const onAcknowledge = { type: "explain-clickfix", label: t('clipboard.explain') }
        const onCancel = { label: t('global.ok') }
        Modal.createForTab(tabId, t("clipboard.clickfix.title"), t("clipboard.clickfix.message", { contact }), onAcknowledge, undefined, onCancel)

        logger.log(nowTimestamp(), "attack detected", "clipboard command attack", url, eventLevel, content.truncate(500, 'end'), `clipboard command-injection attack on ${url?.hostname}`)

        return true
    }

    // decodes the base64 blobs found in the text so the keyword scan also sees encoded payloads
    // (PowerShell -EncodedCommand is base64 of UTF-16LE, hence the null-byte stripping)
    static #BASE64_BLOB_G = /[A-Za-z0-9+/]{40,}={0,2}/g

    static #decodeBase64(text) {
        const matches = text.match(ClickFix.#BASE64_BLOB_G)
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

// minimal DLP hooks: capture whatever clipboard or file select operation, and relay it to the background process for analysis
function patchNavigatorTransfer() {
    const report = (source, text, mime = 'text/plain') => {
        if (typeof text !== 'string' || !text) return
        try { window.postMessage({ type: 'transfer-main', source, text, mime, timestamp: Date.now() }, location.origin) }
        catch (_) {}
    }

    try {
        const preferredText = ci => {
            const mt = ci?.types?.find(t => t === 'text/plain')
                ?? ci?.types?.find(t => /^text\//.test(t))
            return mt ? ci.getType(mt).then(b => b.text()).then(t => ({ t, mt })) : null
        }

        const cb = navigator.clipboard
        ;[
            ['writeText', ([t], _) => report('clipboard-writeText', t)],
            ['readText',  (_, p)   => p?.then?.(t => report('clipboard-readText', t))],
            ['write',     ([is])   => is?.forEach?.(ci =>
                preferredText(ci)?.then(({ t, mt }) => report('clipboard-write', t, mt))?.catch(() => {}))],
            ['read',      (_, p)   => p?.then?.(is => is?.forEach?.(ci =>
                preferredText(ci)?.then(({ t, mt }) => report('clipboard-read', t, mt))?.catch(() => {})))],
        ].forEach(([m, fn]) => {
            if (!cb?.[m]) return
            const o = cb[m].bind(cb)
            cb[m] = function(...a) { const r = o(...a); try { fn(a, r) } catch(_) {}; return r }
        })
    } catch (_) {}

    try {
        const p = DataTransfer?.prototype
        if (p?.setData) {
            const o = p.setData
            p.setData = function(type, data) {
                if (/text/i.test(type)) report('datatransfer-set', data, type)
                return o.apply(this, arguments)
            }
        }
    } catch (_) {}
}

class Gitleaks {

    static #rules = []
    static #globalAllowRe = []
    static #globalStopwords = []
    static #loaded = false

    static get isLoaded() { return this.#loaded }

    static #DOWNLOAD_ERRORS_KEY = "gitleaks-download-errors"

    static async init() {
        const { rules, freq } = config.clipboard.leaking

        return scheduleReload({
            errorKey: Gitleaks.#DOWNLOAD_ERRORS_KEY,
            errorTag: "gitleaks download error",
            label: "gitleaks rules",
            url: rules,
            freqMin: freq,
            getStatus: () => Gitleaks.isLoaded ? "loaded" : "failed",
            load: () => Gitleaks.load(rules),
        })
    }


// Fetch + (re)compile. Call on worker startup and on the periodic defs refresh.
    static async load(url) {
        const toml = await getCached(url).then(res => res.text())
        const parsed = Gitleaks.#parseToml(toml)

        const rules = []
        let compiled = 0, dropped = 0
        for (const r of parsed.rules) {
            try {
                if (typeof r.regex !== "string" || !r.regex) {
                    debug(" - gitleaks : skipping path-only rule (no regex)", r.id)
                    continue
                }

                rules.push({
                    id: r.id,
                    re: Gitleaks.#compile(r.regex),
                    keywords: (r.keywords || []).map(k => k.toLowerCase()),
                    entropy: typeof r.entropy === "number" ? r.entropy : null,
                    allowRe: (r.allowlist?.regexes || []).map(x => Gitleaks.#compile(x)),
                    allowStopwords: (r.allowlist?.stopwords || []).map(s => s.toLowerCase()),
                })
                compiled++
            } catch (e) {
                dropped++
                debug(" - gitleaks : dropped incompatible rule", r.id, e?.message)
            }
        }

        let globalAllowRe = []
        try {
            globalAllowRe = parsed.allowlist.regexes.map(x => Gitleaks.#compile(x))
        } catch (e) {
            debug(" - gitleaks : global allowlist compile issue", e?.message)
        }
        const globalStopwords = parsed.allowlist.stopwords.map(s => s.toLowerCase())

        // atomic swap
        Gitleaks.#rules = rules
        Gitleaks.#globalAllowRe = globalAllowRe
        Gitleaks.#globalStopwords = globalStopwords
        Gitleaks.#loaded = true

        debug("loaded gitleaks rules", { compiled, dropped })
        return { compiled, dropped }
    }

    // gitleaks pipeline. Returns [{ id, masked, len }, ...] — redacted, never the raw secret.
    static scan(text, maxFindings = 1000) {
        const findings = []
        for (const { rule, secret } of Gitleaks.#matches(text, { all: false })) {
            findings.push({ id: rule.id, ...Gitleaks.#fingerprint(secret) })
            if (findings.length >= maxFindings) break
        }

        return findings
    }

    static maskSecrets(content) {
        if (typeof content !== "string" || content.length === 0) return content

        const spans = []
        for (const { match, secret } of Gitleaks.#matches(content, { all: true })) {
            const off = match[0].indexOf(secret)
            const start = match.index + (off >= 0 ? off : 0)
            spans.push({ start, end: start + secret.length })
        }
        if (spans.length === 0) return content

        // merge overlapping spans
        spans.sort((a, b) => a.start - b.start)
        const merged = []
        for (const s of spans) {
            const last = merged[merged.length - 1]
            if (last && s.start <= last.end) last.end = Math.max(last.end, s.end)
            else merged.push({ ...s })
        }

        // apply replacements right-to-left
        let out = content
        for (let i = merged.length - 1; i >= 0; i--) {
            const { start, end } = merged[i]
            out = out.slice(0, start) + '<XXXXXX>' + out.slice(end)
        }
        return out
    }

    // Core matching pipeline, shared by scan() and maskSecrets().
    // Yields { rule, match, secret } for every valid, non-allowlisted secret.
    // `all` controls whether we find every match per rule or just the first.
    static *#matches(text, { all }) {
        if (!Gitleaks.#loaded || typeof text !== "string" || text.length === 0) return

        const lower = text.toLowerCase()

        for (const rule of Gitleaks.#rules) {
            // 1. keyword pre-filter (cheap substring scan)
            if (rule.keywords.length && !rule.keywords.some(k => lower.includes(k))) continue

            // 2. regex — RE2, linear time, safe on page-controlled input
            const re = all && !rule.re.global
                ? new RegExp(rule.re.source, rule.re.flags + "g")
                : rule.re
            re.lastIndex = 0

            let m
            while ((m = re.exec(text)) !== null) {
                if (all && m.index === re.lastIndex) re.lastIndex++ // guard zero-width

                const secret = Gitleaks.#extractSecret(m)
                if (!secret) { if (!all) break; else continue }

                // 3. entropy gate
                if (rule.entropy !== null && Gitleaks.#shannon(secret) < rule.entropy) {
                    if (!all) break; else continue
                }

                // 4. allowlist: rule stopwords -> rule regexes -> global
                const sLower = secret.toLowerCase()
                const allowed =
                    rule.allowStopwords.some(w => sLower.includes(w)) ||
                    rule.allowRe.some(r => r.test(secret)) ||
                    Gitleaks.#globallyAllowed(secret, sLower)
                if (allowed) { if (!all) break; else continue }

                yield { rule, match: m, secret }

                if (!all) break
            }
        }
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
        return { masked: PasswordCheck.maskSecret(secret), len: secret.length }
    }

    // Adapts a parsed gitleaks.toml into { rules, allowlist } for Gitleaks.load.
    // Tolerant of both allowlist schemas: older [rules.allowlist] / [allowlist] (single table)
    // and newer [[rules.allowlists]] / [[allowlists]] (array of tables).
    static #parseToml(src) {
        let doc
        try {
            doc = TOML.parse(src)                       // throws TomlError on malformed input
        } catch (e) {
            // fail loud, fail empty — never run with a half-parsed ruleset
            debug("gitleaks TOML parse failed", e?.message, e?.line, e?.column)
            throw e
        }

        // normalize one-or-many allowlists into { regexes, stopwords }
        const collectAllow = (single, many) => {
            const lists = many ?? (single ? [single] : [])
            const regexes = [], stopwords = []
            for (const a of lists) {
                if (!a) continue
                if (Array.isArray(a.regexes)) regexes.push(...a.regexes)
                if (Array.isArray(a.stopwords)) stopwords.push(...a.stopwords)
                // note: a.regexTarget / a.condition / a.paths are ignored — see caveats
            }
            return { regexes, stopwords }
        }

        const rules = (doc.rules || []).map(r => ({
            id: r.id,
            regex: r.regex,
            keywords: Array.isArray(r.keywords) ? r.keywords : [],
            entropy: typeof r.entropy === "number" ? r.entropy : null,
            allowlist: collectAllow(r.allowlist, r.allowlists),
        }))

        return {
            rules,
            allowlist: collectAllow(doc.allowlist, doc.allowlists),
        }
    }

    static #compile(pattern) {
        try {
            return Gitleaks.#compileWith(pattern)
        } catch (e) {
            // Only a stack overflow gets the clamp-retry; genuine syntax errors must still propagate.
            if (e instanceof RangeError) {
                debug(" - gitleaks : overflowed compile stack (retrying clamped)")
                return Gitleaks.#compileClamped(pattern)
            }
            throw e
        }
    }

    static #MAX_QUANTIFIER = 255

    static #compileClamped(pattern) {
        const clamped = pattern.replace(/\{(\d+),(\d+)\}/g, (m, lo, hi) =>
            Number(hi) > Gitleaks.#MAX_QUANTIFIER ? `{${lo},${Gitleaks.#MAX_QUANTIFIER}}` : m
        )
        if (clamped === pattern) throw new Error("no large quantifier to clamp")
        return Gitleaks.#compileWith(clamped)
    }

    static #compileWith(pattern) {
        const re = RE2.RE2JS.compile(pattern)          // throws RE2JSSyntaxException on incompatible/invalid rule
        return {
            // returns [full, g1, g2, ...] (non-participating groups are null), or null on no match
            exec(text) {
                const m = re.matcher(text)
                if (!m.find()) return null
                const out = [m.group(0)]
                const n = m.groupCount()
                for (let i = 1; i <= n; i++) out.push(m.group(i))   // group(i) is null if it didn't participate
                return out
            },
            test(text) {
                return re.matcher(text).find()
            },
        }
    }
}