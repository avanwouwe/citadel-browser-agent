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

The package works for browsers installed from your distribution (APT/RPM), as a Flatpak or as a Snap, with the exceptions listed [below](#limitations). Browsers installed as a Flatpak or a Snap run in a sandbox, so for them the package also sets up [a small per-user job](#flatpak-and-snap-browsers) that installs into the per-user sandbox.

## supported browsers

Each cell shows the result for **forced installation of the extension / native messaging**.

| Browser  | APT / RPM  | Flatpak | Snap |
|----------|------------|---------|------|
| Chrome   | ✓ / ✓      | ✓ / ✓   | inexistant |
| Chromium | inexistant | ✓ / ✓ | ✓ / ✓ |
| Firefox  | ✓ / ✓      | ✓ / ✓   | ✓ / ✓ |
| Edge     | ✓ / ✓      | ✓ / ✓   | inexistant |
| Brave    | ✓ / ✓      | ✓ / ✓   | ✗ / ✓ (2) |
| Opera    | ✓ / ✓      | ✓ / ✓   | ✗ / ✓ |
{: .table }

1. Chromium is not available as an APT package on Ubuntu (only as a Snap); it uses the same system-wide files as the other Chromium-family browsers.
2. <!-- TODO: verify after the agent has been rebuilt on Ubuntu 22.04 (glibc 2.35) -->Native messaging in the Brave Snap requires an agent built against glibc 2.35 or older, see [building the package](#building-the-package-yourself).

The results were obtained on Ubuntu 24.04. The `.rpm` package is built from the same files but has had less testing.

## flatpak and snap browsers

A Flatpak or Snap browser cannot see the system-wide `/etc` and `/usr/lib` locations that the package writes to, so it needs extra work, done in two ways:

**Per-user setup.** The script `/opt/citadel-agent/citadel-browser-setup` runs as the logged-in user, from a systemd user timer that the package enables for all users. It runs shortly after login and then daily, and does nothing for browsers that are not installed. You can also run it by hand. It does the following:

* *Flatpak:* it writes a native-messaging manifest into the browser's own `~/.var/app/<app-id>/` directory, together with a small wrapper that starts the agent on the host through `flatpak-spawn --host`. For this to work the browser must be allowed to talk to `org.freedesktop.Flatpak`, so the script grants that permission with `flatpak override --user` for each installed Flatpak browser. Be aware that this allows the browser to start programs on the host. For Opera the script also grants read access to the host's `/etc` (`--filesystem=host-etc:ro`), which is where Opera reads its policy from; Chrome, Brave and Edge ship with that permission.
* *Snap:* a confined browser can only start programs inside its own snap directory, so the script copies the agent to `~/snap/<name>/common/citadel-agent.<id>/` and points the manifest at that copy. The copy is only made again when the installed agent changes, and old copies are deleted once no process uses them (this requires `lsof`; without it old copies are kept).

**System-wide policy.** The package also installs the forced-installation policy where these browsers look for it, as root. A system timer repeats this every 10 minutes, so a browser installed after the package is also covered, usually within minutes:

* *Snap Chromium:* `/var/snap/chromium/current/policies/managed/citadel-policy.json`
* *Flatpak Chromium:* a Flatpak policy extension in `/var/lib/flatpak/extension/org.chromium.Chromium.Policy.citadel/`
* *Flatpak Firefox:* `policies.json` in the Flatpak `systemconfig` extension in `/var/lib/flatpak/extension/org.mozilla.firefox.systemconfig/`. As for Firefox on APT (see below) an existing file that does not belong to Citadel is left alone.
* *Snap Firefox* uses the same `/etc/firefox/policies/policies.json` as Firefox on APT.

Browsers need to be restarted before they pick up a new policy or manifest.

## limitations

* **Brave and Opera as a Snap cannot be force-installed.** Their snaps do not allow access to the host's policy directory (they have no `system-files` plug, and the host's `/etc` is blocked by the snap's confinement), so there is nowhere for Citadel to put the policy. Native messaging does work. Install the extension manually, or use the APT or Flatpak version of the browser.
* **Chromium policy fragments do not merge.** Within one `managed/` directory Chromium does not combine a list policy such as `ExtensionInstallForcelist` from several files; the file that sorts last wins. If you already manage that policy in another fragment in the same directory, add Citadel's extension to your own list instead.
* **Firefox supports one `policies.json`.** See [Firefox policy](#firefox-policy).
* **Browsers other than those listed** (for example Arc and Comet, or beta and nightly builds with a different package name) are not covered.

## package contents

* the agent binary and [controls](https://github.com/avanwouwe/citadel-browser-agent/blob/main/bin/controls) in `/opt/citadel-agent/`
* the per-user setup script `/opt/citadel-agent/citadel-browser-setup` and its manifest templates in `/opt/citadel-agent/manifests/`
* a systemd user timer and service (`citadel-browser-setup.*` in `/usr/lib/systemd/user/`), enabled for all users
* a root helper `/opt/citadel-agent/citadel-system-policy` with a systemd timer and service (`citadel-system-policy.*` in `/usr/lib/systemd/system/`), see [above](#flatpak-and-snap-browsers)
* Native Messaging manifests for Chromium-family browsers (Chrome, Chromium, Edge, Brave, Opera) in:
  * `/etc/opt/chrome/native-messaging-hosts/citadel.browser.agent.json`
  * `/etc/chromium/native-messaging-hosts/citadel.browser.agent.json`
  * `/etc/opt/edge/native-messaging-hosts/citadel.browser.agent.json`
  * `/etc/brave/native-messaging-hosts/citadel.browser.agent.json`
  * `/etc/opt/opera/native-messaging-hosts/citadel.browser.agent.json`
* a Firefox-specific Native Messaging manifest, in the location of your distribution family: `/usr/lib/mozilla/native-messaging-hosts/citadel.browser.agent.json` in the `.deb`, and `/usr/lib64/mozilla/native-messaging-hosts/citadel.browser.agent.json` in the `.rpm`
* Chromium-family managed policies (force-installing the Citadel extension) as a uniquely named fragment in:
  * `/etc/opt/chrome/policies/managed/citadel-policy.json`
  * `/etc/chromium/policies/managed/citadel-policy.json`
  * `/etc/opt/edge/policies/managed/citadel-policy.json`
  * `/etc/brave/policies/managed/citadel-policy.json`
  * `/etc/opt/opera/policies/managed/citadel-policy.json`
* the policy templates in `/usr/share/citadel-browser-agent/`

The `.deb` does not treat these `/etc` files as configuration files, so a plain `apt remove` also removes the forced-installation policy. In the `.rpm` they are configuration files: an unmodified file is removed with the package, a modified one is kept as `.rpmsave`.

### Firefox policy

Unlike Chromium, Firefox only supports a single system-wide `/etc/firefox/policies/policies.json` file and does not support policy fragments. Since this file may already belong to an administrator or another product, the package does not install it directly. Instead:
* the package ships Citadel's complete policy template at `/usr/share/citadel-browser-agent/firefox-policy.json`
* on install, the `postinstall.sh` script only writes it to `/etc/firefox/policies/policies.json` if that file does not already exist
* if the active policy was created by Citadel and has not since been modified, upgrades keep it in sync with the packaged template; if it was modified, or belongs to someone else, it is left untouched and must be merged manually
* on removal, the file is only deleted if it still matches what Citadel installed

If you already manage Firefox policies yourself, merge the contents of `firefox-policy.json` into your own `policies.json`. The same approach is used for the Flatpak Firefox policy.

## uninstalling

Removing the package removes the system-wide manifests and policies, the systemd timers and the agent. Because the extension is no longer force-installed, browsers uninstall it at their next policy refresh.

What remains, per user, is harmless: the Flatpak manifests and wrappers in `~/.var/app/<app-id>/`, the Snap manifests and agent copies in `~/snap/<name>/`, the `flatpak override` permissions, and the lock file in `~/.local/state/citadel-browser-setup/`. Delete them if you want a clean system.

## Building the package yourself

The packages are built with [fpm](https://github.com/jordansissel/fpm) from a staged tree. See [bin/build/linux/build.sh](https://github.com/avanwouwe/citadel-browser-agent/blob/main/bin/build/linux/build.sh) to build the `x86_64` binary with PyInstaller, and [bin/build/linux/package.sh](https://github.com/avanwouwe/citadel-browser-agent/blob/main/bin/build/linux/package.sh) to stage and produce the `.deb`/`.rpm` packages.

### the build OS

PyInstaller does not include glibc, so the agent runs on any system with a glibc **at least as new as the one it was built on**. Build on the oldest system you want to support. Confined Snap browsers run the agent against their own runtime, not the host's: for example Brave still uses Ubuntu 22.04 (glibc 2.35), so an agent built on Ubuntu 24.04 (glibc 2.39) fails there with `version 'GLIBC_2.38' not found`.

For that reason `build.sh` builds inside a container of a chosen OS (Docker or Podman is required), by default `ubuntu:22.04`, and fails if the result needs a glibc newer than the one you declare as the oldest supported:

```
./build.sh                          # ubuntu:22.04 container, MAX_GLIBC=2.35
BUILD_IMAGE=ubuntu:24.04 MAX_GLIBC=2.39 ./build.sh
PYTHON_VERSION=3.12 ./build.sh      # Python independent of the build OS
./build.sh --local                  # build on the OS of this machine
```

The OS and Python version are independent: Ubuntu 22.04 ships Python 3.10, which is end-of-life in October 2026, but `PYTHON_VERSION` lets you build with a newer Python on the same old glibc (using [uv](https://docs.astral.sh/uv/) to fetch it). Review the choice of build OS whenever a supported distribution or a Snap runtime moves on.

### packaging

To build packages yourself:

```
sudo apt-get install -y ruby rpm
sudo gem install --no-document fpm
```

`package.sh` picks up any architecture present under `binaries/` (currently `x86_64`, produced by `build.sh`) and emits both a `.deb` and an `.rpm` for each, since `fpm` can generate RPMs on a Debian/Ubuntu build host once the `rpm` package is installed. Run it as a normal user: the files in the packages are owned by `root` regardless.

You can verify that events are being created by checking your system log (e.g. `journalctl` or `/var/log/syslog`, depending on your distribution's logging setup) for `citadel-browser-agent` entries.

## configuration
Citadel has sensible defaults, but you can change the configuration of Citadel. You can for example change the logging and masking levels or declare your own blacklist, the domains you consider part of your IS, or local IT support e-mail address. Just place a file called `citadel-config.json` with the correct format in the `/opt/citadel-agent/` directory. See the [configuration manual](/config/) for more information.
