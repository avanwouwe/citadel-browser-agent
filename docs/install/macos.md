---
layout: default
title: macOS
parent: Installation
nav_order: 2
---

# macOS installation

Browser extensions are sandboxed and cannot access the local operating system. To allow the Citadel extension to write to syslog it is necessary to set up Native Messaging. This involves placing a JSON manifest file in a specific place that gives the path to the program that will be started by Chrome, and then receive the events and log them to syslog.

You can use your MDM to distribute [the installer](https://github.com/avanwouwe/citadel-browser-agent/releases/latest), which will take care of all of that.

On top of the Citadel installer, you need to [install osquery](https://osquery.io/downloads) on the endpoint, so that the agent can query the device state.

Alternatively, should you need for some reason to install Citadel manually, place the [JSON manifest](https://github.com/avanwouwe/citadel-browser-agent/blob/main/bin/build/mac/citadel.browser.agent.json) in:
* `/Library/Google/Chrome/NativeMessagingHosts/citadel.browser.agent.json`
* `/Library/Mozilla/NativeMessagingHosts/citadel.browser.agent.json` (use the [Firefox specific manifest](https://github.com/avanwouwe/citadel-browser-agent/blob/main/bin/build/mac/citadel.browser.agent-firefox.json))
* `/Library/Opera/NativeMessagingHosts/citadel.browser.agent.json`
* `/Library/Microsoft\ Edge/NativeMessagingHosts/citadel.browser.agent.json`
* `/Library/BraveSoftware/Brave-Browser/citadel.browser.agent.json`

Copy the contents of [/bin/controls](https://github.com/avanwouwe/citadel-browser-agent/blob/main/bin/controls) to `C:\Program Files\Citadel\controls`. Make sure that they are owned by root and not world writable.

Then download [the installer](https://github.com/avanwouwe/citadel-browser-agent/releases/latest) or build it using the [build script](https://github.com/avanwouwe/citadel-browser-agent/blob/main/bin/build/mac/build.sh) and ensure that it is deployed in `/Library/Scripts/Citadel/citadel-browser-agent`. If you need to rebuild it, you will have to generate a certificate and update the certificate hash in the configuration profile (see below).

You can verify that events are being created by running the following command:
```
log stream --process citadel-browser-agent --predicate 'eventMessage BEGINSWITH "browser agent"' --level debug
```

## configuration
Citadel has sensible defaults, but you can change the configuration of Citadel, for example to change the logging and masking levels or to declare your own blacklist or local IT support e-mail address. Just place a file called `citadel-browser-agent.json` with the correct format in the `/Library/Scripts/Citadel/` directory. See the [configuration manual](/config/) for more information.

## macOS configuration profile

The configuration profile, [citadel-agent.mobileconfig](https://github.com/avanwouwe/citadel-browser-agent/blob/main/bin/build/mac/citadel-agent.mobileconfig), bundles everything Citadel needs on macOS:

* **Full Disk Access** for the agent binary (so Citadel can run [Device Trust queries](/config/device-trust/) that inspect directories considered 'sensitive' by macOS, like `~/Documents` or `~/Downloads`).
* **Force-install of the browser extension** in Chrome, Edge, Brave and Firefox (see the [browser installation page](/install/browser) for the browser-side details).

The TCC portion of the configuration profile is enforced **only** when it is pushed by an MDM. If a user installs the profile manually by double-clicking, macOS accepts it but TCC ignores its contents.

The browser payloads are inert on devices where the corresponding browser is not installed.

### Deploy

Upload the file as a raw configuration profile in your MDM. The upload action is named differently depending on the platform:

* **Jamf Pro** — Computers → Configuration Profiles → **Upload** (next to "New")
* **Kandji** — Library → Add New → Custom Profile → upload the file
* **Mosyle** — Profiles → Custom Profile → Upload
* **Microsoft Intune** — Devices → Configuration → Create → Apple platform → Custom (Apple)
* **JumpCloud** — Policies → New → Mac → Custom Mac Configuration Profile

## Code signing

The agent binary is signed with a self-signed code-signing certificate before it is packaged. The signature ensures a stable identity, which is used for granting TCC permissions.

Should you want to build and sign yourself, the signing assets live in [bin/build/mac/signing/](https://github.com/avanwouwe/citadel-browser-agent/tree/main/bin/build/mac/signing):

| File | Purpose                                                                                                                                                                                                                                                                                              |
|---|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| [`create-cert.sh`](https://github.com/avanwouwe/citadel-browser-agent/blob/main/bin/build/mac/signing/create-cert.sh) | Generates a fresh self-signed signing certificate (`citadel-signing.crt`) and private key (`citadel-signing.key`). Run once per signing identity. Keep the private key safe: anyone with it can produce a binary that satisfies the TCC profile.                                                     |
| [`import-cert.sh`](https://github.com/avanwouwe/citadel-browser-agent/blob/main/bin/build/mac/signing/import-cert.sh) | Installs the certificate and key into the build machine's keychain so `codesign` can use them. **Build machine only** the certificate must not be deployed to user machines, since the TCC profile pins the leaf hash directly and no chain trust is required at the endpoint.                       |
| [`sign-binary.sh`](https://github.com/avanwouwe/citadel-browser-agent/blob/main/bin/build/mac/signing/sign-binary.sh) | Signs the main binary and every Mach-O inside the PyInstaller `_internal/` directory with the hardened runtime enabled. Called automatically by [`build.sh`](https://github.com/avanwouwe/citadel-browser-agent/blob/main/bin/build/mac/build.sh).                                                   |
| [`citadel-agent.mobileconfig`](https://github.com/avanwouwe/citadel-browser-agent/blob/main/bin/build/mac/citadel-agent.mobileconfig) | The combined MDM profile described above. Pins the agent by install path and by the SHA-1 fingerprint of the signing certificate's leaf, and force-installs the browser extension. |

If you generate a new signing certificate, replace the SHA-1 hash in the `CodeRequirement` field of the mobileconfig with the new leaf fingerprint. Read it from the freshly-signed binary:
```
codesign -d --requirements - /Library/Scripts/Citadel/citadel-browser-agent
```
The line beginning `designated =>` is the exact requirement string to paste in.