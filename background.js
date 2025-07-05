console.log("Service worker starting.")

let PROFILE_ADDRESS
if (chrome.identity?.getProfileUserInfo) {
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
let devicetrust


Port.onMessage("config",(newConfig) => {
	Config.load(newConfig)

	new CombinedBlacklist().load(config.blacklist.ip, IPBlacklist).then(blacklist => blacklistIP = blacklist)
	new CombinedBlacklist().load(config.blacklist.url, URLBlacklist).then(blacklist => blacklistURL = blacklist)

	whitelistIP = new IPBlacklist().init()
	whitelistURL = new URLBlacklist().init()
	config.whitelist.ip.forEach(entry => whitelistIP.add(entry))
	config.whitelist.url.forEach(entry => whitelistURL.add(entry))
	exceptionList = new Exceptionlist()
	ignorelist = new Ignorelist()

	devicetrust = new DeviceTrust()

	const version = chrome.runtime.getManifest().version
	const configHash = config?.hashDJB2()

	logger.log(nowTimestamp(), "agent start", "start", undefined, Log.INFO, configHash, `browser agent started version ${version} and config ${configHash}`, undefined, undefined, false)
})

Port.onMessage("restart",() => {
	chrome.runtime.reload()
})

let dashboard
chrome.runtime.onConnect.addListener((port) => {
	port.onDisconnect.addListener(() => {
		dashboard = null
		console.debug("Dashboard port disconnected")
	})

	dashboard = port
})

Port.onMessage("devicetrust",(report) => {
	debug("received device trust report", report)
	devicetrust.addReport(report)
	dashboard?.postMessage({type: "RefreshSecurityStatus"})
})

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	switch(message.type) {
		case "GetSecurityStatus":
			const status = {
				controls: { },
				state: devicetrust.getState(),
				nextState: devicetrust.getNextState(),
				compliance: devicetrust.getCompliance()
			}

			Object.values(devicetrust.getControls()).forEach((control) => {
				status.controls[control.name] = {
					name: control.name,
					definition: control.definition,
					passing: control.report.passed,
					state: control.getState(),
					nextState: control.getNextState(),
				}
			})

			sendResponse(status)
			return
		case "RefreshSecurityStatus":
			debug("dashboard requested update")
			Port.postMessage("devicetrust", { request: "update" } )
	}
})


chrome.runtime.onUpdateAvailable.addListener(() => {
	try {
		reportInteractions()

		Alarm.clear()
	} catch (error) {
		debug("error while preparing update of extension", error)
	}

	AppStats.clear()
})

chrome.runtime.onInstalled.addListener((details) => {
	Alarm.start()

	setTimeout(() => {
		const version = chrome.runtime.getManifest().version
		logger.log(nowTimestamp(), "agent install", details.reason, undefined, Log.INFO, version, `browser agent version ${version} was installed`, undefined, undefined, false)
	}, 5000)
})

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

		reportInteractions()

		devicetrust.report()
	}

	if (alarm.name === Alarm.BIWEEKLY) {
		reportApplications()
	}

	if (alarm.name === Alarm.MONTHLY) {
		// do nothing for now
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
		if (details.initiator && AppStats.forURL(details.initiator)?.isAuthenticated) {
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
	if (details.parentFrameId >= 0 ||
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

	logger.log(timestamp, "navigate", evaluation.result, details.url, evaluation.level, evaluation.value, evaluation.description, undefined, details.tabId)
})


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

	logger.log(timestamp, "request", evaluation.result, details.url, evaluation.level, evaluation.value, evaluation.description, details.initiator, details.tabId)
},  { urls: ["<all_urls>"] })


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
				const download = structuredClone(results[0])
				resolve(download)
			} else {
				reject(new Error(`No download item found with ID: ${downloadId}`))
			}
		})
	})
}

function logDownload(event, timestamp, result, level, description) {
	// determine an id that is more globally unique than the original id
	const uniqueId = { id: event.id, startTime: event.startTime }.hashCode()
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

	description = description.replace("@@URL@@", logger.maskUrl(event.url, level))

	logger.log(timestamp, "download", result, event.url, level, { download }, description, event.referrer, uniqueId)
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
				break
			case 'deepScannedFailed':
			case 'accepted':
				getDownload(delta.id).then(download => {
					logDownload(download, nowTimestamp(), "download accepted", Log.ERROR, `user accepted danger of type '${delta.danger.current}' of download of @@URL@@`)
				})
				break
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

})

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


