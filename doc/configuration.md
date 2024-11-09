# Configuration
Citadel comes with a [sensible default configuration](/config.js). You can override these configurations by creating a file `citadel-browser-agent.json` in the directory where the `citadel-browser-agent` file is placed. For example, to specify the e-mail address of your own IT department:

```
{
    "contact": "it-support@yourdomain.com",
}
```

## blacklist configuration
The configuration you provide will be override with the attributes of the existing configuration. Since the blacklist configurations are arrays, you must re-state the blacklist configuration if you want to add your own blacklists to it.

The URL blacklists are expected to contain one URL per line. The blacklists configured by default are:
* [URLhaus](https://urlhaus.abuse.ch/)
* [Romain Marcoux - malicious domains](https://github.com/romainmarcoux/malicious-domains)


The IP blacklist is expected to contain one IPv4 address or one CIDR formatted subnet per line. The blacklists configured by default are:
* [FireHOL (level 1)](https://iplists.firehol.org/?ipset=firehol_level1)
* [Romain Marcoux - malicious outgoing IP](https://github.com/romainmarcoux/malicious-outgoing-ip)

In both cases lines starting with `#` are interpreted as comments.

