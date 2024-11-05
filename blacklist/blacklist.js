class CombinedBlacklist {
	#blacklists = { }
	#downloadStatus = { }

	static #BLACKLIST_DOWNLOAD_ERRORS = 'blacklist-download-statistics-'
	static #ERROR_REPORTING_FREQ = ONE_DAY;


	static TEST_IPV4 = '192.0.2.1'
	static TEST_URL  = 'https://192.0.2.1/'


	async load (configs, blacklistClass) {
		async function download(blacklists, conf, status) {
			setTimeout(() => { download(blacklists, conf, status) }, conf.freq * ONE_MINUTE)

			const blacklistName = conf.name

			const failureEvents = new EventAccumulator(CombinedBlacklist.#BLACKLIST_DOWNLOAD_ERRORS + blacklistName, CombinedBlacklist.#ERROR_REPORTING_FREQ, (eventCount) => {
				const currStatus = status[blacklistName]
				const level = currStatus === "loaded" ? Log.WARN : Log.ERROR

				logger.log(nowTimestamp(), "report", "blacklist download error", conf.url, level, eventCount, `blacklist '${blacklistName} could not be downloaded ${eventCount} times, current state is '${currStatus}'`);
			});

			try {
				blacklists[blacklistName] = await new blacklistClass().load(conf.url)
				status[blacklistName] = "loaded"

				const blacklistSize = blacklists[blacklistName].size()
				logger.log(nowTimestamp(), "report", "blacklist downloaded", conf.url, Log.TRACE, blacklistSize, `blacklist '${blacklistName} was loaded with ${blacklistSize} entries`);
			} catch (error) {
				status[blacklistName] = "failed"
				failureEvents.increment()
			}

			failureEvents.report()
		}

		for (const conf of configs) {
			download(this.#blacklists, conf, this.#downloadStatus)
		}

		return this
	}

	find(str) {
		for (const [name, blacklist] of Object.entries(this.#blacklists)) {
			if (blacklist.find(str) != null) {
				return name
			}
		}

		if (str ===	CombinedBlacklist.TEST_IPV4) { return 'test IPV4' }
		if (str === CombinedBlacklist.TEST_URL) { return 'test URL' }
	}
}

class IPBlacklist {

	#sortedCidrList = null

	async load(url) {
		const lines = await getCached(url)
												.then(res => res.body.pipeThrough(new TextDecoderStream()))

		this.#sortedCidrList = await IPv4Range.parseList(lines)
										.then(list => list.sort((a, b) => a.start - b.start))
		return this
	}

	find(ip) {
		assert(this.#sortedCidrList != null, 'blacklist is not loaded')

    	const ipNumber = IPv4Range.stringToNumber(ip);
		if (ipNumber === undefined) {
			return null
		}

    	let low = 0, high = this.#sortedCidrList.length - 1;
    	while (low <= high) {
	    	const mid = Math.floor((low + high) / 2);
	    	const cidr = this.#sortedCidrList[mid];
   	     
   	     	if (cidr.contains(ipNumber)) {
   	     		return cidr;
   	     	}
   	     
   	     	if (ipNumber < cidr.start) {
   	     		high = mid - 1;
   	     	} else {
   	     		low = mid + 1;
   	     	}
   	     }

		return null;
	}

	size() { return this.#sortedCidrList.length }
}

class URLBlacklist {
	
	#urlSet = null

	async load(url) {
		const lines = await getCached(url).then(res => res.body.pipeThrough(new TextDecoderStream()))

		const buffer = { }

		await processTextStream(lines,line => { buffer[line] = true })

		this.#urlSet = buffer

		return this
	}
	
	find(url) {
		assert(this.#urlSet != null, 'blacklist is not loaded')

		if (this.#urlSet.hasOwnProperty(url)) {
			return true
		}

		return null
	}

	size() { return Object.keys(this.#urlSet).length }

}