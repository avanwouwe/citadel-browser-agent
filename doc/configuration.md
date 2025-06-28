# Configuration
Citadel comes with a [sensible default configuration](/config.js). You can override these configurations by creating a file `citadel-config.json` in the directory where the `citadel-browser-agent` file is placed. For example, you can specify the e-mail address of your own IT department so that warnings show your contact details. Or you can define what are your domains, which is used when determining if certain policies, such as password policy, should apply (external domains are excluded by default).

Example:

```
    ...
    "company": {
        "contact": "it-support@yourcompany.com",
        "name": "Company",
        "logo": "https://www.yourcompany.com/assets/images/company-logo.png",
        "domains": [
          "yourcompany.com",
          "yourcompany.io",
          "yourcompany.net"
        ]
    }
    ...
```

## exceptions
You can override the global configuration for specific domains. This is possible for the following configuration elements:
* `warningProtocols` : ex. allow HTTP for VPN traffic
* `account` : ex. specific password policies for one application
* `session` : ex. restrict session duration only for internal applications
* `application` : ex. specific retention period
* `logging` : ex. turn off logging for the development instances
* `errors` : ex. do not log certificate issues for your development web servers

For example, to ignore warnings about HTTP traffic over your VPN, you can override the `warningProtocols` setting:

```
    ...
    "exceptions": {
        "VPN" : {
          "domains": ["yourcompany.lan", "yourcompany.local"],
          "config": {
            "warningProtocols": ["ftp:", "ws:"]
          }
        }
    }
    ...
```

## blacklists
The configuration you provide will be overridden with the attributes of the existing configuration. Since the blacklist configurations are arrays, you must re-state the blacklist configuration if you want to add your own blacklists to it.

