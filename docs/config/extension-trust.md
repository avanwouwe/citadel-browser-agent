---
layout: default
title: Extension Trust
parent: Configuration
nav_order: 6
---

# Extension Trust
Browser extensions run within the browser and represent a potential information security risk. Depending on their permissions, they can have direct access to the DOM of visited webpages, view or even edit network traffic, and access cookies. This means that they are well-placed to siphon of information, recovery authentication or session secrets, impersonate the user and exfiltrate information. On top of this, they are written in Javascript and are distributed via web stores, so the barrier for writing them is relatively low.

Citadel allows you to check extensions before they are installed or updated, and even scans them periodically. The analysis is based on aspects such as:
* the permissions requested by the extension
* the sites on which the permission can act
* if the extension or it's publisher have been vetted
* how the extension is rated by other users
* the description of the extension (type, keywords)

![Extension Analysis Screenshot](/img/screenshot/screenshot-extension-analysis.png)

The [default configuration of Citadel](https://github.com/avanwouwe/citadel-browser-agent/blob/main/config.js) requires that extensions:
* are vetted themselves, or their editors are vetted (i.e. they have a "badge" in the store)
* have at least 200.000 installations
* have at least 500 ratings, and an average of 4.0 or high
* do not request permissions give access to authentication / session secrets
  * `proxy`
  * `debugger`
  * `clipboardRead`
  * `scripting`
  * `webRequest`
  * `pageCapture`
  * `cookies`
* request only access to specific hosts, and not ones that you protect
* are not side-loaded

However, it allows bypassing of these criteria if the extension has more than 5.000.000 installations. 

Citadel also allows for users to **request exceptions**, which are logged as a time-critical security event (`ERROR`). If the risk profile of the extension changes after the exception was made, for example because an updated version of the extension requests more (dangerous) permissions, or because it's score or number of installations go down, the extension is disabled.

You can adapt this policy based on your needs, risk profile, and analysis of the statistical distribution on the [Chrome store](https://chrome-stats.com/chrome/stats), [Edge store](https://chrome-stats.com/edge/stats) or [Firefox store](https://chrome-stats.com/firefox/stats). Another approach could for example be to disallow all extensions by default and to only whitelist extensions as and when the need arises.
```
    ...
    "extensions" {
        "whitelist": {
            allowAlways: ["id-of-extension-1", "id-of-extension-2"],
        },
        "blacklist": ["*"]
        }
    }
    ...
```

Users can see the status of their extensions on the [Extension Dashboard](/dashboard/extension-dashboard).

## refuse
You can reject extensions based on the following criteria:
* `extensions.allowSideloading` : do not allow if they are side-loaded
* `extensions.verified.required` : do not allow if they or their editor are not verified
* `extensions.installations.required` : do not allow extensions if they have less than N installations
* `extensions.category.forbidden` : do not allow extensions based on their category
* `extennsions.ratings.minRatingLevel` : do not allow extensions if they are rated poorly
* `extennsions.ratings.minRatingCnt` : do not allow extensions if their rating is based on few reviews

You can ofcourse also refuse based on the exceptions requested:
```
    ....
    "extensions" {
        "permissions": {
            "permissions": {
                "forbidden": ["proxy","debugger","clipboardRead"],
                "requireSpecific": ["scripting", "webRequest", "pageCapture", "cookies"],
                "analyzeOptional": true
            },
            "hostPermissions": {
                "requireSpecific": true,
                "allowProtected": false,
                "analyzeOptional": true
            }
        }
    }
    ...
```
* `extensions.permissions.permissions.forbidden` : allow recovery of secrets, apply to all hosts
* `extensions.permissions.permissions.requireSpecific` : allow recovery of secrets, apply only to gosts in `hostPermissions`
* `extensions.permissions.hostPermissions.requireSpecific` : do not allow `<all_urls>`
* `extensions.permissions.hostPermissions.allowProtected` : do not allow access to hosts in the protected scope

Extensions can ask for "optional permissions", which have to be explicitly validated by users at run-time. However, users may not read properly or even realise the impact. Setting `aanalyzeOptional` to true means that they these permissions are analyzed as if they are validated.

Extensions refused based on these criteria can still be installed through an exception.

## allow anytime
The following criteria can be used to ignore the above-mentioned reasons for refusal:
* `extensions.verified.allowed` : always allow extensions if they or their editor are verified
* `extensions.installations.allowed` : allways allow extensions if they have more than N installations
* `extensions.whitelist.allowAlways` : always allow the following extensions, based on their id
Extensions allowed in this manner will always be allowed, irrespective of potential reasons for refusal.

You should use these mechanisms for extensions that you are very confident of, and where the potential risk of disabling the extension would generate severe or widespread issues (e.g. your company-wide password manager)

## allow install
It is possible to allow the installation of an extension, but to continue to monitor their risk profile:
* `extensions.allowExisting` : just allow because they were already existing when Citadel was installed
* `extensions.whitelist.allowInstall` : just allow installation of the following extensions, based on their id
* `extensions.category.wllowed` : just allow installation of following extensions, based on their category
* manually, when te user requests an exception.

Contrary to the "allow anytime" cases, these exceptions will continue to be monitored. If their risk profile degrades, for example because they require supplementary forbidden permissions or because their score or popularity reduces, then they are disabled.