---
layout: default
title: General Configuration
parent: Configuration
nav_order: 1
---

# General configuration
Citadel can be configured by placing a file called `citadel-config.json` containing a JSON object, in the directory where the `citadel-browser-agent` binary lives. The system checks for changes in the configuration every hour, and will automatically detect if you have modified the configuration file, and reload it.

For security reasons, Citadel wll refuse to load configuration that is not owned by `root/wheel` (macOS) or `Administrator` / `SYSTEM` (Windows), or that is world-writable.

## overriding attributes
When overriding default settings in the JSON configuration file, the following rules are used:
* any new attribute : attribute is added
* existing value attribute : value is replaced
* existing array attribute : array is replaced
* existing object attribute : merged hierarchically, using the above rules

> **Note**
> This means that:
> * adding an attribute means just stating it
> * adding a value to a list / array means restating the entire list
{: .note }

## specifying domains
The following attributes specify *lists of domains*:
* `domain.unmask`
* `company.domains`
* `company.applications`
* `session.domains`
* `domain.sensitive`
* `domain.publicMail`
* `device.exceptions.domains`
* `account.exceptions.domains`
* `account.mfa.required`

Specifying `*.domain.com` matches the domain *and* all of its subdomains:
* `domain.com`
* `host.domain.com`
* `host.subdomain.com`

Specifying `domain.com`, *without* the `*.` prefix, matches only that exact host, and none of its subdomains. For example:
* `domain.com`

Specifying `-host.domain.com` or `-*.subdomain.domain.com`, excludes that host or domain. This is useful for example to exclude hosts from a domain. So `*.google.com` + `-www.google.com` means:
* `drive.google.com`
* `sheets.google.com`
* `mail.google.com`
.. but not `www.google.com`


This lets you target a single host such as `chat.openai.com` without also matching everything else under `openai.com`.

It is also possible to specify netmasks, for example:
* `192.168.x.x`
* `10.x.x.x`

Netmasks can only be classful CIDR masks of type A,B or C. So `134.x.50.x` is not allowed.

You can use `*` on its own to specify "any domain". The `*.` wildcard is only allowed as a prefix for an entire domain, so patterns like `app-*.domain.com` are not supported.

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

Or you can disable password policy enforcement of external domains for specific domains. A typical example would be domains that are part of your protected scope but that are shared, such as `accounts.google.com` or `login.microsoftonline.com`:
```
    ...
    "exceptions": [
        {
          "description" : "do not apply password policy to external domains",
          "domains": ["accounts.google.com"],
          "config": {
            "account": {
              "checkOnlyInternal": true
            }
          }
        }
    ]
    ...
```

Any exceptions you defined are applied "on top of" the [default configuration](/https://github.com/avanwouwe/citadel-browser-agent/blob/main/config.js), in the order that they are defined. 

For example, if you define a `logging.logLevel` in two exceptions :
* default : `logging.logLevel` = `DEBUG`
* exception 1 :`["*.domain-a.com", "*.domain-b.com"]` = `WARN`
* exception 2 : `["*.domain-a.com"]` = `ERROR`

Then resulting `logging.logLevel` will depend on the domain involved:
* www.randomdomain.com : `DEBUG` (default) 
* www.domain-a.com : `ERROR` (exception 2)
* www.domain-b.com : `WARN` (exception 1)
