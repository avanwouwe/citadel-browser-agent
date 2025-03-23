# Windows installation

Browser extensions are sandboxed and cannot access the local operating system. To allow Citadel to write to the system log it is necessary to set up Native Messaging. This involves placing a JSON manifest file that gives the path to the program that will be started by Chrome, and then receive the events and log them to the Windows Event log. The Citadel service receives those events and writes them to a syslog-formatted log file.

You can use your MDM to distribute [the installer](https://github.com/avanwouwe/citadel-browser-agent/releases/latest).

Alternatively: 
1. copy the contents of [/bin/win](/bin/win) to `C:\Program Files\Citadel\`
2. set the following keys to `C:\Program Files\Citadel\citadel.browser.agent.json`:
   * `HKLM\SOFTWARE\Google\Chrome\NativeMessagingHosts\citadel.browser.agent`
   * `HKLM\SOFTWARE\Mozilla\NativeMessagingHosts\citadel.browser-firefox.agent`
   * `HKLM\SOFTWARE\Opera Software\NativeMessagingHosts\citadel.browser.agent`
   * `HKLM\SOFTWARE\Microsoft\Edge\NativeMessagingHosts\citadel.browser.agent`
3. run `CitadelSvc.exe install` to install the service.

The commands accepted by the service are:
* `CitadelSvc.exe install`
* `CitadelSvc.exe uninstall`
* `CitadelSvc.exe start`
* `CitadelSvc.exe stop` (optionally with `--force`)

You can verify that events are being created by checking `C:\Program Files\Citadel\logs\CitadelSvc.out.log`.

## configuration
Citadel has sensible defaults, but you can change the configuration of Citadel, for example to change the logging and masking levels or to declare your own blacklist or local IT support e-mail address. Just place a file called `citadel-browser-agent.json` with the [correct format](/doc/configuration.md) in the Citadel directory. See the [configuration reference](/doc/configuration.md) for more information.
