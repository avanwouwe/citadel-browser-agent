class DeviceTrust {

    static TYPE = "device"

    static #audit = new Audit(DeviceTrust.TYPE)

    static async init() {
        await DeviceTrust.#audit.ready()
    }

    static addAudit(audit) {
        for (const report of Object.values(audit.reports)) {
            const prevControl = DeviceTrust.#audit.getFinding(report.name)
            const currControl = DeviceTrust.#createControl(report.name)

            const control = prevControl ?? currControl
            control.definition = audit.definitions[report.name]
            control.action = currControl.action

            if (control.action === Action.SKIP) continue

            const prevState = prevControl?.getState()
            control.addReport(report)
            DeviceTrust.#audit.setFinding(control)
            const currState = control.getState()

            if (control.action === Action.BLOCK && currState === State.BLOCKING && prevState !== currState) {
                logger.log(nowTimestamp(), "devicetrust", "immediate block", undefined, Log.ERROR, control.name, `control '${control.name}' triggered an immediate blocking`, undefined, undefined, false)
            }
        }

        // Remove controls that are no longer in the report
        const controlNames = new Set(Object.keys(audit.reports))
        for (const controlName of Object.keys(DeviceTrust.getStatus().controls)) {
            if (!controlNames.has(controlName)) {
                DeviceTrust.#audit.removeFinding(controlName)
            }
        }

        DeviceTrust.#audit.save()
        DeviceTrust.#audit.notify()
    }

    static #createControl(name) {
        const warnTrigger = config.device.trigger.warn
        const blockTrigger = config.device.trigger.block

        let action = config.device.actions.default
        for (const i of Action.values) {
            if (config.device.actions[i].includes(name)) {
                action = i
            }
        }
        return new Control(name, action, warnTrigger, blockTrigger)
    }

    static getStatus() {
        return DeviceTrust.#audit.getStatus()
    }

    static report() {
        Object.values(DeviceTrust.#audit.getFindings()).forEach(control => {
            logger.log(nowTimestamp(), "report", "devicetrust control", undefined, Log.INFO, control.getState(), `control '${control.name}' = ${control.getState()}`, undefined, undefined, false)
        })
        logger.log(nowTimestamp(), "report", "devicetrust compliance", undefined, Log.INFO, DeviceTrust.#audit.getCompliance(), `endpoint compliance rate = ${DeviceTrust.#audit.getCompliance()} %`, undefined, undefined, false)
    }

}

