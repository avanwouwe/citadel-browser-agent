console.log("Service worker started.");

importScripts('config.js');
importScripts('utils/definitions.js');
importScripts('utils/utils.js');
importScripts('utils/passwords.js');
importScripts('utils/eventaccumulator.js');
importScripts('utils/alarm.js');
importScripts('utils/schedule.js');
importScripts('utils/persistence.js');
importScripts('utils/messaging.js');
importScripts('utils/logging.js');
importScripts('gui/interface.js');
importScripts('blacklist/blacklist.js');
importScripts('blacklist/ignorelist.js');
importScripts('blacklist/ipv4range.js');


let PROFILE_ADDRESS
if (chrome.identity.getProfileUserInfo) {
	chrome.identity.getProfileUserInfo((userInfo) => {
		PROFILE_ADDRESS = userInfo?.email
	})
}

let blacklistIP
let blacklistURL
let ignorelist

const APPLICATION_STATISTICS_KEY = 'application-statistics'
const SITE_STATISTICS_KEY = 'site-statistics'

const SITESTATS = new PersistentObject(SITE_STATISTICS_KEY).value();
const APPSTATS = new PersistentObject(APPLICATION_STATISTICS_KEY).value();


Port.onMessage("config",(newConfig) => {
	Config.load(newConfig)

	new CombinedBlacklist().load(config.blacklist.ip, IPBlacklist).then(blacklist => blacklistIP = blacklist)
	new CombinedBlacklist().load(config.blacklist.url, URLBlacklist).then(blacklist => blacklistURL = blacklist)
	ignorelist = new Ignorelist()

	APPSTATS.isInstalled = true          // Native Messaging was installed, from now on connection errors are reported

	const configHash = config?.hashDJB2()

	logger.log(nowTimestamp(), "agent start", "start", undefined, Log.INFO, configHash, `browser agent started with config ${configHash}`, )
})

chrome.runtime.onUpdateAvailable.addListener(() => {
	reportInteractions()

	Alarm.clear()

	// clear all storage except for application statistics
	const appStats = new PersistentObject(APPLICATION_STATISTICS_KEY)
	chrome.storage.local.clear()
	appStats.markDirty()

	chrome.runtime.reload();
});

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
		for (const [appName, app] of Object.entries(APPSTATS)) {
			// purge applications if they haven't been used for a while
			if (daysSince(app.lastUsed) > config.application.retentionDays) {
				delete APPSTATS[appName]
				continue
			}

			// purge accounts if they haven't been used for a while
			const accounts = app.getOrSet("accounts", {})
			for (const [username, issues] of Object.entries(accounts)) {
				if (daysSince(issues.lastConnected) > config.account.retentionDays) {
					delete accounts[username]
				}
			}
		}

		// reset daily counters interactions with sites not (yet) allocated to applications
		for (const stats of Object.values(SITESTATS)) {
			stats.interactions = 0
		}

		SITESTATS.isDirty = true

		reportInteractions()
	}

	if (alarm.name === Alarm.BIWEEKLY) {
		reportApplications()
	}

	if (alarm.name === Alarm.MONTHLY) {
		// purge site statistics to prevent build-up of data and reset classifications
		const siteStats = new PersistentObject(SITE_STATISTICS_KEY)
		siteStats.clear()

		chrome.runtime.reload();
	}
});


function evaluateRequest(details) {
	const { ip, initiator } = details;
	const url = new URL(details.url);
	const isNavigate = details.method === undefined

	if (ignorelist?.find(details.url) ||
		details.tabId < 0 ||
		!isNavigate && ignorelist?.find(initiator)
	) return { result: "ignored" }

	const result = {
		result: "allowed",
		level: isNavigate ? Log.DEBUG : Log.TRACE
	}

	if (config.warningProtocols.includes(url.protocol)) {
		const siteName = getSitename(initiator)
		const appName = SITESTATS[siteName]?.appName
		const app = APPSTATS[appName]

		if (app?.isAuthenticated) {
			result.result = "protocol warning"
			result.level = Log.WARN
			result.value = url.protocol
			result.description = `use of protocol type '${url.protocol}' by '${appName}'`
		}
	}

	if (url.password.isNotEmpty()) {
		result.result = "URL auth warning"
		result.level = Log.WARN
		result.value = url.username
		result.description = `password of '${url.username}' in URL`
	}

	let blacklist = blacklistURL?.find(url.href)
	if (blacklist) {
		result.result = isNavigate ? "navigation blacklisted" : "request blacklisted"
		result.level = Log.ERROR
		result.value = url.href
		result.description = `${result.result} due to URL on blacklist '${blacklist}'`
	}

	blacklist = blacklistIP?.find(ip)
	if (blacklist) {
		result.result = isNavigate ? "navigation blacklisted" : "request blacklisted"
		result.level = Log.ERROR
		result.value = ip
		result.description = `${result.result} due to IP on blacklist '${blacklist}'`
	}

	return result
}

