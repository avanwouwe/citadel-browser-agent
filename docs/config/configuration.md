---
layout: default
title: General Configuration
parent: Configuration
nav_order: 1
---

# General configuration
Citadel checks for changes in the configuration every hour, and will automatically detect if you have modified the configuration file.

For security reasons, Citadel wll refuse to load configuration that is not owned by `root/wheel` (macOS) or `Administrator` / `SYSTEM` (Windows), or that is world-writable.

## overriding attributes
When overriding default settings the following rules are used:
* any new attribute : attribute is added
* existing value attribute : value is replaced
* existing array attribute : array is replaced
* existing object attribute : merged hierarchically, using the above rules

## specifying domains
The following attributes specify domains:
* `domain.unhash`
* `company.domains`
* `company.applications`
* `session.domains`
* `session.exceptions`
* `domain.isApplication`
* `domain.isPublicMail`
* `device.exceptions.domains`
* `account.exceptions.domains`
* `account.mfa.required`
* `account.mfa.exceptions`

These configurations take a list of domains, where specifying `domain.com` matches:
* domain.com
* host.domain.com
* host.subdomain.com

It is also possible to specify netmasks, for example:
* `192.168.x.x`
* `10.x.x.x`
Note that netmasks can only be classful CIDR masks of type A,B or C. So `134.x.50.x` is not allowed.

## exceptions
You can override the global configuration for specific domains or netmasks. This is possible for the following configuration elements:
* `warningProtocols` : ex. allow HTTP on the VPN subnet
* `account` : ex. specific password policies for one application
* `application` : ex. specific retention period
* `logging` : ex. turn off logging for the development instances
* `errors` : ex. do not log certificate issues for your development web servers

For example, to ignore warnings about HTTP traffic over your VPN, you can override the `warningProtocols` setting:
```
    ...
    "exceptions": [
        {
          "description" : "unencrypted traffic is allowed over VPN",
          "domains": ["yourcompany.lan", "yourcompany.local"],
          "config": {
            "warningProtocols": ["ftp:", "ws:"]
          }
        }
    ]
    ...
```

Or you can enable password policy enforcement, irrespective of the username used, but only for connections within your domain:
```
    ...
    "exceptions": [
        {
          "description" : "apply password policy to external logins for all company applications",
          "domains": ["yourcompany.com"],
          "config": {
            "account": {
              "checkOnlyInternal": false
            }
          }
        }
    ]
    ...
```

Any exceptions you defined are applied "on top of" the [default configuration](/config.js), in the order that they are defined. 

For example, if you define a `logging.logLevel` in two exceptions :
* default : `logging.logLevel` = `DEBUG`
* exception 1 :`["domain-a.com", "domain-b.com"]` = `WARN`
* exception 2 : `["domain-a.com"]` = `ERROR`

Then resulting `logging.logLevel` will depend on the domain involved:
* www.randomdomain.com : `DEBUG` (default) 
* www.domain-a.com : `ERROR` (exception 2)
* www.domain-b.com : `WARN` (exception 1)
