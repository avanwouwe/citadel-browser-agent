class Config {
    static default = {
        maxReasonLength: 150,                   // max number of characters when users give a reason
        company: {
            name: 'Your Organisation',          // name of your organisation
            contact: undefined,                 // replace with the email address of your support
            logo: undefined,                    // replace with the URL of your logo (128 x 128 pixel, transparent)
            domains: [ ],                       // replace with your domains, e.g. ["yourdomain.com","yourdomain.io"]
            applications: [ ]                   // list your applications, e.g. ["your-crm.com", "your-mdm.com"]
        },
        logging: {
            reportFailure: true,
            logLevel: 'DEBUG',
            shipLevel: 'INFO',
            consoleLevel: 'WARN',
            maskUrlLevel: 'WARN',
            maxUrlLength: 250,
            maxFilenameLength: 150,
            throttle: {
                windowDuration: 10,
                reportFrequency: 60,
                rates: {
                    TRACE: 1000,
                    DEBUG: 100,
                    INFO: 50,
                    WARN: 50,
                    ERROR: 10,
                    ALERT: 10,
                }
            },
        },
        warningProtocols: ['http:', 'ftp:', 'ws:'],         // list of unencrypted protocols
        application: {
            retentionDays: 180,
            minDailyInteractions: 10
        },
        exceptions: [ ],
        domain: {
            unmask: [],
            sensitive: [
                "apple.com",
                "google.com",
                "gmail.com",
                "microsoft.com",
                "onmicrosoft.com",
                "microsoftonline.com",
                "oraclecloud.com",
                "office.com",
                "sharepoint.com",
                "hotmail.com",
                "outlook.com",
                "azure.com",
                "amazon.com",
                "salesforce.com",
                "hubspot.com",
                "pipedrive.com",
                "slack.com",
                "github.com",
                "gitlab.com",
                "notion.so",
                "atlassian.com",
                "atlassian.net",
                "1password.com",
                "bitwarden.com",
                "lastpass.com",
                "jumpcloud.com",
                "workos.com",
                "okta.com",
                "auth0.com",
                "zoom.com",
                "webex.com",
                "document360.com",
            ],
            publicMail: [
                "gmail.com",
                "yahoo.com",
                "hotmail.com",
                "hotmail.co.uk",
                "hotmail.fr",
                "hotmail.de",
                "hotmail.es",
                "hotmail.it",
                "hotmail.in",
                "hotmail.jp",
                "outlook.com",
                "outlook.fr",
                "outlook.co.uk",
                "outlook.de",
                "outlook.jp",
                "outlook.es",
                "outlook.it",
                "outlook.in",
                "aol.com",
                "mail.com",
                "live.com",
                "ymail.com",
                "icloud.com",
                "zoho.com",
                "gmx.com",
                "yandex.com",
                "protonmail.com",
                "me.com",
                "msn.com",
                "comcast.net",
                "libero.it",
                "web.de",
                "sbcglobal.net",
                "att.net",
                "verizon.net",
                "bellsouth.net",
                "btinternet.com",
                "sky.com",
                "sina.com",
                "qq.com",
                "seznam.cz",
                "wp.pl",
                "o2.pl",
                "rambler.ru",
                "netzero.net",
                "earthlink.net",
                "hushmail.com",
                "ukr.net",
                "freenet.de",
                "aliyun.com",
                "t-online.de",
                "rediffmail.com",
                "wanadoo.co.uk",
                "wanadoo.fr",
                "wanadoo.nl"
            ]
        },
        session: {
            maxSessionDays: 30,
            domains: [],
            exceptions: [],
        },
        account: {
            confirmLoginDelay: 10,
            trigger: {
                warn: 2,
                block: 7
            },
            actions: {
                NOTIFY: 2,
                WARN: 4,
                BLOCK: 6
            },
            exceptions: {
                duration: 60 * 24,
                domains: ["*"]
            },
            passwordReuse: {
                action: "WARN",
                exceptions: {
                    allowed: true,
                    groups: [ ]
                }
            },
            retentionDays: 90,
            checkOnlyInternal: false,
            checkOnlyProtected: true,
            passwordPolicy: {
                minLength: 15,
                minNumberOfDigits: 1,
                minNumberOfLetters: 0,
                minNumberOfUpperCase: 1,
                minNumberOfLowerCase: 1,
                minNumberOfSymbols: 1,
                minEntropy: 2.5,
                minSequence: 0.6
            },
            mfa: {
                waitMinutes: 10,
                maxSessionDays: 30,
                required: [],
                exceptions: []
            }
        },
        webfilter: {
            blacklist: {
                exceptions: {
                    duration: 60 * 24
                },
                ip: {
                    "FireHOL (level 1)": {
                        urls: ["https://iplists.firehol.org/files/firehol_level1.netset"],
                        freq: 60
                    },
                    "https://github.com/romainmarcoux/malicious-outgoing-ip-domains": {
                        urls: ["https://raw.githubusercontent.com/romainmarcoux/malicious-outgoing-ip/main/full-outgoing-ip-40k.txt"],
                        freq: 60
                    },
                    "IPsum (level 2+)": {
                        urls: ["https://raw.githubusercontent.com/stamparm/ipsum/refs/heads/master/levels/2.txt"],
                        freq: 60 * 12
                    }
                },
                url: {
                    "URLhaus": {
                        urls: ["https://urlhaus.abuse.ch/downloads/text_online/"],
                        freq: 60
                    },
                    "https://github.com/romainmarcoux/malicious-domains": {
                        urls: [
                            "https://raw.githubusercontent.com/romainmarcoux/malicious-domains/main/full-domains-aa.txt",
                            "https://raw.githubusercontent.com/romainmarcoux/malicious-domains/main/full-domains-ab.txt",
                            "https://raw.githubusercontent.com/romainmarcoux/malicious-domains/main/full-domains-ac.txt"
                        ],
                        freq: 60
                    },
                    "Known Torrent Sites": {
                        urls: ["https://raw.githubusercontent.com/sakib-m/Pi-hole-Torrent-Blocklist/refs/heads/main/all-torrent-trackers.txt"],
                        freq: 60 * 12
                    }
                }
            },
            whitelist: {
                ip: [
                    "10.0.0.0/8",
                    "127.0.0.0/8",
                    "0.0.0.0/32",
                    "169.254.0.0/16",
                    "172.16.0.0/12",
                    "192.168.0.0/16",
                    "100.64.0.0/10",      // Used by Tailscale and some CGN
                ],
                url: [ ],
            }
        },
        ignorelist: [
            'about:home',
            'about:blank',
            'about:newtab',
            'about:srcdoc',
            'chrome://new-tab-page/'
        ],
        reporting: {
            maxApplicationEntries: 500,
            maxAccountEntries: 500,
            onlyAuthenticated: true
        },
        errors: {
            exceptions: {
                'net::ERR_SSL_CLIENT_AUTH_CERT_NEEDED' : 'NEVER',
                'net::ERR_BLOCKED_BY_CLIENT' : 'NEVER',
                'net::ERR_BLOCKED_BY_ORB' : 'NEVER',
                'net::ERR_BLOCKED_BY_CSP' : 'NEVER',
                'net::ERR_BLOCKED_BY_RESPONSE' : 'NEVER',
                'net::ERR_BLOCKED_BY_FINGERPRINTING_PROTECTION' : 'NEVER',
            }
        },
        device: {
            trigger: {
                warn: 2,
                block: 7
            },
            actions: {
                "default": "WARN",
                "SKIP": [],
                "NOTHING": [],
                "NOTIFY": ["MaxUptime", "SSHKeys", "UnusedFiles"],
                "WARN": [],
                "BLOCK": ["DriveEncryption", "RemovableStorage"]
            },
            exceptions: {
                duration: 60 * 24,
                domains: ["*"]
            },
            controls: {
                applications: {
                    forbidden: [],
                    required: []
                },
                processes: {
                    forbidden: [],
                    required: []
                },
                browser: {
                    maxUptime: 14
                },
                packs: [
                    { "type": "windows", "path": "controls/windows-custom.json" },
                    { "type": "macos", "path": "controls/macos-custom.json" },
                ]
            },
            osqueryPath: {
                windows: undefined,
                macos: undefined
            },
        },
        shadowit: {
            warn: [
                // 🔴 AI Tools
                "chatgpt.com",
                "chat.openai.com",
                "claude.ai",
                "gemini.google.com",
                "copilot.microsoft.com",
                "perplexity.ai",
                "poe.com",
                "chat.mistral.ai",
                "grok.com",
                "x.ai",
                "jasper.ai",
                "copy.ai",
                "you.com",

                // 🔴 AI Vibe Coding / App Builders
                "lovable.dev",
                "base44.com",
                "bolt.new",
                "v0.dev",
                "same.dev",
                "tempolabs.ai",
                "create.xyz",
                "app.devin.ai",
                "mgx.dev",

                // 🔴 AI Code Editors (Cloud)
                "cursor.com",
                "cursor.sh",
                "windsurf.ai",
                "codeium.com",
                "tabnine.com",
                "supermaven.com",
                "aider.chat",

                // 🔴 Text Transmission / Translation
                "grammarly.com",
                "deepl.com",
                "translate.google.com",

                // 🔴 Code & Text Paste
                "pastebin.com",
                "gist.github.com",

                // 🔴 Tunneling
                "ngrok.com",
                "ngrok.io",
                "localtunnel.me",
                "trycloudflare.com",
                "serveo.net",

                // 🔴 Online Document Processing
                "smallpdf.com",
                "ilovepdf.com",
                "pdf24.org",
                "sejda.com",

                // 🔴 Cloud Storage (Personal)
                "dropbox.com",
                "drive.google.com",
                "wetransfer.com",
                "mega.nz",
                "icloud.com",
                "box.com",
                "sync.com",
                "mediafire.com",
                "pcloud.com",
                "tresorit.com",
                "fromsmash.com",
                "transfernow.net",
                "filebin.net",

                // 🟠 No-Code / Low-Code App Builders
                "bubble.io",
                "flutterflow.io",
                "glideapps.com",
                "softr.io",
                "adalo.com",
                "retool.com",
                "appsmith.com",
                "weweb.io",
                "webflow.com",
                "framer.com",

                // 🟠 Shadow Backend / Deployment
                "vercel.com",
                "netlify.com",
                "railway.app",
                "render.com",
                "fly.io",
                "supabase.com",
                "neon.tech",
                "planetscale.com",
                "xano.com",

                // 🟠 Messaging & Collaboration
                "whatsapp.com",
                "telegram.org",
                "signal.org",
                "discord.com",
                "slack.com",
                "messenger.com",
                "viber.com",
                "skype.com",
                "snapchat.com",
                "element.io",
                "groupme.com",
                "line.me",
                "kik.com",

                // 🟠 Project Management (Personal)
                "trello.com",
                "notion.so",
                "airtable.com",
                "monday.com",
                "clickup.com",
                "asana.com",
                "basecamp.com",

                // 🟠 Email & Disposable Identity
                "mail.google.com",
                "proton.me",
                "tuta.com",
                "temp-mail.org",
                "guerrillamail.com",

                // 🟠 Remote Access
                "teamviewer.com",
                "anydesk.com",
                "parsec.app",
                "logmein.com",
                "splashtop.com",

                // 🟠 Screen Recording & Screenshot
                "loom.com",
                "gyazo.com",
                "screencastify.com",
                "prntscr.com",
                "streamable.com",

                // 🟠 Note-taking
                "evernote.com",
                "roamresearch.com",
                "sync.obsidian.md",

                // 🟠 Video Conferencing (Ungoverned)
                "whereby.com",
                "meet.jit.si",

                // 🟠 AI Workflow / Agent Builders
                "dify.ai",
                "flowiseai.com",
                "relevanceai.com",
                "stack-ai.com",
                "langflow.org",

                // 🟡 VPN / Anonymization
                "nordvpn.com",
                "expressvpn.com",
                "protonvpn.com",
                "windscribe.com",
                "psiphon3.com",

                // 🟡 Dev Environments (Cloud)
                "github.com",
                "gitlab.com",
                "replit.com",
                "jsfiddle.net",
                "codepen.io",
                "stackblitz.com",
                "glitch.com",
                "codesandbox.io",
                "gitpod.io",

                // 🟡 Automation / Integration
                "zapier.com",
                "make.com",
                "ifttt.com",
                "n8n.io",

                // 🟡 Shadow CRM / Marketing
                "mailchimp.com",
                "canva.com",
                "hubspot.com",
                "pipedrive.com",

                // 🟡 Survey & Form Collection
                "surveymonkey.com",
                "typeform.com",
                "jotform.com",
            ],
            block: [],
            alwaysBlock: false,
            exceptions: {
                duration: 365       // lifetime (in days) of an exception for an application
            },
            warnInterval: 7         // re-show the warning after this many days once acknowledged
        },
        extensions: {
            risk: {
                maxLikelihood: 8.0,
                maxImpact: 4.0,
                maxGlobal: 4.0,
            },
            exceptions: {
                allowed: true,
            },
            whitelist: {
                bundled: [
                    "ghbmnnjooekpmoecnnnilnnbdlolhkhi", "lmjegmlicamnimmfhcmpkclmigmmcbeh", // Google
                    "uBlock0@raymondhill.net", "newtab@mozilla.org", // Firefox
                    "jifbgnmbgbdiedhdecealmlgmekpagde", "gojhcdgcpbpfigcaejpfhfegekdgiblk","igpdmclhhlcpoindmhkhillbfhdgoegm" // Opera
                ],
                allowInstall: [],
                allowAlways: ["gaiabdglljkdhmekohlhdajbffpndkdd"],
            },
            blacklist: {
                id: [],
                keyword: ["free vpn", "crypto", "wallet", "video download", "ad block", "coupon", "tab manager", "new tab", "wallpaper"],
                category: ["lifestyle"],
            },
            verified: {
                required: true,
                allowed: false,
            },
            installations: {
                required: 200000,
                allowed: 5000000
            },
            ratings: {
                minRatingLevel: 4.0,
                minRatingCnt: 500,
            },
            permissions: {
                permissions: {
                    forbidden: ["proxy","debugger","clipboardRead"],
                    requireSpecific: ["scripting", "webRequest", "pageCapture", "cookies"],
                    analyzeOptional: true
                },
                hostPermissions: {
                    requireSpecific: true,
                    allowProtected: false,
                    analyzeOptional: true
                }
            },
            allowSideloading: false,
            allowExisting: false
        }
    }

    static #isLoaded = false

    static #exceptionCompatible = [
        'warningProtocols',
        'account',
        'application',
        'logging',
        'errors',
    ]

    static #domainPatterns = [
        "domain.unmask",
        "company.domains",
        "company.applications",
        "session.domains",
        "session.exceptions",
        "domain.sensitive",
        "domain.publicMail",
        "device.exceptions.domains",
        "account.exceptions.domains",
        "account.mfa.required",
        "account.mfa.exceptions",
        "shadowit.warn",
        "shadowit.block",
    ]

    static #init(config) {
        applyPath(config, this.#domainPatterns, patterns => {
            return Object.fromEntries(
                patterns.map(Config.#netmaskToDomain)
                .map(domain => [domain, true])
            )
        })

        Log.init(config)
    }

    static #netmaskToDomain(netmask) {
        const ip = netmask.replace(/(?<=\.|^)x(?=\.|$)/g, "0")

        if (! IPv4Range.isIPV4(ip)) {
            return netmask
        }

        if (/(^|\.)x\..*\d/.test(netmask)) {
            console.error(`non-contiguous 'x' parts in netmask: ${netmask}`)
            return netmask
        }

        // Store inverted form: e.g. "192.168.x.x" -> "168.192"
        return netmask.split('.')
            .filter(p => p !== 'x')
            .reverse()
            .join('.')
    }

    static load(localConfig = null) {
        debug(`loading ${localConfig ? 'local' : 'global'} configuration`)

        const newConfig = structuredClone(Config.default)
        if (localConfig) mergeDeep(localConfig, newConfig)

        Config.#init(newConfig)

        // calculate the list of protected, sensitive and unmask domains
        const protectedDomains = mergeArrays(newConfig.company.domains, newConfig.company.applications)
        newConfig.protectedDomains = protectedDomains.reduce((result, obj) => {
            Object.keys(obj).forEach(key => { result[key] = result[key] || obj[key]})
            return result
        }, {})

        const sensitiveDomains = mergeArrays(protectedDomains, newConfig.domain.sensitive, newConfig.shadowit.warn, newConfig.shadowit.block)
        newConfig.sensitiveDomains = sensitiveDomains.reduce((result, obj) => {
            Object.keys(obj).forEach(key => { result[key] = result[key] || obj[key]})
            return result
        }, {})

        const unmaskDomains = mergeArrays(newConfig.domain.unmask, newConfig.shadowit.warn, newConfig.shadowit.block)
        newConfig.domain.unmask = unmaskDomains.reduce((result, obj) => {
            Object.keys(obj).forEach(key => { result[key] = result[key] || obj[key]})
            return result
        }, {})

        // any extension that should *always* be whitelisted should definitely be whitelisted for installation
        newConfig.extensions.whitelist.allowInstall = mergeArrays(
            newConfig.extensions.whitelist.allowInstall,
            newConfig.extensions.whitelist.allowAlways,
        )

        newConfig.company.contact = newConfig.company.contact ?? t('global.contact')

        // for every defined exception, copy the global config and override with the fields defined in the exception
        const exceptions = newConfig.exceptions
        newConfig.exceptions = {}

        for (const exception of Object.values(exceptions)) {
            const mergedExceptionConfig = structuredClone(newConfig)
            delete mergedExceptionConfig.exceptions

            Config.#init(exception.config)

            mergeDeep(exception.config, mergedExceptionConfig)

            for (const domain of exception.domains) {
                newConfig.exceptions[domain] = mergedExceptionConfig
            }

            // but only copy settings that can be overridden
            for (const key of Object.keys(mergedExceptionConfig)) {
                if (! this.#exceptionCompatible.includes(key)) {
                    if (exception.config.hasOwnProperty(key)) {
                        console.warn(`cannot override configuration for setting '${key}'`)
                    }
                    delete mergedExceptionConfig[key]
                }
            }

        }

        config = newConfig
        Config.#isLoaded = true
        Config.#loadResolve?.(config)
        Log.start()
    }

    static assertIsLoaded() {
        if (! Config.#isLoaded) {
            throw new Error('the configuration has not yet been received from the native messaging port')
        }
    }

    static #loadPromise = null
    static #loadResolve = null

    static ready() {
        if (Context.isContentScript() || Context.isExtensionPage())  return callServiceWorker("GetConfig")

        assert(Context.isServiceWorker(), "method cannot be called in this context")

        if (Config.#isLoaded) return Promise.resolve(config)

        if (!Config.#loadPromise) {
            Config.#loadPromise = new Promise((resolve) => Config.#loadResolve = resolve)
        }

        return Config.#loadPromise
    }

    static forHostname(hostname) {
        Config.assertIsLoaded()

        const exception = matchDomain(hostname, config.exceptions)
        return exception ?? config
    }

    static forURL(url) {
        return Config.forHostname(url?.toURL()?.hostname)
    }

    static isProtected(sitename) {
        Config.assertIsLoaded()
        return matchDomain(sitename, config.protectedDomains)
    }

    static isSensitive(sitename) {
        Config.assertIsLoaded()
        return matchDomain(sitename, config.sensitiveDomains)
    }

}

let config