chrome.webNavigation.onBeforeNavigate.addListener((details) => {
	if (details.frameType !== 'outermost_frame' || details.documentLifecycle !== 'active') {
		return
	}

	const timestamp = timestampToISO(details.timeStamp)
	const evaluation = evaluateRequest(details);

	switch (evaluation.result) {
		case "ignored":
			return;
		case "navigation blacklisted":
			blockPage(details.tabId, evaluation.description, evaluation.value);
	}

	logger.log(timestamp, "navigate", evaluation.result, details.url, evaluation.level, evaluation.value, evaluation.description, undefined,  details.tabId);

}, { urls: ["<all_urls>"] });


chrome.webRequest.onBeforeRequest.addListener((details) => {
	const timestamp = timestampToISO(details.timeStamp)
	const evaluation = evaluateRequest(details);

	switch (evaluation.result) {
		case "ignored":
			return;
		case "request blacklisted":
			blockPage(details.tabId, evaluation.description, evaluation.value);
	}

	logger.log(timestamp, "request", evaluation.result, details.url, evaluation.level, evaluation.value, evaluation.description, details.initiator, details.tabId);

},  { urls: ["<all_urls>"] });


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

	logger.log(timestamp, "download", result, url, level, { download }, description, referrer, uniqueId);
}

chrome.downloads.onChanged.addListener((delta) => {
	if (delta.state && delta.state.current === 'complete') {
		getDownload(delta.id).then(download => {
			logDownload(download, download.endTime, "download completed", Log.INFO, `completed download of @@URL@@ to '${download.filename}'`);
		});
	}

	if (delta.danger) {
		const danger = delta.danger.current
		switch (danger) {
			case 'safe':
				break;
			case 'deepScannedFailed':
			case 'accepted':
				getDownload(delta.id).then(download => {
					logDownload(download, nowTimestamp(), "download accepted", Log.ERROR, `user accepted danger of type '${delta.danger.current}' of download of @@URL@@`);
				});
				break;
			default:
				getDownload(delta.id).then(download => {
					logDownload(download, nowTimestamp(), "download warned", Log.WARN, `user notified danger of type '${danger}' of download of @@URL@@`);
				});
		}
	}

	if (delta.error) {
		const error = delta.error.current
		switch (error) {
			case 'FILE_VIRUS_INFECTED':
			case 'FILE_BLOCKED':
			case 'FILE_SECURITY_CHECK_FAILED':
				getDownload(delta.id).then(download => {
					logDownload(download, nowTimestamp(), "download blocked", Log.WARN, `navigator blocked of type '${error}' of download of @@URL@@`);
				});
				break;
			default:
		}
	}

});

// only raise errors that deal with security issues, such as virus or SSL
// for the full list of errors see : chrome://network-errors/
const NAVIGATION_BLOCKED = /_(BLOCKED_BY_ADMINISTRATOR|BLOCKED_BY_CLIENT|BLOCKED_BY_PRIVATE_NETWORK_ACCESS_CHECKS|KNOWN_INTERCEPTION_BLOCKED|UNWANTED|VIRUS|MALWARE|PHISHING|HARMFUL|CRYPTOMINING)/
const NAVIGATION_SECURITY_WARNING = /_(SSL|CERT|UNSAFE|BLOCKED|INSECUR|SECUR|TRUST|CMS_VERIFY)/
function handleError(details) {
	if (details.error) {
		if (details.error.match(NAVIGATION_BLOCKED)) {
			logger.log(nowTimestamp(), "navigate", "navigation blocked", details.url, Log.ERROR, details.error,  `browser blocked navigation to ${details.url}`, undefined, details.tabId)
		} else if (details.error.match(NAVIGATION_SECURITY_WARNING)) {
			logger.log(nowTimestamp(), "navigate", "navigation error", details.url, Log.WARN , details.error,  `navigation error '${details.error}' when navigating to ${details.url}`, undefined, details.tabId)
		}
	}

}
chrome.webNavigation.onErrorOccurred.addListener(handleError);

