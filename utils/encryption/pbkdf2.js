class PBKDF2 {

    static toBase64(bytes) {
        if (bytes instanceof ArrayBuffer) bytes = new Uint8Array(bytes)
        return btoa(String.fromCharCode.apply(null, bytes))
    }

    static fromBase64(b64) {
        var binary = atob(b64)
        var bytes = new Uint8Array(binary.length)
        for (var i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i)
        }
        return bytes
    }

    static genSalt() { return crypto.getRandomValues(new Uint8Array(16)) }

    static async hash(input, salt, iterations = 100000) {
        const encoder = new TextEncoder()

        const keyMaterial = await crypto.subtle.importKey(
            'raw',
            encoder.encode(input),
            'PBKDF2',
            false,
            ['deriveBits', 'deriveKey']
        )

        const hash = await crypto.subtle.deriveBits({
                name: 'PBKDF2',
                salt,
                iterations,
                hash: 'SHA-512'
            },
            keyMaterial,
            512
        )

        return { hash: PBKDF2.toBase64(hash), salt: PBKDF2.toBase64(salt) }
    }
}

