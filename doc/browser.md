# Browser plugin installation
The extension is available on the Chrome web store.

Deployment to Chrome is most easily done by using the [Chrome management feature](https://admin.google.com/ac/chrome/apps/user) in the Google Workspace admin console, where you can [force the installation of the extension](https://support.google.com/chrome/a/answer/6306504?hl=en) to all profiles of managed browsers.

If you do not use Google Workspace you can use Chrome Policy lists to set `ExtensionInstallForcelist`. Policy lists work differently depending on the platform (Windwos, Mac, Linux).

<div align="left">
  <a href="https://chromewebstore.google.com/detail/citadel-browser-agent/anheildjmkfdkdpgbndmpjnmkfliefga">
    <img alt="Citadel logo" src="/doc/chrome%20web%20store.png">
  </a>
</div>

## Windows
On Windows you can force installation by using your MDM to set a registry entry.
```
reg add "HKEY_LOCAL_MACHINE\Software\Policies\Google\Chrome\ExtensionInstallForcelist" /v "1" /t REG_SZ /d "anheildjmkfdkdpgbndmpjnmkfliefga;https://clients2.google.com/service/update2/crx" /f
```

If you are using GPO, you can use [Chrome Policy templates](https://support.google.com/chrome/a/answer/187202?hl=en).

## macOS
You can force installation by using your MDM to set a profile for the domain `com.google.Chrome`.
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
