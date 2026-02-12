---
layout: default
title: Account Trust
parent: Configuration
nav_order: 4
---

# Account Trust
You can use Citadel to enforce your IAM policies, such as:
* your password complexity rules
* the use of Multi-Factor Authentication
* the re-use of passwords

Of course, these policies will only be enforced on endpoints that are running Citadel.

## passwords complexity
You can configure your own password policy:

```
    ...
    "account": {
        "checkOnlyInternal": true,
        "checkOnlyProtected": true,
        "actions": {
            "NOTIFY": 2,
            "WARN": 4,
            "BLOCK": 6
        },
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

## Multi-Factor Authentication
You can ensure that whenever users send a password, they *also* use another factor (e.g. TOTP, WebAuthn). If they do not provide one within `waitMinutes` they are logged off. Once connected their session will remain valid for `maxSessionDays`.

Not all applications have MFA, so you have to enumerate the list of domains where you require MFA. You can make exceptions for specific subdomains:
```
    "account": {
        "mfa": {
          "waitMinutes": 10,
          "maxSessionDays": 14,
          "required": [
            "yourcompany.com",
            "1password.com",
            "atlassian.com",
            "idmsa.apple.com",
            "notion.so",
            "openai.com",
            "gitlab.com",
            "github.com"
          ],
          "exceptions": [
            "non-mfa-application.yourcompany.com"
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

## enforcement
Citadel ensures enforcement of your policy by blocking access to the protected scope in case of non-compliance with the policy. In order to give users due warning, an escalation path is followed, depending on the type of action defined for the issue at hand.
* `NOTIFY` : users are notified once a week that they are in non-compliance
* `WARN` : users are warned before their access to the protected scope is removed
* `BLOCK` : users are immediately blocked (i.e. only used for situations that represent a clear and present danger)

These notifications and Warnings are given to the user via modal windows that are injected in the pages, and OS-level notifications. When the user clicks on the notification, the user is shown the [dashboard](/dashboard) to show them the accounts that are non-compliant. 

If the defined action is `WARN`, the following escalation schema is used:
* 0 > 2 days : user is notified
* 2 > 7 days : user is warned that access will soon be blocked
* 7+ : user is blocked

When determining the number of days elapsed since the non-compliance started, Citadel only counts the number of days that the endpoint was operating. This ensures that users that have been away for several days don't suddenly return to find their access blocked without any advance warning.

Once the access has been blocked, users can still request a temporary exception. 

```
    ...
    "account": {
        "trigger": {
            "warn": 2,
            "block": 7
        },
        "exceptions": {
            "duration": 60,
            "domains": [ ]
        }
    }
    ....
```