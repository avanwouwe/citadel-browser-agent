console.log("Service worker starting.")

let PROFILE_ADDRESS
if (chrome.identity.getProfileUserInfo) {
	chrome.identity.getProfileUserInfo((userInfo) => {
		PROFILE_ADDRESS = userInfo?.email
	})
}

let blacklistIP
let blacklistURL
let whitelistIP
let whitelistURL
let exceptionList
let ignorelist


Port.onMessage("config",(newConfig) => {
	Config.load(newConfig)

	new CombinedBlacklist().load(config.blacklist.ip, IPBlacklist).then(blacklist => blacklistIP = blacklist)
	new CombinedBlacklist().load(config.blacklist.url, URLBlacklist).then(blacklist => blacklistURL = blacklist)

	whitelistIP = new IPBlacklist().init()
	whitelistURL = new URLBlacklist().init()
	config.whitelist.ip.forEach(entry => whitelistIP.add(entry))
	config.whitelist.url.forEach(entry => whitelistURL.add(entry))
	exceptionList = new ExceptionList()
	ignorelist = new Ignorelist()

	const version = chrome.runtime.getManifest().version
	const configHash = config?.hashDJB2()

	logger.log(nowTimestamp(), "agent start", "start", undefined, Log.INFO, configHash, `browser agent started version ${version} and config ${configHash}`, )
})

chrome.runtime.onUpdateAvailable.addListener(() => {
	reportInteractions()

	Alarm.clear()

	AppStats.clear()
})

chrome.runtime.onInstalled.addListener((details) => {
	Alarm.start()

	setTimeout(() => {
		const version = chrome.runtime.getManifest().version
		logger.log(nowTimestamp(), "agent install", details.reason, undefined, Log.INFO, version, `browser agent version ${version} was installed`);
	}, 5000)
});

chrome.alarms.onAlarm.addListener((alarm) => {
	if (alarm.name === Alarm.DAILY) {
		// daily cleaning up of application statistics to prevent infinite build-up of irrelevant data
		for (const [appName, app] of AppStats.allApps()) {
			const config = Config.forHostname(appName)

			// purge applications if they haven't been used for a while
			if (isDate(app.lastUsed) && daysSince(app.lastUsed) > config.application.retentionDays) {
				AppStats.deleteApp(appName)
				continue
			}

			// purge accounts if they haven't been used for a while
			for (const [username, details] of AppStats.allAccounts(app)) {
				if (isDate(details.lastConnected) && daysSince(details.lastConnected) > config.account.retentionDays) {
					AppStats.deleteAccount(app, username)
				}
			}
		}

		SessionState.purge()

		AppStats.resetSitestats()

		reportInteractions()
	}

	if (alarm.name === Alarm.BIWEEKLY) {
		reportApplications()
	}

	if (alarm.name === Alarm.MONTHLY) {
		AppStats.purgeSitestats()
	}
})


function evaluateRequest(details) {
	const url = details.url.toURL()
	const ip = details.ip ?? IPv4Range.isIPV4(url.hostname) ? url.hostname : undefined
	const isNavigate = details.method === undefined

	if (ignorelist?.find(details.url) ||
		details.tabId < 0 ||
		!isNavigate && ignorelist?.find(details.initiator)
	) return { result: "ignored" }

	const result = {
		result: "allowed",
	    description: isNavigate ? "web navigation in browser" : "web request in browser",
		level: isNavigate ? Log.DEBUG : Log.TRACE
	}

	if (
		! IPv4Range.isLoopback(url.hostname) && url.hostname !== 'localhost' &&
		Config.forHostname(url.hostname).warningProtocols.includes(url.protocol)
	) {
		if (details.initiator && AppStats.forUrl(details.initiator)?.isAuthenticated) {
			result.result = "protocol warning"
			result.level = Log.WARN
			result.value = url.protocol
			result.description = `use of protocol type '${url.protocol}' by '${getSitename(details.initiator)}'`
		}
	}

	if (url.password.isNotEmpty()) {
		result.result = "URL auth warning"
		result.level = Log.WARN
		result.value = url.username
		result.description = `password of '${url.username}' in URL`
	}

	const blacklist = blacklistURL?.find(url) ?? blacklistIP?.find(ip)
	if (blacklist) {
		let whitelist = whitelistURL?.find(url) ?? whitelistIP?.find(ip)
		if (! whitelist) {
			result.result = isNavigate ? "navigation blacklisted" : "request blacklisted"
			result.level = Log.ERROR
			result.value = url.href
			result.description = `${result.result} because target is on blacklist '${blacklist}'`

			if (exceptionList.find(details.url)) {
				result.level = Log.downgrade(result.level)
				result.result = result.result + ' (exception granted)'
				result.description = result.description + ' (exception granted)'
			}
		}
	}


	return result
}

