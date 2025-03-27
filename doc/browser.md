# Browser plugin installation
The extension is available on the web stores of Chrome, Firefox, Opera, Edge and Brave. This means it is updated automatically, and the installation consists of installing the plugin.


## Windows
For Chrome, Firefox, Edge and Brave the [Citadel installer](https://github.com/avanwouwe/citadel-browser-agent/releases/latest) force-installs the plugin for you using registry entries (see below). Opera does not support forced installation of plugins and so the plugin has to be installed manually on the endpoint.

```
reg add "HKEY_LOCAL_MACHINE\Software\Policies\Google\Chrome\ExtensionInstallForcelist" /v "10" /t REG_SZ /d "anheildjmkfdkdpgbndmpjnmkfliefga;https://clients2.google.com/service/update2/crx" /f

reg add "HKEY_LOCAL_MACHINE\Software\Policies\Mozilla\Firefox\Extensions\Install" /v "10" /t REG_SZ /d "{090510dc-b0ac-44dd-8e44-fee9b778180e}" /f
reg add "HKEY_LOCAL_MACHINE\Software\Policies\Mozilla\Firefox\Extensions\Locked" /v "10" /t REG_SZ /d "{090510dc-b0ac-44dd-8e44-fee9b778180e}" /f

reg add "HKEY_LOCAL_MACHINE\Software\Policies\Edge\ExtensionInstallForcelist" /v "10" /t REG_SZ /d "eanogkilbhfofmcplcoiflibdoomablj;https://edge.microsoft.com/extensionwebstorebase/v1/crx" /f

reg add "HKEY_LOCAL_MACHINE\Software\Policies\BraveSoftware\Brave\ExtensionInstallForcelist" /v "10" /t REG_SZ /d "anheildjmkfdkdpgbndmpjnmkfliefga;https://clients2.google.com/service/update2/crx" /f
```


## macOS
On macOS the plugin can be force-installed on all endpoints, by deploying this [.mobileconfig](/bin/mac/CitadelBrowserAgent.mobileconfig) using your MDM. This works for Chrome, Firefox, Edge and Brave. Unfortunately Opera does not support automated installation and the plugin has to be manually installed.

> [!NOTE]  
> If you have already force-installed another plugin via the Google Workspace admin, you cannot force install using the provided profile. You will need to add Citadel in the same way as the other plugin, using the [Goole Workspace admin](https://admin.google.com/ac/chrome/apps/).

For reference, these are the configurations for each browser.

For Chrome : `com.google.Chrome`.
```
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>ExtensionInstallForcelist</key>
  <array>
    <string>anheildjmkfdkdpgbndmpjnmkfliefga;https://clients2.google.com/service/update2/crx</string>
  </array>
</dict>
</plist>
```

For Firefox : `org.mozilla.firefox`.
```
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>ExtensionSettings</key>
    <dict>
      <key>{090510dc-b0ac-44dd-8e44-fee9b778180e}</key>
      <dict>
        <key>installation_mode</key>
        <string>force_installed</string>
        <key>install_url</key>
        <string>https://addons.mozilla.org/firefox/downloads/latest/[YOUR-EXTENSION-ID]/latest.xpi</string>
      </dict>
    </dict>
    <key>EnterprisePoliciesEnabled</key>
    <true/>
  </dict>
</plist>
```


For Edge : `com.microsoft.Edge`.
```
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>ExtensionInstallForcelist</key>
  <array>
    <string>eanogkilbhfofmcplcoiflibdoomablj;https://edge.microsoft.com/extensionwebstorebase/v1/crx</string>
  </array>
</dict>
</plist>
```

For Brave : `com.brave.Browser`.
```
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>ExtensionInstallForcelist</key>
  <array>
    <string>anheildjmkfdkdpgbndmpjnmkfliefga;https://clients2.google.com/service/update2/crx</string>
  </array>
</dict>
</plist>
```
