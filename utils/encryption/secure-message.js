class SecureMessage {
    static MAX_PAYLOAD_LENGTH = 190     // RSA-OAEP max = modulusBytes(256) - 2*hashLen(32) - 2 = 190
    static CHANNEL_NAME = "SecureMessage"
    static publicKey
    static #privateKey

    static async getPublicKey() {
        if (Context.isServiceWorker())  return SecureMessage.publicKey
        if (Context.isContentScript())  return chrome.storage.session.get("SecureMessageKey").then(data => data.SecureMessageKey)

        debug("method cannot be called in this context")
    }

    static async encrypt(msg, publicKey) {
        const encoded = new TextEncoder().encode(JSON.stringify(msg))

        if (encoded.length > SecureMessage.MAX_PAYLOAD_LENGTH) {
            throw new Error(`payload too large: ${encoded.length} bytes (max ${SecureMessage.MAX_PAYLOAD_LENGTH})`)
        }

        publicKey = await crypto.subtle.importKey(
            "jwk", publicKey,
            { name: "RSA-OAEP", hash: "SHA-256" },
            false, ["encrypt"]
        )

        const encrypted = await crypto.subtle.encrypt(
            { name: "RSA-OAEP" },
            publicKey,
            encoded
        )

        return Array.from(new Uint8Array(encrypted))
    }

    static async decrypt(payload) {
        assert(Context.isServiceWorker(), "method can only be called from service worker context")
        assert(SecureMessage.#privateKey, "private key not initialized")

        const decrypted = await crypto.subtle.decrypt(
            { name: "RSA-OAEP" },
            SecureMessage.#privateKey,
            new Uint8Array(payload)
        )

        return JSON.parse(new TextDecoder().decode(decrypted))
    }

    static async sendMessage(type, msg, publicKey) {
        msg = structuredClone(msg)
        msg.type = type
        const payload = await SecureMessage.encrypt(msg, publicKey)
        const encryptedMsg = { channel: SecureMessage.CHANNEL_NAME, type, payload }

        if (Context.isPageScript()) {
            window.postMessage(encryptedMsg, window.location.origin)
        } else if (Context.isContentScript()) {
            return callServiceWorker(type, encryptedMsg)
        } else {
            throw new Error("method cannot be called in this context")
        }
    }

    static listenTo(type, handler) {
        assert(Context.isServiceWorker(), "method can only be called from service worker context")

        Bridge.listenTo(type, async (msg, sender) => {
            assert(msg.channel === SecureMessage.CHANNEL_NAME, "secure handler received insecure message")

            const decryptedMsg = await SecureMessage.decrypt(msg.payload)
            return handler(decryptedMsg, sender)
        })
    }

    static {
        if (Context.isServiceWorker()) {
            SecureMessage.publicKey = crypto.subtle.generateKey(
                { name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
                false,
                ["encrypt", "decrypt"]
            ).then(async keyPair => {
                SecureMessage.#privateKey = keyPair.privateKey
                const publicKey = await crypto.subtle.exportKey("jwk", keyPair.publicKey)
                await chrome.storage.session?.setAccessLevel?.({accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' })
                await chrome.storage.session.set({ SecureMessageKey: publicKey })
                return publicKey
            })
        }

        if (Context.isContentScript()) {
            window.addEventListener("message", async function(event) {
                if (event.source !== window || event.origin !== window.location.origin) return
                if (event.data?.channel !== SecureMessage.CHANNEL_NAME) return

                sendMessage(event.data?.type, event.data)
            })
        }
    }
}