class Config {
    static config = {
        company: {
            contact: 'Your IT support',         // replace with your support e-mail
            name: 'Company',
        },
        warningProtocols: ['http:', 'ftp:', 'ws:'],
        application: {
            retentionDays: 365,
        },
        domain: {
            isKnownApplication: {
                "apple.com": true,
                "google.com": true,
                "microsoft.com": true,
                "onmicrosoft.com": true,
                "oraclecloud.com": true,
                "sharepoint.com": true,
                "hotmail.com": true,
                "outlook.com": true,
                "azure.com": true,
                "amazon.com": true,
                "salesforce.com": true,
                "hubspot.com": true,
                "pipedrive.com": true,
                "slack.com": true,
                "github.com": true,
                "gitlab.com": true,
                "notion.so": true,
                "atlassian.com": true,
                "atlassian.net": true,
                "1password.com": true,
                "bitwarden.com": true,
                "lastpass.com": true,
                "airbyte.com": true,
                "jamfcloud.com": true,
                "fleetdm.com": true,
                "jumpcloud.com": true,
                "crowdstrike.com": true,
                "sentinelone.com": true,
                "docker.com": true,
                "docker.io": true,
                "vanta.com": true,
                "securityscorecard.io": true,
                "bitsight.com": true,
                "openai.com": true,
                "anthropic.com": true,
                "claude.ai": true,
                "storylane.io": true,
                "usetiful.com": true,
                "workos.com": true,
                "okta.com": true,
                "auth0.com": true,
                "n8n.io": true,
                "zapier.com": true,
                "tableau.com": true,
                "qlik.com": true,
                "zoom.com": true,
                "webex.com": true,
                "airtable.com": true,
                "databricks.com": true,
                "snowflake.com": true,
                "basecamp.com": true,
                "clickup.com": true,
                "monday.com": true,
                "intercom.com": true,
                "crisp.chat": true,
                "zendesk.com": true,
                "document360.com": true,
                "document360.io": true,
                "datadoghq.com": true,
                "newrelic.com": true,
                "anydesk.com": true,
                "teamviewer.com": true,
            },
            isPublicMail: {
                "gmail.com": true,
                "yahoo.com": true,
                "hotmail.com": true,
                "hotmail.co.uk": true,
                "hotmail.fr": true,
                "hotmail.de": true,
                "hotmail.es": true,
                "hotmail.it": true,
                "hotmail.in": true,
                "hotmail.jp": true,
                "outlook.com": true,
                "outlook.fr": true,
                "outlook.co.uk": true,
                "outlook.de": true,
                "outlook.jp": true,
                "outlook.es": true,
                "outlook.it": true,
                "outlook.in": true,
                "aol.com": true,
                "mail.com": true,
                "live.com": true,
                "ymail.com": true,
                "icloud.com": true,
                "zoho.com": true,
                "gmx.com": true,
                "yandex.com": true,
                "protonmail.com": true,
                "me.com": true,
                "msn.com": true,
                "comcast.net": true,
                "libero.it": true,
                "web.de": true,
                "sbcglobal.net": true,
                "att.net": true,
                "verizon.net": true,
                "bellsouth.net": true,
                "btinternet.com": true,
                "sky.com": true,
                "sina.com": true,
                "qq.com": true,
                "seznam.cz": true,
                "wp.pl": true,
                "o2.pl": true,
                "rambler.ru": true,
                "netzero.net": true,
                "earthlink.net": true,
                "hushmail.com": true,
                "ukr.net": true,
                "freenet.de": true,
                "aliyun.com": true,
                "t-online.de": true,
                "rediffmail.com": true,
                "wanadoo.co.uk": true,
                "wanadoo.fr": true,
                "wanadoo.nl": true,
            }
        },
        account: {
            retentionDays: 90,
            checkPersonal: false,
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
        },
        blacklist: {
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
                }
            ],
            ignore: [
                'about:blank',
                'about:srcdoc',
                'chrome://new-tab-page/'
            ]
        },
        reporting: {
            maxInteractionEntries: 200,
            maxApplicationEntries: 500,
            maxAccountEntries: 500,
            onlyAuthenticated: true
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

    static load(newConfig) {
        mergeDeep(newConfig, Config.config)
        Config.#isLoaded = true
        Port.postMessage("config", "ok")
    }

    static assertIsLoaded() {
        if (! Config.#isLoaded) {
            throw new Error('the configuration has not yet been received from the native messaging port')
        }
    }

}

let config = Config.config