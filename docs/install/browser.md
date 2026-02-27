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
On macOS the plugin can be force-installed on all endpoints, by configuration profiles using your MDM. This works for Chrome, Firefox, Edge and Brave. Unfortunately Opera does not support automated installation and the plugin has to be manually installed, using the [Chrome Web Store](https://chromewebstore.google.com/detail/citadel-browser-agent/anheildjmkfdkdpgbndmpjnmkfliefga/).

> [!NOTE]  
> If you have already force-installed another plugin via the Google Workspace admin, using profiles will override the Workspace list of force-installed extensions. If you add Citadel in using the [Google Workspace admin](https://admin.google.com/ac/chrome/apps/) this has the advantage that you can force the use of the extension in private sessions.

You can use this profile for the following browsers:
* Chrome : `com.google.Chrome`
* Edge : `com.microsoft.Edge` 
* Brave : `com.brave.Browser`

```
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>ExtensionInstallForcelist</key>
    <array>
        <string>anheildjmkfdkdpgbndmpjnmkfliefga;https://clients2.google.com/service/update2/crx</string>
    </array>
    
    <key>NativeMessagingAllowlist</key>
    <array>
        <string>citadel.browser.agent</string>
    </array>
</dict>
</plist>
```

And this one for Firefox : `org.mozilla.firefox`.
```
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>ExtensionSettings</key>
    <dict>
      <key>{090510dc-b0ac-44dd-8e44-fee9b778180d}</key>
      <dict>
        <key>installation_mode</key>
        <string>force_installed</string>
        <key>install_url</key>
        <string>https://addons.mozilla.org/firefox/downloads/latest/citadel-browser-agent/latest.xpi</string>
      </dict>
    </dict>
    <key>EnterprisePoliciesEnabled</key>
    <true/>
  </dict>
</plist>
```


