---
layout: default
title: macOS
parent: Installation
nav_order: 2
---

# macOS installation

Browser extensions are sandboxed and cannot access the local operating system. To allow the Citadel extension to write to syslog it is necessary to set up Native Messaging. This involves placing a JSON manifest file in a specific place that gives the path to the program that will be started by Chrome, and then receive the events and log them to syslog.

You can use your MDM to distribute [the installer](https://github.com/avanwouwe/citadel-browser-agent/releases/latest), which will take care of all of that.

On top of the Citadel installer, you need to [install osquery](https://osquery.io/downloads) on the endpoint, so that the agent can query the device state.

Alternatively, should you need for some reason to install Citadel manually, place the [JSON manifest](https://github.com/avanwouwe/citadel-browser-agent/blob/main/bin/build/mac/citadel.browser.agent.json) in:
* `/Library/Google/Chrome/NativeMessagingHosts/citadel.browser.agent.json`
* `/Library/Mozilla/NativeMessagingHosts/citadel.browser.agent.json` (use the [Firefox specific manifest](https://github.com/avanwouwe/citadel-browser-agent/blob/main/bin/build/mac/citadel.browser.agent-firefox.json))
* `/Library/Opera/NativeMessagingHosts/citadel.browser.agent.json`
* `/Library/Microsoft\ Edge/NativeMessagingHosts/citadel.browser.agent.json`
* `/Library/BraveSoftware/Brave-Browser/citadel.browser.agent.json`

Copy the contents of [/bin/controls](https://github.com/avanwouwe/citadel-browser-agent/blob/main/bin/controls) to `C:\Program Files\Citadel\controls`. Make sure that they are owned by root and not world writable.

Then download [the installer](https://github.com/avanwouwe/citadel-browser-agent/releases/latest) or build it using the [build script](https://github.com/avanwouwe/citadel-browser-agent/blob/main/bin/build/mac/build.sh) and ensure that it is deployed in `/Library/Scripts/Citadel/citadel-browser-agent` and marked executable.

You can verify that events are being created by running the following command:
```
log stream --process citadel-browser-agent --predicate 'eventMessage BEGINSWITH "browser agent"' --level debug
```

## configuration
Citadel has sensible defaults, but you can change the configuration of Citadel, for example to change the logging and masking levels or to declare your own blacklist or local IT support e-mail address. Just place a file called `citadel-browser-agent.json` with the [correct format](/configuration) in the `/Library/Scripts/Citadel/` directory. See the [configuration reference](/configuration) for more information.