const AUTH_COOKIE_PATTERN = /(^|[_.-])([cx]srf|jwt|password|secret|login|access|account|acct|user(id|name)?|auth(ori[sz]ation)?)([_.-]|$)/i
const AUTH_HEADERS = {
	'access-token': true,
	'x-access-token': true,
	'auth-token' : true,
	'x-auth-token' : true,
	'authorization' : true,
	'x-authorization' : true,
	'api-key' : true,
	'x-api-key' : true,
	'current-token' : true,
	'x-current-token' : true,
	'x-accepted-oauth-scopes' : true,
	'x-oauth-scopes' : true,
	'x-csrf-Token' : true,
	'bearer-token': true,
	'x-bearer-token': true,
	'jwt': true,
	'x-jwt': true,
	'x-xsrf-token': true,
}

function isAuthenticated(appName) {
	if (!appName) return

	const app = AppStats.forAppName(appName)
	return app?.isAuthenticated === true
}


function markIsAuthenticated(appName, reason) {
	if (!appName) return

	const app = AppStats.forAppName(appName)
	if (app && ! app.isAuthenticated) {
		app.isAuthenticated = reason
		AppStats.markDirty()
	}
}

chrome.webRequest.onAuthRequired.addListener(
	function() {
		markIsAuthenticated(appName, "HTTP auth req")
	},
	{ urls: ["<all_urls>"] }
)

async function getFrameUrl(tabId, frameId) {
	return new Promise((resolve, reject) => {
		chrome.webNavigation.getFrame({ tabId, frameId }, (frameInfo) => {
			if (!frameInfo) return

			if (!frameInfo.url) {
				console.error("no frameInfo", frameInfo)
				reject(chrome.runtime.lastError || new Error("No frameInfo/url found"))
			} else {
				resolve(frameInfo.url)
			}
		})
	})
}

function detectApplication(hook, headers) {
	hook.addListener(
		async function(details) {
			if (details.tabId < 0) {
				return
			}

			setInitiator(details)
			const mainFrameUrl = details.frameId === 0 ? details.initiator : await getFrameUrl(details.tabId, 0)
			const appName = getSitename(mainFrameUrl)

			if (getSitename(details.initiator) !== appName || ignorelist?.find(details.url)) {
				return
			}

			if (appName) {
				const app = AppStats.getOrCreateApp(appName)
				AppStats.markUsed(app)

				const authPattern = findAuthPattern(details.url.toURL()?.pathname)
				if (authPattern) {
					return markIsAuthenticated(appName, 'url:' + authPattern)
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
		const appName = getSitename(details.initiator)

		if (isAuthenticated(appName)) {
			return
		}

		chrome.cookies.getAll({ url: details.url }, cookies => {
			for (const cookie of cookies) {
				if (cookie.name?.match(AUTH_COOKIE_PATTERN)) {
					const cookieDomain = cookie.domain.startsWith('.') ? cookie.domain.substring(1) : cookie.domain

					if (matchDomain(appName, { [cookieDomain] : true })) {
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
		const today = nowDatestamp()

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
						, undefined
						, undefined
						, false
					)
				})
		}

		const unreportedApplications = Object.entries(usagePerDayPerApp).length - config.reporting.maxApplicationEntries
		if (unreportedApplications > 0) {
			logger.log(nowTimestamp(), "report", "unreported interactions", undefined, Log.ERROR, unreportedApplications, `${unreportedApplications} interaction reports were lost, exceeded maximum of ${config.reporting.maxApplicationEntries} applications`, undefined, undefined, false)
		}

	}

	if (config.reporting.onlyAuthenticated) {
		report(true)
	} else {
		// run twice to prevent non-authenticated sites from crowding out the authenticated ones
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
					, undefined
					, undefined
					, false
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
					`password of '${it.username}' / '${it.appName}' has ${it.count} issues`
					, undefined
					, undefined
					, false
				)
			})

		const unreportedApplications = appCnt - config.reporting.maxApplicationEntries
		if (unreportedApplications > 0) {
			logger.log(nowTimestamp(), "report", "unreported usage", undefined, Log.ERROR, unreportedApplications, `${unreportedApplications} application usage reports were lost, exceeded maximum of ${config.reporting.maxApplicationEntries} applications`)
		}

		const unreportedIssues = topIssues.length - config.reporting.maxAccountEntries
		if (unreportedIssues > 0) {
			logger.log(nowTimestamp(), "report", "unreported account issues", undefined, Log.ERROR, unreportedIssues, `${unreportedIssues} account issues were lost, exceeded maximum of ${config.reporting.maxAccountEntries} accounts`)}

	}

	if (config.reporting.onlyAuthenticated) {
		report(true)
	} else {
		// run twice to prevent non-authenticated sites from crowding out the authenticated ones
		report(true)
		report(false)
	}
}


function registerInteraction(url, context) {
	if (context.documentLifecycle && context.documentLifecycle !== 'active' ||
		context.tabId < 0 ||
		ignorelist?.find(url))
	{
		return
	}

	AppStats.incrementInteraction(url)
}


function registerAccountUsage(url, report) {
	debug(`use of account '${report.username}' for ${getSitename(url)}'`)

	const config = Config.forURL(url)
	const domain = getDomainFromUsername(report.username)
	const appName = getSitename(url)
	const app = AppStats.getOrCreateApp(appName)
	app.lastUsed = nowDatestamp()
	app.lastConnected = nowDatestamp()
	app.lastAccount = report.username
	app.isAuthenticated = app.isAuthenticated ?? "auth form submit"

	const account = AppStats.getAccount(app, report.username)
	account.lastConnected = nowDatestamp()

	if (! config.account.checkExternal && isExternalDomain(domain)) {
		return
	}

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
		details?.transitionQualifiers?.includes('server_redirect') ||
		details?.transitionQualifiers?.includes('client_redirect') ||
		details.tabId < 0
	) {
		return
	}

	setInitiator(details)

	registerInteraction(details.url, details)
})

