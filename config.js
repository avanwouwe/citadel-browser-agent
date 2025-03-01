class Config {
    static config = {
        contact: 'Your IT support',
        warningProtocols: ['http:', 'ftp:'],
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
            maxEntries: 200,
            onlyApps: true
        },
        logging: {
            failurePopup: true,
            logLevel: 'DEBUG',
            consoleLevel: 'WARN',
            maskUrlLevel: 'INFO',
            maxUrlLength: 500
        }
    }

    static #isLoaded = false

    static load(newConfig) {
        mergeDeep(Config.config, newConfig)
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