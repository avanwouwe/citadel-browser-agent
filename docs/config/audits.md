---
layout: default
title: Audits
parent: Configuration
nav_order: 11
---

# Audits
Citadel performs audits, verifying compliance regarding device configuration or password policies. Each audit has one or more controls, that each have a status:
* <span class="unknown">`UNKNOWN`</span> : the control could not be verified
* <span class="passing">`PASSING`</span> : the control is working and safe
* <span class="failing">`FAILING`</span> : the control is not nominal, but there is no immediate risk
* <span class="warning">`WARNING`</span> : the control is unsafe, action needs to be planned
* <span class="blocking">`BLOCKING`</span> : the control is unsafe, immediate action is required

All controls and audits are aggregated and the "worst" control defines the state of your device.

## gradual escalation
In order to allow users time to react, to prevent blocking them when they are performing time-critical tasks, and to ensure that notifications and access restrictions are commensurate with the information security risk, Citadel allows you to specify different notification schemas.
* <span class="unknown">`NOTHING`</span> : issue is shown in the dashboard, but the user is not notified or reminded
* <span class="failing">`NOTIFY`</span> : user is notified, reminded periodically
* <span class="warning">`WARN`</span> : user is warned that access will be cut unless action is taken
* <span class="blocking">`BLOCK`</span> : user is told access will be restored once the control is restored

Controls set to `SKIP` are not run at all.

The delay between the warning and blocking steps is in **worked days** and only takes into account the days that the user is active. If a user has a failing control and is absent from work for two weeks (without using the device) Citadel does not take this period of absence into account.

Notifications and warnings are given to the user via OS-level notifications and modal windows that are injected in the pages of the protected scope. When the user clicks on the notification, the user is shown the [dashboard](/dashboard) to show them the controls that are non-compliant. 