chrome.cookies.onChanged.addListener((changeInfo) => {
	if (changeInfo.removed || changeInfo.cause !== 'explicit' || config.session.maxSessionDays <= 0 || Object.keys(config.session.domains).length === 0)
		return

	const cookie = changeInfo.cookie
	const hostname = cookie.domain.startsWith('.') ? cookie.domain.slice(1) : cookie.domain

	const maxSessionExpirationTimestamp = Math.floor((Date.now() + config.session.maxSessionDays * ONE_DAY) / 1000)
	if (!cookie.expirationDate || cookie.expirationDate <= maxSessionExpirationTimestamp)
		return

	if (matchDomain(cookie.domain, config.session.domains) && ! matchDomain(cookie.domain, config.session.exceptions)) {
		const modifiedCookie = {
			url: `https://${hostname}${cookie.path}`,
			name: cookie.name,
			value: cookie.value,
			path: cookie.path,
			secure: cookie.secure,
			httpOnly: cookie.httpOnly,
			sameSite: cookie.sameSite,
			expirationDate: maxSessionExpirationTimestamp,
			storeId: cookie.storeId
		}

		if (cookie.domain.startsWith('.')) {
			modifiedCookie.domain = hostname
		}

		chrome.cookies.set(modifiedCookie)
	}
})

chrome.runtime.onMessage.addListener(function(request, sender) {
	const siteUrl =  sender.url.toURL()

	if (request.type === "user-interaction") {
		registerInteraction(siteUrl, sender)
	}

	if (request.type === "print-dialog") {
		registerInteraction(siteUrl, sender)

		logger.log(nowTimestamp(), "print dialog", null, siteUrl, Log.INFO, "", "user opened print dialog", sender.origin, sender.tab.id)
	}

	if (request.type === "file-select") {
		registerInteraction(siteUrl, sender)

		logger.log(nowTimestamp(), "file select", request.subtype, siteUrl, Log.INFO, { "file select": request.file }, `user selected file "${request.file.name}"`, null, sender.tab.id)
	}

	if (request.type === "account-usage") {
		registerAccountUsage(siteUrl, request.report)

		const config = Config.forURL(siteUrl)

		if (requiresMFA(siteUrl, config)) {
			const domain = getDomainFromUsername(request.report.username)
			if (! config.account.checkExternal && isExternalDomain(domain)) {
				return
			}

			debug(`MFA required for connection of '${request.report.username}' to ${siteUrl.hostname}`)

			if (request.report.mfa) {
				cancelTimerMFA(siteUrl, 'TOTP in form')
				return
			}

			const app = AppStats.forURL(siteUrl)
			const account = AppStats.getAccount(app, request.report.username)

			if (!isDate(account.lastMFA) || daysSince(account.lastMFA) >= config.account.mfa.maxSessionDays) {
				const showModal = account.lastMFA === undefined
				delete account.lastMFA
				startTimerMFA(sender.url, config.account.mfa.waitMinutes, showModal)
			}
		}
	}

	if (request.type === "request-credential" && request.subtype === "public-key") {
		cancelTimerMFA(siteUrl, "public key auth")
	}


	if (request.type === "allow-mfa") {
		const app = AppStats.forURL(siteUrl)
		const account = AppStats.getAccount(app, app.lastAccount)
		account.lastMFA = nowDatestamp()
		AppStats.markDirty()

		forAllTabs(request.domain, () => location.reload())

		logger.log(nowTimestamp(), "exception", "MFA exception granted", sender.url, Log.ERROR, request.reason, `user requested MFA exception for account ${app.lastAccount} for ${request.domain}`)
	}

	if (request.type === "allow-blacklist") {
		exceptionList.add(request.url.toURL()?.hostname)

		logger.log(nowTimestamp(), "exception", "blacklist exception granted", request.url, Log.ERROR, request.reason, "user requested exception: " + request.description)
	}

})