chrome.webNavigation.onBeforeNavigate.addListener((details) => {
	if (details.frameType && details.frameType !== 'outermost_frame' ||
		details.documentLifecycle && details.documentLifecycle !== 'active'
	) {
		return
	}

	setInitiator(details)
	const timestamp = timestampToISO(details.timeStamp)
	const evaluation = evaluateRequest(details)

	switch (evaluation.result) {
		case "ignored":
			return
		case "navigation blacklisted":
			blockPage(details.tabId, evaluation.description, evaluation.value)
	}

	logger.log(timestamp, "navigate", evaluation.result, details.url, evaluation.level, evaluation.value, evaluation.description, undefined, details.tabId);

});


chrome.webRequest.onBeforeRequest.addListener((details) => {
	setInitiator(details)
	const timestamp = timestampToISO(details.timeStamp)
	const evaluation = evaluateRequest(details)

	switch (evaluation.result) {
		case "ignored":
			return
		case "request blacklisted":
			blockPage(details.tabId, evaluation.description, evaluation.value)
	}

	logger.log(timestamp, "request", evaluation.result, details.url, evaluation.level, evaluation.value, evaluation.description, details.initiator, details.tabId);

},  { urls: ["<all_urls>"] });


// check for blacklist when finally connected, since at this time we have the IP address
chrome.webRequest.onResponseStarted.addListener((details) => {
	if (details.ip === undefined) return			// for example for cached entries

	// the event was already logged before, only log a second event if there was a blacklist issue
	setInitiator(details)
	const timestamp = timestampToISO(details.timeStamp)
	const evaluation = evaluateRequest(details)

	if (evaluation.result === "request blacklisted") {
		blockPage(details.tabId, evaluation.description, evaluation.value)

		logger.log(timestamp, "request", evaluation.result, details.url, evaluation.level, evaluation.value, evaluation.description, details.initiator, details.tabId)
	}

},  { urls: ["<all_urls>"] })


function getDownload(downloadId) {
	return new Promise((resolve, reject) => {
		chrome.downloads.search({ id: downloadId }, (results) => {
			if (results && results.length > 0) {
				const download = structuredClone(results[0]);
				resolve(download);
			} else {
				reject(new Error(`No download item found with ID: ${downloadId}`));
			}
		});
	});
}

function logDownload(event, timestamp, result, level, description) {
	// determine an id that is more globally unique than the original id
	const uniqueId = { id: event.id, startTime: event.startTime }.hashCode()

	const url = event.url
	const referrer = event.referrer

	description = description.replace("@@URL@@", logger.maskUrl(event.url, level))

	const download = {}
	if (event.bytesReceived) download.bytesReceived = event.bytesReceived
	if (event.danger) download.danger = event.danger
	if (event.startTime) download.startTime = event.startTime
	if (event.endTime) download.endTime = event.endTime
	if (event.totalBytes) download.totalBytes = event.totalBytes
	if (event.fileSize) download.fileSize = event.fileSize
	if (event.filename) download.filename = event.filename
	if (event.mime) download.mime = event.mime
	if (event.exists) download.exists = event.exists
	if (event.incognito) download.incognito = event.incognito

	logger.log(timestamp, "download", result, url, level, { download }, description, referrer, uniqueId)
}

