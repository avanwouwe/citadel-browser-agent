class State {
    static UNKNOWN = "UNKNOWN"
    static PASSING = "PASSING"
    static FAILING = "FAILING"
    static WARNING = "WARNING"
    static BLOCKING = "BLOCKING"

    static values= [this.PASSING, this.FAILING, this.WARNING, this.BLOCKING]
    static indexOf(value) { return this.values.indexOf(value) }
}

class Action {
    static SKIP = "SKIP"
    static NOTHING = "NOTHING"
    static NOTIFY = "NOTIFY"
    static WARN = "WARN"
    static BLOCK = "BLOCK"

    static values= [this.NOTHING, this.NOTIFY, this.WARN, this.BLOCK]
}
