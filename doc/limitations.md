# Limitations
Whilst these limitations are not necessarily deal-breakers, it's good to be aware of them.

Citadel **does not**:
* protect against sophisticated malicious users
* detect threats using heuristic analysis of behavior or page content
* perform virus scans on files
* filter *all* outgoing connections (HTTP and HTTPS, but not Web Sockets or QUIC)
* filter IPV6 traffic (I haven't been able to find a reliable IPv6 blacklist, contact me if you know of one)
* inspect Basic Auth passwords
* detect perfectly if sites are authenticated (it uses heuristics based on headers and URLs)
* detect all logins (it uses heuristics, such as OAuth pages and forms with "password" fields)
* know at all times which account is being used (just the last one that it detected)
* guarantee that reports are generated as planned (ex. if machines are turned off, they only report when turned on again)
* generate one report per user (since users may have multiple machines, or even just multiple profiles)