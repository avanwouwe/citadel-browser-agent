console.log("Service worker started.");

importScripts('config.js');
importScripts('utils/definitions.js');
importScripts('utils/utils.js');
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

	const configHash = config?.hashSHA256()

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
	if (alarm.name === Alarm.REPORTING) {
		reportInteractions()
	}

	if (alarm.name === Alarm.CLEANING) {
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
		result.result = "protocol warning"
		result.level = Log.WARN
		result.value = url.protocol
		result.description = `use of protocol type '${url.protocol}'`
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

function logDownload(download, timestamp, result, level, description) {
	// determine an id that is more globally unique than the original id
	const uniqueId = { id: download.id, startTime: download.startTime }.hashCode()

	const url = download.url
	const referrer = download.referrer

	description = description.replace("@@URL@@", logger.maskUrl(download.url, level))

	// do not log data not relevant for security, or duplicate
	delete download.id;
	delete download.url;
	delete download.referrer;
	delete download.finalUrl;
	delete download.paused;
	delete download.state;
	delete download.canResume;

	logger.log(timestamp, "download", result, url, level, { download: download }, description, referrer, uniqueId);
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
const NAVIGATION_SECURITY_WARNING = /_(SSL|CERT|UNSAFE|INSECUR|SECUR|VIRUS|TRUST|CRED)/
const NAVIGATION_BLOCKED = /_(BLOCKED_BY_ADMINISTRATOR|BLOCKED_BY_CLIENT)/

chrome.webNavigation.onErrorOccurred.addListener(
	function (details) {
		if (details.error) {
			if (details.error.match(NAVIGATION_SECURITY_WARNING)) {
				logger.log(nowTimestamp(), "navigate", "navigation error", details.url, Log.WARN , details.error,  `navigation error '${details.error}' when navigating to ${details.url}`, undefined, details.tabId);
			} else if (details.error.match(NAVIGATION_BLOCKED)) {
				logger.log(nowTimestamp(), "navigate", "navigation blocked", details.url, Log.ERROR, details.error,  `browser blocked navigation to ${details.url}`, undefined, details.tabId);
			}
		}
	}, { urls: ["<all_urls>"] }
);



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

const AUTH_COOKIE_PATTERN = /($|&)sessionid|auth|(session|auth(othiri[sz]ation))_?token|jwt|password|secret|login/;
const AUTH_URL_PATTERN = /\/(login|signin|auth|saml|oauth|sso)/;
function isHttpUrl(url) { return url?.startsWith('http') }

function getSitename(url) {
	return isHttpUrl(url) ? new URL(url).hostname : null
}

function getAppname(details, headers) {
	for (header of headers) {
		const headerName = header.name.toLowerCase()
		if (['origin', 'access-control-allow-origin'].includes(headerName)) {
			return header.value.startsWith("http") ? header.value : null;
		}
	}

	if (isHttpUrl(details.initiator)) { return details.initiator; }
}

function markIsAuthenticated(appName, reason) {
	const appStats = APPSTATS.getOrSet(appName, { });

	if (! appStats['isApp']) {
		appStats['isApp'] = reason;
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

const DATE_REGEX = /[0-9]{4}-[0-9]{2}-[0-9]{2}/

function reportInteractions() {
	Config.assertIsLoaded()

	function report(isApp) {
		const usagePerDayPerApp = { }
		const today = nowDatestamp();

		// aggregate interactions per date (only dates in the past)
		for (const [appName, appStats] of Object.entries(APPSTATS)) {
			if ((appStats.isApp === undefined) !== !isApp) { continue; }

			const dailyUsage = appStats.usage ?? {};

			for (const [date, interactions] of Object.entries(dailyUsage)) {
				if (DATE_REGEX.test(date) && date < today) {
					usagePerDayPerApp.getOrSet(date, {})[appName] = interactions
					delete dailyUsage[date];
					APPSTATS.isDirty = true;
				}
			}
		}

		for (const [date, appStats] of Object.entries(usagePerDayPerApp)) {
			Object.entries(appStats)
				.map(([appUrl, interactions]) => ({ appUrl, interactions }))
				.sort((a, b) => b.interactions - a.interactions)
				.slice(0, config.reporting.maxEntries)
				.forEach(it => {
					const appName = getSitename(it.appUrl);
					logger.log(
						`${date}T23:59:59.999Z`,
						'report',
						'usage report',
						it.appUrl,
						Log.INFO,
						it.interactions,
						`'${appName}' received ${it.interactions} interactions on ${date}`
					);
				});
		}
	}

	if (config.reporting.onlyApps) {
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
	dates[today] = currInteractionCount + increment;
	console.log(`incremented ${appName} with ${increment} interactions`);
	APPSTATS.isDirty = true;
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
});
