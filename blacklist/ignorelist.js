class Ignorelist {

    #ignoreList = { }

    constructor() {
        for (const blacklist of [config.blacklist.url, config.blacklist.ip]) {
            for (const blacklistEntry of blacklist) {
                this.#ignoreList[blacklistEntry.url] = true;
            }
        }

        config.blacklist.ignore.forEach(url => {
            this.#ignoreList[url] = true;
        });
    }

    find(url) {
        if (!isString(url)) return null

        if (this.#ignoreList.hasOwnProperty(url)) {
            return true
        }

        return null;
    }
}