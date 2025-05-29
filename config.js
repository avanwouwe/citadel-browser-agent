class Config {
    static config = {
        company: {
            name: 'Company',
            contact: 'Your IT support',         // replace with your support e-mail
            logo: "",                           // replace with the URL of your logo
            domains: [ ],
        },
        warningProtocols: ['http:', 'ftp:', 'ws:'],
        application: {
            retentionDays: 365,
        },
        exceptions: [ ],
        domain: {
            isKnownApplication: [
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
            onlyAuthCookies: true
        },
        account: {
            retentionDays: 90,
            checkExternal: false,
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
                exception: []
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
                    name: "Known Torrent Sites",
                    url: "https://raw.githubusercontent.com/sakib-m/Pi-hole-Torrent-Blocklist/refs/heads/main/all-torrent-trackres.txt",
                    freq: 60 * 12
                }
            ],
        },
        whitelist: {
            ip: [
                "10.0.0.0/8",
                "127.0.0.0/8",
                "169.254.0.0/16",
                "172.16.0.0/12",
                "192.168.0.0/16"
            ],
            url: [ ],
        },
        ignorelist: [
            'about:blank',
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
                'net::ERR_BLOCKED_BY_CLIENT' : 'DEBUG',
                'net::ERR_BLOCKED_BY_ORB' : 'DEBUG',
                'net::ERR_BLOCKED_BY_CSP' : 'DEBUG',
                'net::ERR_BLOCKED_BY_FINGERPRINTING_PROTECTION' : 'DEBUG',
            }
        },
        logging: {
            reportFailure: true,
            logLevel: 'DEBUG',
            consoleLevel: 'WARN',
            maskUrlLevel: 'INFO',
            maxUrlLength: 500,
        }
    }

    static #isLoaded = false

    static #exceptionCompatible = [
        'warningProtocols',
        'account',
        'session',
        'application',
        'logging',
        'errors',
    ]

    static #domainPatterns = [
        "company.domains",
        "domain.isKnownApplication",
        "domain.isPublicMail",
        "account.mfa.required",
        "account.mfa.exception",
    ]

    static #init(config) {
        applyPath(config, this.#domainPatterns, (patterns) => Object.fromEntries(patterns.map(domain => [domain, true])))

        Log.init(config)
    }

    static load(newConfig) {
        mergeDeep(newConfig, Config.config)

        Config.#init(Config.config)

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
        Port.postMessage("config", "ok")
    }

    static assertIsLoaded() {
        if (! Config.#isLoaded) {
            throw new Error('the configuration has not yet been received from the native messaging port')
        }
    }

    static forHostname(hostname) {
        Config.assertIsLoaded()

        const exception = matchDomain(hostname, config.exceptions)
        if (exception) {
            return exception
        }
        return Config.config
    }

    static forURL(url) {
        if (isString(url)) {
            url = url.toURL()
        }

        return Config.forHostname(url?.hostname)
    }

}

let config = Config.config