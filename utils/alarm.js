class Alarm {

    static CLEANING = 'cleaning'
    static REPORTING = 'reporting'

    static #DAILY   =      24 * 60
    static #MONTHLY = 30 * 24 * 60

    static start() {
        chrome.alarms.create(Alarm.REPORTING, {
            delayInMinutes: Alarm.#DAILY,
            periodInMinutes: Alarm.#DAILY,
        });

        chrome.alarms.create(Alarm.CLEANING, {
            delayInMinutes: Alarm.#MONTHLY,
            periodInMinutes: Alarm.#MONTHLY,
        });
    }

    static clear() {
        chrome.alarms.clear(Alarm.REPORTING)
        chrome.alarms.clear(Alarm.CLEANING)
    }
}