chrome.downloads.onChanged.addListener((delta) => {
	if (delta.state && delta.state.current === 'complete') {
		getDownload(delta.id).then(download => {
			logDownload(download, download.endTime, "download completed", Log.INFO, `completed download of @@URL@@ to '${download.filename}'`)
		})
	}

	if (delta.danger) {
		const danger = delta.danger.current
		switch (danger) {
			case 'safe':
				break;
			case 'deepScannedFailed':
			case 'accepted':
				getDownload(delta.id).then(download => {
					logDownload(download, nowTimestamp(), "download accepted", Log.ERROR, `user accepted danger of type '${delta.danger.current}' of download of @@URL@@`)
				})
				break;
			default:
				getDownload(delta.id).then(download => {
					logDownload(download, nowTimestamp(), "download warned", Log.WARN, `user notified danger of type '${danger}' of download of @@URL@@`)
				})
		}
	}

	if (delta.error) {
		const error = delta.error.current
		switch (error) {
			case 'FILE_VIRUS_INFECTED':
			case 'FILE_BLOCKED':
			case 'FILE_SECURITY_CHECK_FAILED':
				getDownload(delta.id).then(download => {
					logDownload(download, nowTimestamp(), "download blocked", Log.WARN, `navigator blocked of type '${error}' of download of @@URL@@`)
				})
				break
			default:
				// do nothing
		}
	}

});

// only raise events for browser errors that deal with security issues, such as virus or SSL
// for the full list of errors see : chrome://network-errors/
const BROWSER_ERROR_ERROR = /_(BLOCKED_BY_ADMINISTRATOR|BLOCKED_BY_PRIVATE_NETWORK_ACCESS_CHECKS|KNOWN_INTERCEPTION_BLOCKED|UNWANTED|VIRUS|MALWARE|PHISHING|HARMFUL|CRYPTOMINING)/
const BROWSER_ERROR_WARNING = /_(SSL|CERT|UNSAFE|BLOCKED|INSECUR|SECUR|TRUST|CMS_VERIFY)/
function handleError(hook, eventType, filter) {
    const listenerArgs = [
        (details) => {
            setInitiator(details)

            if (details.error) {
				const config = Config.forURL(details.url)
				const exception = config.errors.exceptions[details.error]

				let level
				if (details.url.startsWith('chrome://network-error/')) level = Log.INFO
				else if (exception) level = exception
				else if (details.error.match(BROWSER_ERROR_ERROR)) level = Log.ERROR
				else if (details.error.match(BROWSER_ERROR_WARNING)) level = Log.WARN
				else level = undefined

				if (level) {
					logger.log(nowTimestamp(), eventType, `${eventType} error`, details.url, level, details.error, `browser error ${details.error} [${level}] for ${eventType} to ${details.url}`, details.initiator, details.tabId)
				}
            }
        }
    ]

    if (filter) {
        listenerArgs.push(filter)
    }

    hook.addListener(...listenerArgs)
}

handleError(chrome.webNavigation.onErrorOccurred, "navigate")
handleError(chrome.webRequest.onErrorOccurred, "request", { urls: ["<all_urls>"] })


const AUTH_HEADERS = {
	'authorization' : true,
	'api-key' : true,
	'x-api-key' : true,
	'auth-token' : true,
	'x-auth-token' : true,
	'current-token' : true,
	'x-current-token' : true,
	'x-accepted-oauth-scopes' : true,
	'x-oauth-scopes' : true,
	'x-csrf-Token' : true,
}
const AUTH_COOKIE_PATTERN = /(^|[_.-])([cx]srf|jwt|password|secret|login|access|account|acct|user(id|name)?|auth(ori[sz]ation)?)([_.-]|$)/i
const SESSION_COOKIE_PATTERN = /(session|token|([_.-]|^)[a-z]{0,4}id$)/i


function getAppnameFromHeaders(details, headers) {
	for (header of headers) {
		const headerName = header.name.toLowerCase()
		if (['origin', 'access-control-allow-origin'].includes(headerName)) {
			return header.value.startsWith("http") ? getSitename(header.value) : null
		}
	}

	return getSitename(details.initiator)
}

function markUsed(appName) {
	if (!appName) return

	const app = AppStats.forAppName(appName)
	app.lastUsed = nowDatestamp()

	AppStats.markDirty()
}

function isAuthenticated(appName) {
	if (!appName) return

	const app = AppStats.forAppName(appName)
	return app.isAuthenticated
}


function markIsAuthenticated(appName, reason) {
	if (!appName) return

	const app = AppStats.forAppName(appName)

	if (!app.isAuthenticated) {
		app.isAuthenticated = reason
		AppStats.markDirty()
	}
}