chrome.webRequest.onErrorOccurred.addListener(handleError, { urls: ["<all_urls>"] });


const KNOWN_AUTH_HEADERS = {
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
const AUTH_COOKIE_PATTERN = /($|&)sessionid|auth|(session|auth(othiri[sz]ation))_?token|jwt|password|secret|login/
const AUTH_URL_PATTERN = /\/(login|signin|auth|saml|oauth|sso)/

function isHttpUrl(url) { return url?.startsWith('http') }


function getAppname(details, headers) {
	for (header of headers) {
		const headerName = header.name.toLowerCase()
		if (['origin', 'access-control-allow-origin'].includes(headerName)) {
			return header.value.startsWith("http") ? getSitename(header.value) : null;
		}
	}

	if (isHttpUrl(details.initiator)) { return getSitename(details.initiator); }
}

function markIsAuthenticated(appName, reason) {
	const appStats = APPSTATS.getOrSet(appName, { });
	appStats.lastUsed = nowDatestamp();

	if (! appStats['isAuthenticated']) {
		appStats['isAuthenticated'] = reason;
		APPSTATS.isDirty = true;
	}
}

function detectAuthentication(appName, details, headers) {
	if (!appName) {
		return;
	}

	const urlMatch = details.url.match(AUTH_URL_PATTERN)
	if (urlMatch) {
		return markIsAuthenticated(appName, 'url:' + urlMatch[0])
	}

	for (let header of headers) {
		const headerName = header.name.toLowerCase()

		if (KNOWN_AUTH_HEADERS[headerName]) {
			return markIsAuthenticated(appName, 'header:' + headerName)
		}
		if (headerName === 'cookie') {
			const cookieMatch = header.value.toLowerCase().match(AUTH_COOKIE_PATTERN)
			if (cookieMatch) {
				return markIsAuthenticated(appName, 'cookie:' + cookieMatch[0])
			}
		}
	}
}


function reportInteractions() {
	Config.assertIsLoaded()

	function report(isAuthenticated) {
		const usagePerDayPerApp = { }
		const today = nowDatestamp();

		// aggregate interactions per date (only dates in the past)
		for (const [appName, appStats] of Object.entries(APPSTATS)) {
			if ((appStats.isAuthenticated === undefined) !== !isAuthenticated) { continue; }

			const dailyUsage = appStats.usage ?? {};

			for (const [date, interactions] of Object.entries(dailyUsage)) {
				if (isDate(date) && date < today) {
					usagePerDayPerApp.getOrSet(date, {})[appName] = interactions
					delete dailyUsage[date];
					APPSTATS.isDirty = true;
				}
			}
		}

		for (const [date, appStats] of Object.entries(usagePerDayPerApp)) {
			Object.entries(appStats)
				.map(([appName, interactions]) => ({ appName, interactions }))
				.sort((a, b) => b.interactions - a.interactions)
				.slice(0, config.reporting.maxInteractionEntries)
				.forEach(it => {
					logger.log(
						`${date}T23:59:59.999Z`,
						'report',
						'usage report',
						"https://" + it.appName,
						Log.INFO,
						it.interactions,
						`'${it.appName}' received ${it.interactions} interactions on ${date}`
					);
				});
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

		for (const [appName, app] of Object.entries(APPSTATS)) {
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

			const accounts = app.getOrSet("accounts", {})
			for (const [username, issues] of Object.entries(accounts)) {
				const domain = getDomainFromUsername(username)
				if (issues && ! ignorePersonalAccount(domain)) {
					topIssues.push(mergeDeep(issues,{
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
			});

		const lostAccounts = appCnt - config.reporting.maxAccountEntries
		if (lostAccounts > 0) {
			logger.log(nowTimestamp(), "report", "accounts lost", undefined, Log.ERROR, lostAccounts, `${lostAccounts} account reports were lost, exceeded maximum of ${config.reporting.maxAccountEntries} accounts`);
		}

		const lostIssues = topIssues.length - config.reporting.maxAccountEntries
		if (lostIssues > 0) {
			logger.log(nowTimestamp(), "report", "issues lost", undefined, Log.ERROR, lostIssues, `${lostIssues} account issues were lost, exceeded maximum of ${config.reporting.maxAccountEntries} issues`);
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


chrome.webRequest.onAuthRequired.addListener(
	function(details) {
		const appName = getAppname(details, details.responseHeaders);

		markIsAuthenticated(appName)
	},
	{ urls: ["<all_urls>"] } , ["responseHeaders"]
);


chrome.webRequest.onSendHeaders.addListener(
	function(details) {
		if (details.initiator === undefined ||
			details.frameType !== 'outermost_frame' ||
			details.tabId < 0)
		{
			return;
		}

		const appName = getAppname(details, details.requestHeaders);

		if (appName) {
			detectAuthentication(appName, details, details.requestHeaders);
			assignAppToSite(appName, details.initiator)
		}
	}, { urls: ["<all_urls>"] }, ["requestHeaders", "extraHeaders"]
);

chrome.webRequest.onHeadersReceived.addListener(
	function(details) {
		if (details.initiator === undefined ||
			details.frameType !== 'outermost_frame' ||
			details.tabId < 0)
		{
			return;
		}

		const appName = getAppname(details, details.responseHeaders)

		if (appName) {
			detectAuthentication(appName, details, details.responseHeaders);
			assignAppToSite(appName, details.initiator)
		}
	},  { urls: ["<all_urls>"] }, ["responseHeaders", "extraHeaders"]
);


function assignAppToSite(appName, url) {
	const site = SITESTATS.getOrSet(getSitename(url), { });
	const prevAppName = site.appName;
	site.appName = appName;

	if (appName !== prevAppName) {
		if (prevAppName) {
			console.error(`${site} changed from ${prevAppName} to ${appName}`);
		}
		SITESTATS.isDirty = true;
	}

	if (site.interactions > 0) {
		incrementInteractionCounter(appName, site.interactions);
		site.interactions = 0;
		SITESTATS.isDirty = true;
	}
}


function registerInteraction(url, context) {
	if (context.documentLifecycle !== 'active' ||
		context.tabId < 0 ||
		ignorelist?.find(context.url))
	{
		return;
	}

	const site = SITESTATS.getOrSet(getSitename(url), { interactions: 0 });
	const appName = site.appName;

	if (appName) {
		incrementInteractionCounter(appName);
	} else {
		site.interactions++;
		SITESTATS.isDirty = true;
	}
}

function incrementInteractionCounter(appName, increment = 1) {
	const today = nowDatestamp();
	const appStats = APPSTATS.getOrSet(appName, { });
	const dates = appStats.getOrSet('usage', { });
	const currInteractionCount = dates.getOrSet(today, 0);
	appStats.lastUsed = today
	dates[today] = currInteractionCount + increment;
	APPSTATS.isDirty = true;

	console.log(`incremented ${appName} with ${increment} interactions`);
}

function registerAccountUsage(url, report) {
	if (ignorePersonalAccount(report.domain)) {
		return
	}

	const siteName = getSitename(url)
	const appName = SITESTATS[siteName]?.appName
	const appStats = APPSTATS.getOrSet(appName, {})
	appStats.lastUsed = nowDatestamp()
	appStats.lastConnected = nowDatestamp()
	appStats.lastAccount = report.username

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
	issues.domain = report.domain
	issues.lastConnected = nowDatestamp()

	const accounts = appStats.getOrSet('accounts', {})
	accounts[report.username] = issues.count > 0 ? issues : null
	APPSTATS.isDirty = true
}

chrome.webNavigation.onCommitted.addListener((details) => {
	if (details.transitionType === 'auto_subframe' ||
		details.transitionType === 'generated' ||
		details.transitionType === 'reload' ||
		details.transitionQualifiers === 'server_redirect' ||
		details.transitionQualifiers === 'client_redirect' ||
		details.tabId < 0
	) {
		return;
	}
	registerInteraction(details.url, details);
});


chrome.runtime.onMessage.addListener(function(request, sender) {
	if (request.type === "user-interaction") {
		registerInteraction(sender.url, sender);
	}

	if (request.type === "print-dialog") {
		registerInteraction(sender.url, sender);

		logger.log(nowTimestamp(), "print dialog", null, sender.url, Log.INFO, "", "user opened print dialog", sender.origin, sender.tab.id);
	}

	if (request.type === "file-select") {
		registerInteraction(sender.url, sender);

		logger.log(nowTimestamp(), "file select", request.subtype, sender.url, Log.INFO, { "file select": request.file }, `user selected file "${request.file.name}"`, null, sender.tab.id);
	}

	if (request.type === "account-usage") {
		registerAccountUsage(sender.url, request.report);
	}

});
