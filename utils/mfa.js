const mfaTimers = {}

/**
 * Expects MFA to occur within N minutes for a specific URL
 * @param {string} url - The URL that triggered the expectation of MFA
 * @param {int} minutes - The number of minutes to wait
 * @param {boolean} showModal - Should a modal window be shown
 * */
function startTimerMFA(url, minutes, showModal) {
    const hostname = getSitename(url)
    const domain = getDomain(hostname)

    if (mfaTimers[domain]) {
        clearTimeout(mfaTimers[domain].timerId)
        delete mfaTimers[domain]
    }

    console.log(`MFA session starting for ${domain}, timer started`)

    const timerId = setTimeout(() => {
        console.log(`MFA timeout for ${domain}`)

        logger.log(nowTimestamp(), "block", "MFA blocked", url, Log.WARN, undefined, `blocked access to ${domain} due to missing MFA`)

        logOffApplication(domain)

        forAllTabs(domain, () => location.reload())

        if (showModal) {
            setTimeout(() => {
                const message = t("mfa.disconnected", { contact: config.company.contact })

                const exceptionMessage = { type: 'allow-mfa', domain }

                blockDomainModal(domain, message, exceptionMessage)
            }, ONE_SECOND)
        }

        delete mfaTimers[domain]
    }, minutes * ONE_MINUTE)

    mfaTimers[domain] = {
        timerId,
        timestamp: Date.now(),
        domain
    }
}

/**
 * Called when MFA timer is cancelled (MFA received or password failed)
 * @param {string} url - The URL of the MFA timer
 * @param {string} reason - The reason the timer was interrupted (TOTP, WebAuth, etc)
 */
function cancelTimerMFA(url, reason) {
    const hostname = getSitename(url)
    const domain = getDomain(hostname)
    const waitingSince = mfaTimers[domain]?.timestamp

    if (!waitingSince) {
        return
    }

    const app = AppStats.forURL(url)
    const account = AppStats.getAccount(app, app.lastAccount)
    account.lastMFA = nowDatestamp()
    AppStats.markDirty()

    const elapsedTime = (Date.now() - waitingSince) / 1000

    debug(`MFA timer for ${domain} cancelled after ${elapsedTime.toFixed(1)} seconds based on ${reason}`)

    clearTimeout(mfaTimers[domain].timerId)
    delete mfaTimers[domain]
}

function requiresMFA(url, config) {
    const hostname = getSitename(url)

    const isRequired = matchDomain(hostname, config.account.mfa.required)
    const isExempted = matchDomain(hostname, config.account.mfa.exceptions)

    return isRequired && !isExempted
}

/**
 * Helper function to log off a specific application by wiping cookies, local storage, etc.
 * @param {string} domain - The domain of application that should be logged off
 */
function logOffApplication(domain) {
    // Remove cookies
    chrome.cookies.getAll({ domain }, (cookies) => {
        cookies.forEach((cookie) => {
            const cookieDetails = {
                url: `http${cookie.secure ? 's' : ''}://${cookie.domain.startsWith('.') ? cookie.domain.substring(1) : cookie.domain}${cookie.path}`,
                name: cookie.name
            }

            chrome.cookies.remove(cookieDetails, () => {
                if (chrome.runtime.lastError) {
                    console.error(`Error removing cookie ${cookie.name}:`, chrome.runtime.lastError)
                }
            })
        })
    })

    // Clear storage, unregister service workers and clear cache
    forAllTabs(domain, () => {
        try {
            localStorage.clear()
            sessionStorage.clear()
            indexedDB?.databases()?.then(dbs => {
                dbs.forEach(db => {
                    indexedDB.deleteDatabase(db.name)
                })
            })
        } catch (e) {
            console.error('Error clearing storage:', e)
        }

        navigator?.serviceWorker.getRegistrations()
            .then(registrations => {
                for (let registration of registrations) {
                    registration.unregister()
                }
            })

        caches?.keys().then(names => {
            for (let name of names) {
                caches.delete(name)
            }
        })
    })
}

chrome.webRequest.onCompleted.addListener(
    function (details) {
        if (details.method !== "POST") return

        setInitiator(details)
        const url = details.url?.toURL()

        if (
            (isMFA(url?.pathname) && details.statusCode >= 200 && details.statusCode < 300) ||
            (findAuthPattern(url?.pathname) && details.statusCode >= 400)
        ) {
            cancelTimerMFA(details.initiator, "POST to MFA-esque URL")
        }
    }, { urls: ["<all_urls>"] }
)