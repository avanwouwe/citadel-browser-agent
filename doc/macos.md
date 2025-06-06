# macOS installation

Browser extensions are sandboxed and cannot access the local operating system. To allow Citadel to write to syslog it is necessary to set up Native Messaging. This involves placing a JSON manifest file in a specific place that gives the path to the program that will be started by Chrome, and then receive the events and log them to syslog.

You can use your MDM to distribute [the installer](https://github.com/avanwouwe/citadel-browser-agent/releases/latest), which will take care of everything.

Alternatively, place the [JSON manifest](/bin/macos/citadel.browser.agent.json) in:
* `/Library/Google/Chrome/NativeMessagingHosts/citadel.browser.agent.json`
* `/Library/Mozilla/NativeMessagingHosts/citadel.browser.agent.json` (use the [Firefox specific manifest](/bin/macos/citadel.browser.agent-firefox.json))
* `/Library/Opera/NativeMessagingHosts/citadel.browser.agent.json`
* `/Library/Microsoft\ Edge/NativeMessagingHosts/citadel.browser.agent.json`
* `/Library/BraveSoftware/Brave-Browser/citadel.browser.agent.json`

Then ensure that [the messaging script](/bin/citadel-browser-agent) is deployed in `/Library/Scripts/Citadel/citadel-browser-agent` and marked executable.

You can verify that events are being created by running the following command:
```
log stream --process citadel-browser-agent --predicate 'eventMessage BEGINSWITH "browser agent"' --level debug
```

## configuration
Citadel has sensible defaults, but you can change the configuration of Citadel, for example to change the logging and masking levels or to declare your own blacklist or local IT support e-mail address. Just place a file called `citadel-browser-agent.json` with the [correct format](/doc/configuration.md) in the `/Library/Scripts/Citadel/` directory. See the [configuration reference](/doc/configuration.md) for more information.