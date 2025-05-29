# Limitations
Whilst these limitations are not necessarily deal-breakers, it's good to be aware of them.

Citadel **does not**:
* protect against detection countermeasures by sophisticated and / or malicious users
* detect threats using heuristic analysis of behavior or page content
* perform virus scans on files
* filter *all* outgoing connections (it scans HTTP, HTTPS, and therefore WS and WSS, but not for example QUIC)
* filter IPV6 traffic (contact me if you find a reliable IPv6 blacklist)
* detect perfectly if sites are "authenticated" (it uses heuristics based on header names, cookie names and URLs)
* analyze all use of passwords (only forms with "password" fields, and not Basic Auth passwords or use of navigator.credentials API)
* know at all times which account is being used (just the last one that it detected)
* guarantee that reports are generated as planned (ex. if machines are turned off, they only report when turned on again)
* generate one report per user (since users may have multiple machines, or even just multiple browsers or profiles within a browser)
* manage the duration of "session" cookies (if Citadel would set their expiration date that would store them, which is also problematic)
* detect what is going on in private sessions (users have to manually select "Allow Incognito" in the [extension management page](chrome://extensions/?id=anheildjmkfdkdpgbndmpjnmkfliefga))
* automatically install in Opera

Be aware that some browsers (Firefox) have a "safe mode" or "troubleshoot mode" that allows users to disable all extensions, even if they were "force installed".