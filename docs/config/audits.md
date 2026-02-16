---
layout: default
title: Audits
parent: Configuration
nav_order: 7
---

# Audits
Citadel performs audits, verifying compliance regarding device configuration or password policies. Each audit has one or more controls, that each have a status:
* <span class="unknown">`UNKNOWN`</span> : the control could not be verified
* <span class="passing">`PASSING`</span> : the control is working and safe
* <span class="failing">`FAILING`</span> : the control is unsafe, but there is no immediate risk
* <span class="warning">`WARNING`</span> : the control is unsafe, action needs to be planned
* <span class="blocking">`BLOCKING`</span> : the control is unsafe, immediate action is required

All controls and audits are aggregated and the "worst" control, defines the state of your device.

## gradual escalation
In order to allow users time to react, and to ensure that notifications and access restrictions are commensurate with the information security risk, Citadel applies a gradual escalation mechanism.
* <span class="failing">`FAILING`</span> : user is notified, reminded periodically
* <span class="warning">`WARNING`</span> : user is warned access will be cut unless action is taken
* <span class="blocking">`BLOCKING`</span> : user is told access will be restored once the control is restored

You can set for each control different maximum escalation levels and delays between steps, in order to adapt Citadel to your context and risks.

The delay between steps is in **worked days** and only takes into account the days that the user is active. If a user has a failing control and is absent from work for two weeks (without using the device) Citadel does not take into account this period of absence.

Notifications and warnings are given to the user via OS-level notifications and modal windows that are injected in the pages. When the user clicks on the notification, the user is shown the [dashboard](/dashboard) to show them the controls that are non-compliant. 
