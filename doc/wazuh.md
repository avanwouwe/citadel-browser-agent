# Wazuh integration
Follow the following steps to ship the syslog events to your Wazuh instance.

## change ossec.conf
### macOS
Modify the existing entry in`ossec.conf` to ensure that the syslog events are seen by Wazuh, by adding to the query: `or (process == "Python" and message beginsWith "browser agent : ")`

```
  <localfile>
    <location>macos</location>
    <log_format>macos</log_format>
    <query type="trace,log,activity" level="info">(process == "sudo") or (process == "sessionlogoutd" and message contains "logout is complete.") or (process == "sshd") or (process == "tccd" and message contains "Update Access Record") or (message contains "SessionAgentNotificationCenter") or (process == "screensharingd" and message contains "Authentication") or (process == "securityd" and eventMessage contains "Session" and subsystem == "com.apple.securityd") or (process == "Python" and message beginsWith "browser agent : ")</query>
  </localfile>
```

# add decoder
In order for the log entries to be converted to events, a decoder has to be defined. In the Wazuh `Server Management` go to the `Decoders` configuration and create a new decoder file `0009-browser-agent_decoder.xml` and fill it with the contents of [/doc/0009-browser-agent_decoder.xml](/doc/0009-browser-agent_decoder.xml).

# add rules
Events only generate alerts if they are matched by a rule. In the Wazuh `Server Management` go to the `Rules` configuration and create a new rules file `0019-browser-agent_rules.xml` and fill it with the contents of [/doc/0019-browser-agent_rules.xml](/doc/0019-browser-agent_rules.xml).

Restart the server for the changes to take effect, for example using the `Restart cluster` button in the `Server Management` > `Status` menu.

You should start seeing new events show up in the Threat hunting module. You can filter for `data.browseragent.event: *` to make it easier to see.

![screenshot of events in Wazuh](/doc/screenshot%20wazuh.png)
