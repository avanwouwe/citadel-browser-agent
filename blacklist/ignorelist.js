class Ignorelist {

    #ignoreList = new URLBlacklist()

    constructor() {
        for (const blacklist of [config.blacklist.url, config.blacklist.ip]) {
            for (const blacklistEntry of blacklist) {
                this.#ignoreList.add(blacklistEntry.url)
            }
        }

        config.ignorelist.forEach(url => this.#ignoreList.add(url))
    }

    find(url) {
        this.#ignoreList.find(url)
    }
}