# macOS installation

Browser extensions are sandboxed and cannot access the local operating system. To allow Citadel to write to syslog it is necessary to set-up Native Messaging. This involves placing a JSON manifest file in a specific place that gives the path to the program that will form the link between the extension and the OS.

To place the JSON manifest, run the following code:
```
sudo cat > /Library/Google/Chrome/NativeMessagingHosts/citadel.browser.agent.json << EOF
{
  "name": "citadel.browser.agent",
  "description": "Citadel browser agent",
  "path": "/Library/Scripts/Chrome/citadel-browser-agent",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://gaiabdglljkdhmekohlhdajbffpndkdd/"]
}
EOF
```

Then ensure that [the messaging script](/bin/citadel-browser-agent) is deployed in `/Library/Scripts/Chrome/citadel-browser-agent` and marked executable.

> [!NOTE]  
> Even if Native Messaging is supported on other Chromium browsers like Mozilla, be aware tht the procedure is slightly different. Citadel has not been tested with any browsers other than Chrome.

You can verify that events are being created by running the following command:
```
log stream --process Python --predicate 'eventMessage BEGINSWITH "browser agent"' --level debug
```