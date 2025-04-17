class AllowList extends URLBlacklist {

    add(entry, time) {
        super.add(entry)

        setTimeout(() => {
            super.remove(entry)
        }, time)
    }

}