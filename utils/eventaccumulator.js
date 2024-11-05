class EventAccumulator {

    #sum
    #key
    #reportPeriodicity
    #callback

    constructor(key, periodicity, callback) {
        this.#sum = new PersistentObject(key, { value: 0 }).value();
        this.#key = key;
        this.#reportPeriodicity = periodicity
        this.#callback = callback
    }

    increment(increment = 1) {
        this.#sum.value += increment
    }

    set(value) {
        this.#sum.value = value
    }

    report() {
        const sum = this.#sum.value;

        if (sum > 0) {
            rateLimit(this.#key, this.#reportPeriodicity, (isTriggered) => {
                if (isTriggered) {
                    this.#sum.value = 0;
                    this.#callback(sum)
                }
            });
        }
    }

}