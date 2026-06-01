---
layout: default
title: Browser
parent: Installation
nav_order: 3
---

# Browser plugin installation
The extension is available on the web stores of Chrome, Firefox, Opera, Edge and Brave. This means it is updated automatically, and the installation consists of installing the plugin.

Unless users go to the extension settings (`chrome://extensions/?id=anheildjmkfdkdpgbndmpjnmkfliefga`) and opt in, extensions are not enabled during Incognito browsing. It is possible to **require** the opt-in using the [MandatoryExtensionsForIncognitoNavigation key](https://chromeenterprise.google/policies/?policy=MandatoryExtensionsForIncognitoNavigation). This key will force the user to manually enable the extension for Incognito browsing, as part of the installation of the extension. The Firefox equivalent of this is the `private_browsing` [policy key](https://mozilla.github.io/policy-templates/).

## Windows
For Chrome, Firefox, Edge and Brave the [Citadel installer](https://github.com/avanwouwe/citadel-browser-agent/releases/latest) force-installs the plugin for you using registry entries (see below). Opera does not support forced installation of plugins and so the plugin has to be installed manually on the endpoint, using the [Chrome Web Store](https://chromewebstore.google.com/detail/citadel-browser-agent/anheildjmkfdkdpgbndmpjnmkfliefga/).

```
reg add "HKEY_LOCAL_MACHINE\Software\Policies\Google\Chrome\ExtensionInstallForcelist" /v "10" /t REG_SZ /d "anheildjmkfdkdpgbndmpjnmkfliefga;https://clients2.google.com/service/update2/crx" /f

reg add "HKEY_LOCAL_MACHINE\Software\Policies\Mozilla\Firefox\Extensions\Install" /v "10" /t REG_SZ /d "{090510dc-b0ac-44dd-8e44-fee9b778180d}" /f
reg add "HKEY_LOCAL_MACHINE\Software\Policies\Mozilla\Firefox\Extensions\Locked" /v "10" /t REG_SZ /d "{090510dc-b0ac-44dd-8e44-fee9b778180d}" /f

reg add "HKEY_LOCAL_MACHINE\Software\Policies\Edge\ExtensionInstallForcelist" /v "10" /t REG_SZ /d "anheildjmkfdkdpgbndmpjnmkfliefga;https://clients2.google.com/service/update2/crx" /f

reg add "HKEY_LOCAL_MACHINE\Software\Policies\BraveSoftware\Brave\ExtensionInstallForcelist" /v "10" /t REG_SZ /d "anheildjmkfdkdpgbndmpjnmkfliefga;https://clients2.google.com/service/update2/crx" /f
```


## macOS
On macOS the plugin is force-installed via MDM-deployed configuration profiles. This works for Chrome, Firefox, Edge and Brave. Opera does not support automated installation, so on Opera the plugin has to be installed manually from the [Chrome Web Store](https://chromewebstore.google.com/detail/citadel-browser-agent/anheildjmkfdkdpgbndmpjnmkfliefga/).

The browser-policy payloads for all four supported browsers are bundled into the same [citadel-agent.mobileconfig](https://github.com/avanwouwe/citadel-browser-agent/blob/main/bin/build/mac/citadel-agent.mobileconfig), see the [macOS installation page](macos.md#mdm-configuration-profile) for upload instructions per MDM vendor.

> [!NOTE]  
> If you have already force-installed another plugin via the Google Workspace admin, using profiles will override the Workspace list of force-installed extensions. If you add Citadel via the [Google Workspace admin](https://admin.google.com/ac/chrome/apps/) instead, you can also force the extension on in private sessions. In that case, delete the `com.google.Chrome` payload from the mobileconfig before uploading.


