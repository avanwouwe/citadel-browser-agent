# Wazuh integration
Follow the following steps to ship the syslog events to your Wazuh instance.

## change ossec.conf
### macOS
If you haven't already done so, install the [Native Messaging module](/doc/macos.md) that Citadel needs to communicate the events outside browser sandbox.

In the `ossec.conf` file that is deployed on agents, edit the existing `<localfile>` entry to ensure that the syslog events are seen by Wazuh, by adding to the query: `or (process == "citadel-browser-agent" and message beginsWith "browser agent : ")`

```
  <localfile>
    <location>macos</location>
    <log_format>macos</log_format>
    <query type="trace,log,activity" level="info">(process == "sudo") or (process == "sessionlogoutd" and message contains "logout is complete.") or (process == "sshd") or (process == "tccd" and message contains "Update Access Record") or (message contains "SessionAgentNotificationCenter") or (process == "screensharingd" and message contains "Authentication") or (process == "securityd" and eventMessage contains "Session" and subsystem == "com.apple.securityd") or (process == "citadel-browser-agent" and message beginsWith "browser agent : ")</query>
  </localfile>
```



### Windows
If you haven't already done so, install the [Native Messaging module](/doc/windows.md) that Citadel needs to communicate the events outside browser sandbox.

In the `ossec.conf` file that is deployed on agents, add the following `<localfile>` entry to ensure that the syslog events are seen by Wazuh.
```
  <!-- Browser Agent -->
  <localfile>
    <log_format>syslog</log_format>
    <location>C:\Program Files\Citadel\logs\CitadelSvc.out.log</location>
    <ignore>, "level": "(DEBUG|TRACE)", </ignore>
  </localfile>
```

# add decoder
In order for the log entries to be converted to events, a decoder has to be defined. In the Wazuh `Server Management` > `Decoders` configuration and create a new decoder file `0590-browser-agent_decoder.xml` and fill it with the contents of [/doc/0590-browser-agent_decoder.xml](/doc/0590-browser-agent_decoder.xml).

# add rules
Events only generate alerts if they are matched by a rule. In Wazuh `Server Management` > `Rules` configuration create a new rules file `0019-browser-agent_rules.xml` and fill it with the contents of [/doc/0019-browser-agent_rules.xml](/doc/0019-browser-agent_rules.xml).

Restart the server for the changes to take effect, for example using the `Restart cluster` > `Server Management` > `Status` menu.

You should start seeing new events show up in the `Threat hunting` module, for example if you visit [http://neverssl.com](http://neverssl.com) and filter in Wazuh for `data.browseragent.event: *`.

![screenshot of events in Wazuh](/doc/screenshot%20wazuh.png)
