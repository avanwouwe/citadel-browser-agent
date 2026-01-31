class Config {
    static config = {
        company: {
            name: 'Your Organisation',          // name of your organisation
            contact: 'your IT support',         // replace with the email address of your support
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
            maxUrlLength: 500,
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
            unhash: [],
            isApplication: [
                "apple.com",
                "google.com",
                "microsoft.com",
                "onmicrosoft.com",
                "oraclecloud.com",
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
                "airbyte.com",
                "jamfcloud.com",
                "fleetdm.com",
                "jumpcloud.com",
                "crowdstrike.com",
                "sentinelone.com",
                "docker.com",
                "docker.io",
                "vanta.com",
                "securityscorecard.io",
                "bitsight.com",
                "openai.com",
                "anthropic.com",
                "claude.ai",
                "storylane.io",
                "usetiful.com",
                "workos.com",
                "okta.com",
                "auth0.com",
                "n8n.io",
                "zapier.com",
                "tableau.com",
                "qlik.com",
                "zoom.com",
                "webex.com",
                "airtable.com",
                "databricks.com",
                "snowflake.com",
                "basecamp.com",
                "clickup.com",
                "monday.com",
                "intercom.com",
                "crisp.chat",
                "zendesk.com",
                "document360.com",
                "document360.io",
                "datadoghq.com",
                "newrelic.com",
                "anydesk.com",
                "teamviewer.com"
            ],
            isPublicMail: [
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
            maxSessionDays: 14,
            domains: [],
            exceptions: [],
        },
        account: {
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
                duration: 60,
                domains: [ ]
            },
            passwordReuse: {
                action: "WARN",
                exceptions: {
                    allowed: false,
                    groups: [ ]
                }
            },
            retentionDays: 90,
            checkOnlyInternal: true,
            checkOnlyProtected: true,
            passwordPolicy: {
                minLength: 15,
                minNumberOfDigits: 1,
                minNumberOfLetters: 0,
                minNumberOfUpperCase: 1,
                minNumberOfLowerCase: 1,
                minNumberOfSymbols: 1,
                minEntropy: 2.5,
                minSequence: 4
            },
            mfa: {
                waitMinutes: 10,
                maxSessionDays: 14,
                required: [],
                exceptions: []
            }
        },
        blacklist: {
            exceptions: {
                duration: 60
            },
            ip: [
                {
                    name: "FireHOL (level 1)",
                    url: "https://iplists.firehol.org/files/firehol_level1.netset",
                    freq: 60
                },
                {
                    name: "https://github.com/romainmarcoux/malicious-outgoing-ip-domains",
                    url: "https://raw.githubusercontent.com/romainmarcoux/malicious-outgoing-ip/main/full-outgoing-ip-40k.txt",
                    freq: 60
                },
                {
                    name: "IPsum (level 2+)",
                    url: "https://raw.githubusercontent.com/stamparm/ipsum/refs/heads/master/levels/2.txt",
                    freq: 60 * 12
                }
            ],
            url: [
                {
                    name: "URLhaus",
                    url: "https://urlhaus.abuse.ch/downloads/text_online/",
                    freq: 60
                },
                {
                    name: "https://github.com/romainmarcoux/malicious-domains (AA)",
                    url: "https://raw.githubusercontent.com/romainmarcoux/malicious-domains/main/full-domains-aa.txt",
                    freq: 60
                },
                {
                    name: "https://github.com/romainmarcoux/malicious-domains (AB)",
                    url: "https://raw.githubusercontent.com/romainmarcoux/malicious-domains/main/full-domains-ab.txt",
                    freq: 60
                },
                {
                    name: "https://github.com/romainmarcoux/malicious-domains (AC)",
                    url: "https://raw.githubusercontent.com/romainmarcoux/malicious-domains/main/full-domains-ac.txt",
                    freq: 60
                },
                {
                    name: "Known Torrent Sites",
                    url: "https://raw.githubusercontent.com/sakib-m/Pi-hole-Torrent-Blocklist/refs/heads/main/all-torrent-trackers.txt",
                    freq: 60 * 12
                }
            ],
        },
        whitelist: {
            ip: [
                "10.0.0.0/8",
                "127.0.0.0/8",
                "0.0.0.0/32",
                "169.254.0.0/16",
                "172.16.0.0/12",
                "192.168.0.0/16"
            ],
            url: [ ],
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
                'net::ERR_BLOCKED_BY_CLIENT' : 'NEVER',
                'net::ERR_SSL_CLIENT_AUTH_CERT_NEEDED' : 'NEVER',
                'net::ERR_BLOCKED_BY_ORB' : 'DEBUG',
                'net::ERR_BLOCKED_BY_CSP' : 'DEBUG',
                'net::ERR_BLOCKED_BY_FINGERPRINTING_PROTECTION' : 'DEBUG',
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
                "NOTIFY": ["MaxUptime", "SSHKeys"],
                "WARN": [],
                "BLOCK": ["DriveEncryption", "RemovableStorage"]
            },
            exceptions: {
                duration: 60,
                domains: [ ]
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
        extensions: {
            risk: {
                maxLikelihood: 8.0,
                maxImpact: 4.0,
                maxGlobal: 4.0,
            },
            exceptions: {
                allowed: true,
            },
            id: {
                allowed: ["ghbmnnjooekpmoecnnnilnnbdlolhkhi", "lmjegmlicamnimmfhcmpkclmigmmcbeh"],
                forbidden: [],
            },
            category: {
                allowed: [],
                forbidden: ["lifestyle"],
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
            allowExisting: false,
            onlyDisable: true,
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
        "domain.unhash",
        "company.domains",
        "company.applications",
        "session.domains",
        "session.exceptions",
        "domain.isApplication",
        "domain.isPublicMail",
        "device.exceptions.domains",
        "account.exceptions.domains",
        "account.mfa.required",
        "account.mfa.exceptions",
    ]

    static #init(config) {
        applyPath(config, this.#domainPatterns, (patterns) => {
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

    static load(newConfig) {
        mergeDeep(newConfig, Config.config)

        Config.#init(Config.config)

        const scope = [config.domain.isApplication, config.company.applications, config.company.domains]
        config.protectedDomains = scope.reduce((result, obj) => {
            Object.keys(obj).forEach(key => { result[key] = result[key] || obj[key]})
            return result
        }, {})

        // for every defined exception, copy the global config and override with the fields defined in the exception
        const exceptions = Config.config.exceptions
        Config.config.exceptions = {}

        for (const exception of Object.values(exceptions)) {
            const mergedExceptionConfig = cloneDeep(Config.config)
            delete mergedExceptionConfig.exceptions

            Config.#init(exception.config)

            mergeDeep(exception.config, mergedExceptionConfig)

            for (const domain of exception.domains) {
                Config.config.exceptions[domain] = mergedExceptionConfig
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

        Config.#isLoaded = true
        Config.#loadResolve?.(Config.config)
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
        if (Config.#isLoaded) return Promise.resolve(Config.config)

        if (!Config.#loadPromise) {
            Config.#loadPromise = new Promise((resolve) => Config.#loadResolve = resolve)
        }

        return Config.#loadPromise
    }

    static forHostname(hostname) {
        Config.assertIsLoaded()

        const exception = matchDomain(hostname, config.exceptions)
        return exception ?? Config.config
    }

    static forURL(url) {
        return Config.forHostname(url?.toURL()?.hostname)
    }

    static isProtected(sitename) {
        Config.assertIsLoaded()
        return matchDomain(sitename, config.protectedDomains)
    }

}

let config = Config.config