class CombinedBlacklist {
	#blacklists = { }
	#downloadStatus = { }

	static #BLACKLIST_DOWNLOAD_ERRORS = 'blacklist-download-statistics-'
	static #ERROR_REPORTING_FREQ = 20		// perform error reporting only once we've had N downloads


	static TEST_BLACKLIST = '192.0.2.1'

	async load (configs, blacklistClass) {
		async function download(blacklists, filename, url, freq, status) {
			setTimeout(() => { download(blacklists, filename, url, freq, status) }, freq * ONE_MINUTE)
			const failureEvents = new EventAccumulator(
				CombinedBlacklist.#BLACKLIST_DOWNLOAD_ERRORS + filename,
				CombinedBlacklist.#ERROR_REPORTING_FREQ * freq * ONE_MINUTE,
				(eventCount) => {
					const currStatus = status[filename]
					const isLoaded = currStatus === "loaded"
					const errorRate = eventCount / CombinedBlacklist.#ERROR_REPORTING_FREQ

					let level
					if (isLoaded || errorRate <= 0.1) level = Log.TRACE
					else if (errorRate <= 0.25) level = Log.INFO
					else if (errorRate <= 0.75) level = Log.WARN
					else level = Log.ERROR

					logger.log(nowTimestamp(), "report", "blacklist download error", url, level, eventCount, `blacklist '${filename} could not be downloaded ${eventCount} times, current state is '${currStatus}'`)
				})

			try {
				blacklists[filename] = await new blacklistClass().load(url)
				status[filename] = "loaded"

				const blacklistSize = blacklists[filename].size()
				logger.log(nowTimestamp(), "report", "blacklist downloaded", url, Log.TRACE, blacklistSize, `blacklist '${filename} was loaded with ${blacklistSize} entries`);
			} catch (error) {
				status[filename] = "failed"
				failureEvents.increment()
			}

			failureEvents.report()
		}

		await Promise.allSettled(
			Object.entries(configs).map(([blacklistName, conf]) =>
				conf.urls.map(async (url, i) => {
					const fileCnt = conf.urls.length
					const filename = fileCnt > 1 ? `${blacklistName} [${i+1} / ${fileCnt}]` : blacklistName
					await download(this.#blacklists, filename, url, conf.freq, this.#downloadStatus)
				})
			).flat()
		)

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

	#sort() {
		this.#sortedCidrList.sort((a,b) => a.start - b.start || a.end - b.end)
	}

	init() {
		if (!this.#sortedCidrList) {
			this.#sortedCidrList = []
		}

		return this
	}

	add(cidr) {
		this.init()

		this.#sortedCidrList.push(new IPv4Range(cidr))
		this.#sort()
	}

	remove(cidrStr) {
		assert(this.#sortedCidrList != null, 'blacklist is not loaded')

		const cidr = new IPv4Range(cidrStr)
		this.#sortedCidrList = this.#sortedCidrList.filter(entry => entry.start = cidr.start && entry.end === cidr.end)
	}

	async load(url) {
		const lines = await getCached(url)
												.then(res => res.body.pipeThrough(new TextDecoderStream()))

		this.#sortedCidrList = await IPv4Range.parseStream(lines)
		this.#sort()

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

	static #SUPPORTED_URL_SCHEMES = ["https:", "http:", "wss:", "ws:", "ftp:"]

	#urlSet = null

	init() {
		if (! this.#urlSet) {
			this.#urlSet = { }
		}

		return this
	}

	add(entry) {
		this.init()

		this.#urlSet[entry] = true
	}

	remove(entry) {
		assert(this.#urlSet != null, 'blacklist is not loaded')

		delete this.#urlSet[entry]
	}

	async load(url) {
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

		if (query === undefined) return null

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

		if (! query.protocol in URLBlacklist.#SUPPORTED_URL_SCHEMES) {
			return null
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