class CombinedBlacklist {
	#blacklists = { }
	#downloadStatus = { }

	static #BLACKLIST_DOWNLOAD_ERRORS = 'blacklist-download-statistics-'
	static #ERROR_REPORTING_FREQ = 20		// perform error reporting only once we're had N downloads


	static TEST_BLACKLIST = '192.0.2.1'

	async load (configs, blacklistClass) {
		async function download(blacklists, conf, status) {
			setTimeout(() => { download(blacklists, conf, status) }, conf.freq * ONE_MINUTE)

			const blacklistName = conf.name

			const failureEvents = new EventAccumulator(
				CombinedBlacklist.#BLACKLIST_DOWNLOAD_ERRORS + blacklistName,
				CombinedBlacklist.#ERROR_REPORTING_FREQ * conf.freq * ONE_MINUTE,
				(eventCount) => {
					const currStatus = status[blacklistName]
					const isLoaded = currStatus === "loaded"
					const errorRate = eventCount / CombinedBlacklist.#ERROR_REPORTING_FREQ

					let level
					if (isLoaded || errorRate <= 0.1) level = Log.TRACE
					else if (errorRate <= 0.25) level = Log.INFO
					else if (errorRate <= 0.75) level = Log.WARN
					else level = Log.ERROR

					logger.log(nowTimestamp(), "report", "blacklist download error", conf.url, level, eventCount, `blacklist '${blacklistName} could not be downloaded ${eventCount} times, current state is '${currStatus}'`)
				})

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

	find(query) {
		if (query === CombinedBlacklist.TEST_BLACKLIST) { return 'test blacklist' }

		for (const [name, blacklist] of Object.entries(this.#blacklists)) {
			if (blacklist.find(query)) {
				return name
			}
		}
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

/**
 * Blacklist that contains a list of URLs and hostnames.
 *
 * It is possible to blacklist an entire domain by adding the name of the domain, or a specific URL by adding the URL.
 *
 * Matching is done in a case-insensitive way.
 */

class URLBlacklist {

	#urlSet = null

	init() {
		this.#urlSet = { }
		return this
	}

	add(entry) {
		this.#urlSet[entry] = true
	}

	remove(entry) {
		delete this.#urlSet[entry]
	}

	async load(url) {
		this.init()

		const lines = await getCached(url).then(res => res.body.pipeThrough(new TextDecoderStream()))

		await processTextStream(lines,line => {
			line = line.toLowerCase()
			this.add(line)
		})

		return this
	}

	/**
	 * Checks if a URL is in the blacklist. Checks:
	 * - the exact URL or hostname
	 * - (in the case of a URL) if the entire domain was blacklisted by a domain-level blacklist-entry
	 * - (in the case of a URL) if the URL was blacklisted, but without the query or hash part
	 * @param {Object} query - a string containing a hostname or URL, or a URL object
	 * @returns {Boolean} - Returns true if a match was found and null if not
	 */

	find(query) {
		assert(this.#urlSet != null, 'blacklist is not loaded')

		if (query instanceof URL) {
			query = new URL(query.href.toLowerCase())
		}

		if (isString(query)) {
			query = query.toLowerCase()

			if (! query.isURL()) {
				return this.#urlSet.hasOwnProperty(query)
			}

			query = query.toURL()
		}

		if (
			this.#urlSet.hasOwnProperty(query.href) ||
			this.#urlSet.hasOwnProperty(query.hostname) ||
			this.#urlSet.hasOwnProperty(`${query.protocol}//${query.hostname}${query.port.length > 0 ? ':' + query.port : ""}${query.pathname}`)
		) {
			return true
		}

		return null
	}

	size() { return Object.keys(this.#urlSet).length }

}