chrome.webRequest.onAuthRequired.addListener(
	function(details) {
		setInitiator(details)

		const appName = getAppnameFromHeaders(details, details.responseHeaders);
		markIsAuthenticated(appName, "HTTP auth req")
	},
	{ urls: ["<all_urls>"] } , ["responseHeaders"]
);


function detectApplication(hook, headers) {
	hook.addListener(
		function(details) {
			if (! (details.frameType === 'outermost_frame' || details.type !== 'main_frame') ||
				details.tabId < 0)
			{
				return
			}

			setInitiator(details)

			if (getSitename(details.url) !== getSitename(details.initiator)) {
				return
			}

			const appName = getAppnameFromHeaders(details, details[headers])

			if (appName) {
				AppStats.assignAppToSite(appName, details.initiator)

				markUsed(appName)

				const urlMatch = findAuthPattern(details.url.toURL()?.pathname)
				if (urlMatch) {
					return markIsAuthenticated(appName, 'url:' + urlMatch)
				}

				for (let header of details[headers]) {
					const headerName = header.name.toLowerCase()

					if (AUTH_HEADERS[headerName]) {
						return markIsAuthenticated(appName, 'header:' + headerName)
					}
				}

			}
		}, { urls: ["<all_urls>"] }, [headers]
	)
}

detectApplication(chrome.webRequest.onSendHeaders, "requestHeaders")
detectApplication(chrome.webRequest.onHeadersReceived, "responseHeaders")


chrome.webRequest.onCompleted.addListener(
	function (details) {
		setInitiator(details)
		const appName = getAppnameFromHeaders(details, details.responseHeaders)
		const hostname = getSitename(details.initiator)

		if (isAuthenticated(appName)) {
			return
		}

		chrome.cookies.getAll({ url: details.url }, cookies => {
			for (const cookie of cookies) {
				if (cookie.name?.match(AUTH_COOKIE_PATTERN)) {
					const cookieDomain = cookie.domain.startsWith('.') ? cookie.domain.substring(1) : cookie.domain

					if (matchDomain(hostname, { [cookieDomain] : true })) {
						return markIsAuthenticated(appName, 'cookie:' + cookie.name)
					}
				}
			}
		})
	}, { urls: ["<all_urls>"] }, ["responseHeaders"]
)


function reportInteractions() {
	Config.assertIsLoaded()

	function report(isAuthenticated) {
		const usagePerDayPerApp = { }
		const today = nowDatestamp();

		// aggregate interactions per date (only dates in the past)
		for (const [appName, app] of AppStats.allApps()) {
			if ((app.isAuthenticated === undefined) !== !isAuthenticated) { continue; }

			const dailyUsage = app.usage ?? {}

			for (const [date, interactions] of Object.entries(dailyUsage)) {
				if (isDate(date) && date < today) {
					usagePerDayPerApp.getOrSet(date, {})[appName] = interactions
					delete dailyUsage[date]
					AppStats.markDirty()
				}
			}
		}

		for (const [date, app] of Object.entries(usagePerDayPerApp)) {
			Object.entries(app)
				.map(([appName, interactions]) => ({ appName, interactions }))
				.sort((a, b) => b.interactions - a.interactions)
				.slice(0, config.reporting.maxApplicationEntries)
				.forEach(it => {
					logger.log(
						`${date}T23:59:59.999Z`,
						'report',
						'interaction report',
						"https://" + it.appName,
						Log.INFO,
						it.interactions,
						`'${it.appName}' received ${it.interactions} interactions on ${date}`
					)
				})
		}

		const unreportedApplications = Object.entries(usagePerDayPerApp).length - config.reporting.maxApplicationEntries
		if (unreportedApplications > 0) {
			logger.log(nowTimestamp(), "report", "unreported interactions", undefined, Log.ERROR, unreportedApplications, `${unreportedApplications} interaction reports were lost, exceeded maximum of ${config.reporting.maxApplicationEntries} applications`);
		}

	}

	// run twice to prevent non-authenticated sites from crowding out the authenticated ones
	if (config.reporting.onlyAuthenticated) {
		report(true)
	} else {
		report(true)
		report(false)
	}

}

