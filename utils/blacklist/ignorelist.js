class Ignorelist {

    #ignoreList = new URLBlacklist()

    constructor() {
        for (const blacklist of [config.webfilter.blacklist.url, config.webfilter.blacklist.ip]) {
            for (const blacklistEntry of Object.values(blacklist)) {
                blacklistEntry.urls.forEach(url => this.#ignoreList.add(url))
            }
        }

        config.ignorelist.forEach(url => this.#ignoreList.add(url))
    }

    find(url) {
        return this.#ignoreList.find(url)
    }
}