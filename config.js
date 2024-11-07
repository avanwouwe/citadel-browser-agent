class Config {
    static config = {
        contact: 'it-support@whoz.com',
        warningProtocols: ['http:', 'ftp:'],
        standardPorts: ['80', '443'],
        blacklist: {
            refresh: 60,
            ip: [
                {name: "firehol (level 1)", url: "https://iplists.firehol.org/files/firehol_level1.netset", freq: 60},
                {
                    name: "romainmarcoux",
                    url: "https://raw.githubusercontent.com/romainmarcoux/malicious-outgoing-ip/main/full-outgoing-ip-40k.txt",
                    freq: 60
                }
            ],
            url: [
                {name: "urlhaus", url: "https://urlhaus.abuse.ch/downloads/text_online/", freq: 60}
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
            maskUrlLevel: 'DEBUG',
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