The URL blacklists are expected to contain one domain or URL per line. The blacklists configured by default are:
* [URLhaus](https://urlhaus.abuse.ch/)
* [Romain Marcoux - malicious domains](https://github.com/romainmarcoux/malicious-domains)
* [Pi-hole Torrent Blacklist](https://github.com/sakib-m/Pi-hole-Torrent-Blocklist)

Blacklists containing domains block all URLs in that domain. Blacklists containing URLs block only that URL, whilst ignoring the query parameters and URI fragment (i.e. the "hash part"). In both cases the matching is done in a case insensitive manner.

The IP blacklist is expected to contain one IPv4 address or one CIDR formatted subnet per line. The blacklists configured by default are:
* [FireHOL (level 1)](https://iplists.firehol.org/?ipset=firehol_level1)
* [Romain Marcoux - malicious outgoing IP](https://github.com/romainmarcoux/malicious-outgoing-ip)

Both blacklists can contain lines starting with `#`, which are interpreted as comments.

## blacklist exceptions
By default, users can request an exception if they are blocked by a blacklist. They are then asked to provide a reason for the exception, after which they can bypass the blacklist for that hostname temporarily. The duration is stated in minutes, and setting it to `0` disables the possibility to ask for exceptions.

```
    ...
    'blacklist": {
        "exceptions": {
            "duration": 0
        },
    }        
    ...
```

## whitelists
In some cases your blacklist may accidentally include IPs or URLs that are false positives. In this case you can define a whitelist to bypass the blacklist. Since the whitelist configurations are arrays, you must re-state the blacklist configuration if you want to add your own blacklists to it.

This is for example the default configuration:
```
    ...
    whitelist: {
        ip: [
            "10.0.0.0/8",
            "127.0.0.0/8",
            "169.254.0.0/16",
            "172.16.0.0/12",
            "192.168.0.0/16"
        ],
        url: [ ],
    }
    ...
```

## passwords
You can configure your own password policy: 

```
    ...
    "account": {
        "checkExternal": false,
        "passwordPolicy": {
            "minLength": 15,
            "minNumberOfDigits": 1,
            "minNumberOfLetters": 0,
            "minNumberOfUpperCase": 1,
            "minNumberOfLowerCase": 1,
            "minNumberOfSymbols": 1,
            "minEntropy": 2.5,
            "minSequence": 4
        }
    }
    ...
```

Note that:
* the `minEntropy` setting refers to the [Shannon Entropy](https://en.wikipedia.org/wiki/Entropy_(information_theory))
* the `minSequence` setting measures the number of consecutive characters or numbers in the password, relative to the password length

## Multi Factor Authentication
You can ensure that whenever users send a password, they *also* use another factor (e.g. TOTP, WebAuthn). If they do not provide one within `waitMinutes` they are logged off. Once connected their session will remain valid for `maxSessionDays`.

You have to enumerate the list of domains where you require MFA, and you can make exceptions for specific sub-domains:
```
    "account": {
        "mfa": {
          "waitMinutes": 10,
          "maxSessionDays": 14,
          "required": [
            "yourcompany.com",
            "1password.com",
            "atlassian.com",
            "business.apple.com",
            "notion.so",
            "openai.com",
            "gitlab.com",
            "github.com"
          ],
          "exceptions": [
            "non-mfa.yourcompany.com"
          ]
        }
    }
```

## session duration
Citadel can be configured to limit authenticated session duration by forcing cookies to expire. This reduces the risk of cookies being stolen, should the endpoint ever be compromised. Since it forces users to reconnect, it also ensures that Citadel has recent data bout password quality and account usage.

The default settings is `14` days. You can list the domains to apply the rule to, and specify exceptions to that list. By default, no domains are specified and the feature is disabled.

```
    ...
    "session": {
        "maxSessionDays": 14,
        "domains": ["*"],
        "exceptions": ["google.com","okta.com"]
    }
    ...
```

## reporting
Citadel can report on various aspects, such as application use and password policy adherence. By default, the reporting is configured to report only on authenticated applications. To prevent overloading the SIEM, the reporting only reports on the most important applications (i.e. the most visited or the ones with the most password issues).

```
    ...
    "reporting": {
        "maxApplicationEntries": 500,
        "maxAccountEntries": 500,
        "onlyAuthenticated": true
    }
    ...
```

The bi-weekly frequency of some reports has been chosen so that in your SIEM you can select "last two weeks" and you will have exactly one event for every endpoint. Two weeks is long enough to (almost) still cover endpoints that are turned off during holidays, but short enough for the information to remain relevant.

## errors
Citadel reports when certain security-sensitive errors are raised by the browser (see [chrome://network-errors](chrome://network-errors) for a list of all browser errors). This can be for example a user ignoring a virus warning, or issues with certificates. You can override the default event level of each error type, should the default levels not work out for your specific environment.

For example, you can lower the level of certificate issues to `DEBUG`, so that they are still logged locally but not shipped to the SIEM. Or you can manually configure an extreme logging level for an error that is not detected by default, such as `ERR_ACCESS_DENIED`:

```
    ...
    "errors": {
        "exceptions": {
            "net::ERR_CERT_AUTHORITY_INVALID"   : "DEBUG",
            "net::ERR_CERT_COMMON_NAME_INVALID" : "DEBUG",
            "net::ERR_CERT_DATE_INVALID"        : "DEBUG",
            "net::ERR_ACCESS_DENIED"            : "ERROR"
        }
    }
    ...
```

## logging
The default logging settings are:

```
    ...
    "logging": {
        "failurePopup"  : true,
        "logLevel"      : "DEBUG",
        "consoleLevel"  : "WARN",
        "maskUrlLevel"  : "INFO",
        "maxUrlLength"  : 500
    }
    ...
```
* `failurePopup` : should end-users be notified if logging is broken? (so they can warn you)
* `logLevel` : from which level onward should events be entered in the system log
* `consoleLevel` : from which level onward should events be entered in the browser console log of the extension
* `maskUrlLevel` : up to which level onward should events be masked (i.e. this level is *not* masked)
* `maxUrlLength` : truncate URLs to which length (to prevent filling the logs too quickly)

When specifying the logging level you can use the following log levels:
* `TRACE` : low level events that are not necessarily user actions, for example `webRequest`. Not enabled by default
* `DEBUG` : standard user actions, for example `webNavigation`. Events could be useful for DFIR, but are too frequent for a SIEM
* `INFO` : standard user actions with potential security implications, such as `onDownload`. Also used for reporting events.
* `WARN` : potentially risky user actions with, such as unencrypted requests or invalid certificates. Perform a periodic statistical review.
* `ERROR` : risky user actions that require immediate investigation, such as visiting a blacklisted URL or ignoring a virus warning

The special log level `NEVER` is used to never log something.

## log rate throttling
Citadel performs rate throttling on logging to ensure that one issue does not overwhelm the storage of the local machine or your SIEM. Throttling is triggered if more than the specified number of events arrive within a `windowDuration` minutes, and on a per-level basis. Throttling stopped if no more events arrive during the window.

If throttling is triggered, warnings are issued at the level just above the original level. One warning is raised at the start of throttling, and periodic warnings are raised every `reportFrequency` to report on the number of lost events.

```
    ...
    "logging": {
        "throttle": {
            "windowDuration": 10,
            "reportFrequency": 60,
            "rates": {
                "TRACE": 1000,
                "DEBUG": 100,
                "INFO": 50,
                "WARN": 50,
                "ERROR": 10,
                "ALERT": 10
            }
        }
   }
   ...
```