function reportApplications() {
	Config.assertIsLoaded()

	function report(isAuthenticated) {
		let appCnt = 0
		const topIssues = []

		for (const [appName, app] of AppStats.allApps()) {
			if ((app.isAuthenticated === undefined) !== !isAuthenticated) { continue }

			if (appCnt++ < config.reporting.maxApplicationEntries) {
				const unusedDays = daysSince(app.lastUsed)
				logger.log(
					nowTimestamp(),
					'report',
					'application usage',
					"https://" + appName,
					Log.INFO,
					unusedDays,
					`'${appName}' was last used ${unusedDays} days ago, on ${app.lastUsed}`
				)
			}

			const checkExternal = Config.forHostname(appName).account.checkExternal

			for (const [username, details] of AppStats.allAccounts(app)) {
				const domain = getDomainFromUsername(username)
				if (details?.issues && (checkExternal || ! isExternalDomain(domain) )) {
					topIssues.push(mergeDeep(details.issues, {
						username,
						appName,
					}))
				}
			}
		}

		topIssues.sort((a, b) => b.count - a.count)
			.slice(0, config.reporting.maxAccountEntries)
			.forEach(it => {
				logger.log(
					nowTimestamp(),
					'report',
					'password issue',
					"https://" + it.appName,
					Log.WARN,
					it.count,
					`password for account '${it.username}' of '${it.appName}' has ${it.count} issues`
				)
			})

		const unreportedApplications = appCnt - config.reporting.maxApplicationEntries
		if (unreportedApplications > 0) {
			logger.log(nowTimestamp(), "report", "unreported usage", undefined, Log.ERROR, unreportedApplications, `${unreportedApplications} application usage reports were lost, exceeded maximum of ${config.reporting.maxApplicationEntries} applications`);
		}

		const unreportedIssues = topIssues.length - config.reporting.maxAccountEntries
		if (unreportedIssues > 0) {
			logger.log(nowTimestamp(), "report", "unreported account issues", undefined, Log.ERROR, unreportedIssues, `${unreportedIssues} account issues were lost, exceeded maximum of ${config.reporting.maxAccountEntries} accounts`);
		}

	}

	// run twice to prevent non-authenticated sites from crowding out the authenticated ones
	if (config.reporting.onlyAuthenticated) {
		report(true)
	} else {
		report(true)
		report(false)
	}
}


function registerInteraction(url, context) {
	if (context.documentLifecycle && context.documentLifecycle !== 'active' ||
		context.tabId < 0 ||
		ignorelist?.find(context.url))
	{
		return
	}

	AppStats.incrementInteraction(url)
}


function registerAccountUsage(url, report) {
	const config = Config.forURL(url)
	const domain = getDomainFromUsername(report.username)

	if (! config.account.checkExternal && isExternalDomain(domain)) {
		return
	}

	const app = AppStats.forUrl(url)
	app.lastUsed = nowDatestamp()
	app.lastConnected = nowDatestamp()
	app.lastAccount = report.username
	app.isAuthenticated = app.isAuthenticated ?? "auth form submit"

	const account = AppStats.getAccount(app, report.username)
	account.lastConnected = nowDatestamp()

	const issues = {
		numberOfDigits: report.password.numberOfDigits < config.account.passwordPolicy.minNumberOfDigits ? 1 : null,
		numberOfLetters: report.password.numberOfLetters < config.account.passwordPolicy.minNumberOfLetters ? 1 : null,
		numberOfUpperCase: report.password.numberOfUpperCase < config.account.passwordPolicy.minNumberOfUpperCase ? 1 : null,
		numberOfLowerCase: report.password.numberOfLowerCase < config.account.passwordPolicy.minNumberOfLowerCase ? 1 : null,
		numberOfSymbols: report.password.numberOfSymbols < config.account.passwordPolicy.minNumberOfSymbols ? 1 : null,
		entropy: report.password.entropy < config.account.passwordPolicy.minEntropy ? 1 : null,
		sequence: report.password.sequence < config.account.passwordPolicy.minSequence ? 1 : null,
	}

	Object.entries(issues).forEach(([key, value]) => {
		if (!value) {
			delete issues[key]
		}
	})

	issues.count = Object.values(issues).length
	account.issues = issues.count > 0 ? issues : null

	AppStats.markDirty()
}

