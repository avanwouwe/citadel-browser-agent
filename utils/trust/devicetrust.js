class DeviceTrust {

    static TYPE = "device"

    #audit = new Audit()

    addReport(report) {
        this.#audit.addReport(report)
        this.#audit.notify("devicetrust")
    }

    getStatus() {
        return this.#audit.getStatus()
    }

    report() {
        Object.values(this.#audit.getFindings()).forEach(control => {
            logger.log(nowTimestamp(), "report", "devicetrust control", undefined, Log.INFO, control.getState(), `control ${control.name} = ${control.getState()}`, undefined, undefined, false)
        })
        logger.log(nowTimestamp(), "report", "devicetrust compliance", undefined, Log.INFO, this.#audit.getCompliance(), `endpoint compliance rate = ${this.#audit.getCompliance()} %`, undefined, undefined, false)
    }

}

