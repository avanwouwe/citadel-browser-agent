class Alarm {

    static MONTHLY = 'monthly'
    static DAILY = 'daily'

    static #DAILY   =      24 * 60
    static #MONTHLY = 30 * 24 * 60

    static start() {
        chrome.alarms.create(Alarm.DAILY, {
            delayInMinutes: Alarm.#DAILY,
            periodInMinutes: Alarm.#DAILY,
        });

        chrome.alarms.create(Alarm.MONTHLY, {
            delayInMinutes: Alarm.#MONTHLY,
            periodInMinutes: Alarm.#MONTHLY,
        });
    }

    static clear() {
        chrome.alarms.clear(Alarm.DAILY)
        chrome.alarms.clear(Alarm.MONTHLY)
    }
}