chrome.webNavigation.onCommitted.addListener((details) => {
	if (details?.transitionType === 'auto_subframe' ||
		details?.transitionType === 'generated' ||
		details?.transitionType === 'reload' ||
		details?.transitionQualifiers === 'server_redirect' ||
		details?.transitionQualifiers === 'client_redirect' ||
		details.tabId < 0
	) {
		return
	}

	setInitiator(details)

	registerInteraction(details.url, details)
})

chrome.cookies.onChanged.addListener((changeInfo) => {
	if (changeInfo.removed || changeInfo.cause !== 'explicit')
		return

	const cookie = changeInfo.cookie
	const protocol = cookie.secure ? 'https://' : 'http://'
	const domain = cookie.domain.startsWith('.') ? cookie.domain.substring(1) : undefined
	const url = `${protocol}${domain ?? cookie.domain}${cookie.path}`

	const config = Config.forHostname(domain)
	if (config.session.maxSessionDays <= 0)
		return
	if (config.session.onlyAuthCookies && ( ! cookie.name?.match(AUTH_COOKIE_PATTERN)) && ! cookie.name?.match(SESSION_COOKIE_PATTERN) )
		return

	const maxSessionExpirationDate = new Date()
	maxSessionExpirationDate.setDate(maxSessionExpirationDate.getDate() + config.session.maxSessionDays)
	const maxSessionExpirationTimestamp = Math.floor(maxSessionExpirationDate.getTime() / 1000)
	if (!cookie.expirationDate || cookie.expirationDate <= maxSessionExpirationTimestamp)
		return

	const modifiedCookie = {
		url: url,
		domain: domain,
		name: cookie.name,
		value: cookie.value,
		path: cookie.path,
		secure: cookie.secure,
		httpOnly: cookie.httpOnly,
		sameSite: cookie.sameSite,
		expirationDate: maxSessionExpirationTimestamp,
		storeId: cookie.storeId
	}

	chrome.cookies.set(modifiedCookie)
})

chrome.runtime.onMessage.addListener(function(request, sender) {
	if (request.type === "user-interaction") {
		registerInteraction(sender.url, sender)
	}

	if (request.type === "print-dialog") {
		registerInteraction(sender.url, sender)

		logger.log(nowTimestamp(), "print dialog", null, sender.url, Log.INFO, "", "user opened print dialog", sender.origin, sender.tab.id)
	}

	if (request.type === "file-select") {
		registerInteraction(sender.url, sender)

		logger.log(nowTimestamp(), "file select", request.subtype, sender.url, Log.INFO, { "file select": request.file }, `user selected file "${request.file.name}"`, null, sender.tab.id)
	}

	if (request.type === "account-usage") {
		registerAccountUsage(sender.url, request.report)

		const config = Config.forHostname(sender.url)

		if (requiresMFA(sender.url, config)) {
			const app = AppStats.forUrl(sender.url)
			const account = AppStats.getAccount(app, request.report.username)

			if (!isDate(account.lastMFA) || daysSince(account.lastMFA) >= config.account.mfa.maxSessionDays) {
				const showModal = account.lastMFA === undefined
				delete account.lastMFA
				startTimerMFA(sender.url, config.account.mfa.waitMinutes, showModal)
			}
		}
	}

	if (request.type === "mfa-received") {
		cancelTimerMFA(sender.url)
	}

	if (request.type === "allow-mfa") {
		const app = AppStats.forUrl(sender.url)
		const account = AppStats.getAccount(app, app.lastAccount)
		account.lastMFA = nowDatestamp()
		AppStats.markDirty()

		forAllTabs(request.domain, () => location.reload())

		logger.log(nowTimestamp(), "exception", "MFA exception granted", "https://" + request.domain, Log.ERROR, request.reason, `user requested MFA exception for account ${app.lastAccount} for ${request.domain}`)
	}

	if (request.type === "allow-blacklist") {
		exceptionList.add(request.url.toURL()?.hostname)

		logger.log(nowTimestamp(), "exception", "blacklist exception granted", request.url, Log.ERROR, request.reason, "user requested exception: " + request.description)
	}

})
