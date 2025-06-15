class Exceptionlist extends URLBlacklist {

    constructor() {
        super()
        super.init()
    }

    add(entry) {
        super.add(entry)

        setTimeout(() => {
            super.remove(entry)
        }, config.blacklist.exceptions.duration * ONE_MINUTE)
    }

}