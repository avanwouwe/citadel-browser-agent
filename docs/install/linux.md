---
layout: default
title: Linux
parent: Installation
nav_order: 3
---

# Linux installation

Browser extensions are sandboxed and cannot access the local operating system. To allow the Citadel extension to check the device status and write to syslog it is necessary to set up Native Messaging. This involves placing a JSON manifest file in a specific place that gives the path to the program that will be started by the browser, which then receives the events and logs them to syslog.

Citadel ships as a `.deb` and a `.rpm` package for `x86_64`. Download [the package for your distribution](https://github.com/avanwouwe/citadel-browser-agent/releases/latest) matching your package family, and install it with your package manager, for example:

```
sudo dpkg -i citadel-browser-agent-1.5.0-amd64.deb
# or
sudo rpm -i citadel-browser-agent-1.5.0-x86_64.rpm
```

You can distribute the package via your configuration management tool (Ansible, Puppet, Chef, etc.) or your Linux MDM.

On top of the Citadel package, you need to [install osquery](https://osquery.io/downloads) on the endpoint, so that the agent can query the device state.

## package contents

* the agent binary and [controls](https://github.com/avanwouwe/citadel-browser-agent/blob/main/bin/controls) in `/opt/citadel-agent/`
* Native Messaging manifests for Chromium-family browsers (Chrome, Chromium, Edge, Brave, Opera) in:
  * `/etc/opt/chrome/native-messaging-hosts/citadel.browser.agent.json`
  * `/etc/chromium/native-messaging-hosts/citadel.browser.agent.json`
  * `/etc/opt/edge/native-messaging-hosts/citadel.browser.agent.json`
  * `/etc/brave/native-messaging-hosts/citadel.browser.agent.json`
  * `/etc/opt/opera/native-messaging-hosts/citadel.browser.agent.json`
* a Firefox-specific Native Messaging manifest, in both the Debian/Ubuntu and RPM library locations (only the one that applies to your distribution will be used):
  * `/usr/lib/mozilla/native-messaging-hosts/citadel.browser.agent.json`
  * `/usr/lib64/mozilla/native-messaging-hosts/citadel.browser.agent.json`
* Chromium-family managed policies (force-installing the Citadel extension) as a uniquely named fragment in:
  * `/etc/opt/chrome/policies/managed/citadel-policy.json`
  * `/etc/chromium/policies/managed/citadel-policy.json`
  * `/etc/opt/edge/policies/managed/citadel-policy.json`
  * `/etc/brave/policies/managed/citadel-policy.json`
  * `/etc/opt/opera/policies/managed/citadel-policy.json`

### Firefox policy

Unlike Chromium, Firefox only supports a single system-wide `/etc/firefox/policies/policies.json` file and does not support policy fragments. Since this file may already belong to an administrator or another product, the package does not install it directly. Instead:
* the package ships Citadel's complete policy template at `/usr/share/citadel-browser-agent/firefox-policy.json`
* on install, the `postinstall.sh` script only writes it to `/etc/firefox/policies/policies.json` if that file does not already exist
* if the active policy was created by Citadel and has not since been modified, upgrades keep it in sync with the packaged template; if it was modified, or belongs to someone else, it is left untouched and must be merged manually
* on removal, the file is only deleted if it still matches what Citadel installed

If you already manage Firefox policies yourself, merge the contents of `firefox-policy.json` into your own `policies.json`.

## Building the package yourself

The packages are built with [fpm](https://github.com/jordansissel/fpm) from a staged tree. See [bin/build/linux/build.sh](https://github.com/avanwouwe/citadel-browser-agent/blob/main/bin/build/linux/build.sh) to build the `x86_64` binary with PyInstaller, and [bin/build/linux/package.sh](https://github.com/avanwouwe/citadel-browser-agent/blob/main/bin/build/linux/package.sh) to stage and produce the `.deb`/`.rpm` packages. To build packages yourself:

```
sudo apt-get install -y ruby ruby-dev rubygems build-essential rpm
sudo gem install --no-document fpm
```

`package.sh` picks up any architecture present under `binaries/` (currently `x86_64`, produced by `build.sh`) and emits both a `.deb` and an `.rpm` for each, since `fpm` can generate RPMs on a Debian/Ubuntu build host once the `rpm` package is installed.

You can verify that events are being created by checking your system log (e.g. `journalctl` or `/var/log/syslog`, depending on your distribution's logging setup) for `citadel-browser-agent` entries.

## configuration
Citadel has sensible defaults, but you can change the configuration of Citadel. You can for example change the logging and masking levels or declare your own blacklist, the domains you consider part of your IS, or local IT support e-mail address. Just place a file called `citadel-config.json` with the correct format in the `/opt/citadel-agent/` directory. See the [configuration manual](/config/) for more information.
