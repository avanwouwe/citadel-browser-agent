# Configuration
Citadel comes with a [sensible default configuration](/config.js). You can override these configurations by creating a file `citadel-browser-agent.json` in the directory where the `citadel-browser-agent` file is placed. For example, to specify the e-mail address of your own IT department:

```
{
    "contact": "it-support@yourdomain.com",
}
```

## blacklists
The configuration you provide will be override with the attributes of the existing configuration. Since the blacklist configurations are arrays, you must re-state the blacklist configuration if you want to add your own blacklists to it.

The URL blacklists are expected to contain one URL per line. The blacklists configured by default are:
* [URLhaus](https://urlhaus.abuse.ch/)
* [Romain Marcoux - malicious domains](https://github.com/romainmarcoux/malicious-domains)


The IP blacklist is expected to contain one IPv4 address or one CIDR formatted subnet per line. The blacklists configured by default are:
* [FireHOL (level 1)](https://iplists.firehol.org/?ipset=firehol_level1)
* [Romain Marcoux - malicious outgoing IP](https://github.com/romainmarcoux/malicious-outgoing-ip)

In both cases lines starting with `#` are interpreted as comments.

## logging
The default logging settings are:
```
logging: {
    failurePopup: true,
    logLevel: 'DEBUG',
    consoleLevel: 'WARN',
    maskUrlLevel: 'INFO',
    maxUrlLength: 500
}
```
* `failurePopup` : should end-users be notified if logging is broken? (so they can warn you)
* `logLevel` : from which level onward should events be entered in the system log
* `consoleLevel` : from which level onward should events be entered in the browser console log of the extension
* `maskUrlLevel` : up to which level onward should events be masked (i.e. this level is *not* masked)
* `maxUrlLength` : truncate URLs to which length (to prevent filling the logs too quickly)

When specifying the logging level you can use the following log levels:
* `TRACE` : low level events that are not necessarily user actions, for example `webRequest`. Not enabled by default.
* `DEBUG` : standard user actions, for example `webNavigation`
* `INFO` : standard user actions with potential security implications, such as `onDownload`. Also used for the shadow IT reporting
* `WARN` : risky user actions with potential security implications, such as unencrypted or non-standard protocols
* `ERROR` : risky user actions that require investigation, such as visiting a blacklisted URL or ignoring a download warning

The special log level `NONE` is even higher than `ERROR` and is used for example to never log something or to mask all events.