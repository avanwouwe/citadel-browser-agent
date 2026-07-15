class CombinedBlacklist {
	#blacklists = { }
	#downloadStatus = { }

	static #BLACKLIST_DOWNLOAD_ERRORS = 'blacklist-download-statistics-'

	static TEST_BLACKLIST = '192.0.2.1'

	async load(configs, blacklistClass) {
		const tasks = Object.entries(configs).flatMap(([blacklistName, conf]) =>
			conf.urls.map((url, i) => {
				const fileCnt = conf.urls.length
				const filename = fileCnt > 1 ? `${blacklistName} [${i + 1} / ${fileCnt}]` : blacklistName

				return scheduleReload({
					errorKey: CombinedBlacklist.#BLACKLIST_DOWNLOAD_ERRORS + filename,
					errorTag: "blacklist download error",
					label: `blacklist '${filename}'`,
					url,
					freqMin: conf.freq,
					getStatus: () => this.#downloadStatus[filename],
					onError: () => { this.#downloadStatus[filename] = "failed" },
					load: async () => {
						const blacklist = await new blacklistClass().load(url)
						this.#blacklists[filename] = blacklist
						this.#downloadStatus[filename] = "loaded"

						const size = blacklist.size()
						logger.log(nowTimestamp(), "report", "blacklist downloaded", url, Log.TRACE, size,
							`blacklist '${filename}' was loaded with ${size} entries`)
					},
				})
			})
		)

		await Promise.allSettled(tasks)
		return this
	}

	find(query) {
		if (query === CombinedBlacklist.TEST_BLACKLIST) return { name: 'test blacklist', entry: query }

		for (const [name, blacklist] of Object.entries(this.#blacklists)) {
			const entry = blacklist.find(query)
			if (entry) {
				return { name, entry }
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
   	     		return ip;
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
	 * @returns {String} - Returns the matching URL or hostname if found, or null if not
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
				return this.#urlSet.hasOwnProperty(query) ? query : null
			}

			query = query.toURL()
		}

		if (! query.protocol in URLBlacklist.#SUPPORTED_URL_SCHEMES) {
			return null
		}

		if (this.#urlSet.hasOwnProperty(query.href)) return query.href
		if (this.#urlSet.hasOwnProperty(query.hostname)) return query.hostname
		const baseUrl = `${query.protocol}//${query.hostname}${query.port.length > 0 ? ':' + query.port : ""}${query.pathname}`
		if (this.#urlSet.hasOwnProperty(baseUrl)) return baseUrl

		return null
	}

	size() { return Object.keys(this.#urlSet).length }

}