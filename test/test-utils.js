// ─── Tiny test framework ─────────────────────────────────────────────────────
(function () {
    const registered = [];

    // Define a global `check()` that auto-registers each test
    globalThis.check = function (name, fn) {
        registered.push({ name, fn });
    };

    globalThis.assertEqual = function (actual, expected, message) {
        const a = JSON.stringify(actual);
        const e = JSON.stringify(expected);
        if (a !== e)
            throw new Error(`${message || "assertEqual failed"}\nExpected: ${e}\nActual:   ${a}`);
    };

    globalThis.assertTrue = function (cond, message) {
        if (!cond) throw new Error(message || "assertTrue failed");
    };

    async function runAll() {
        let passed = 0;
        for (const { name, fn } of registered) {
            try {
                await fn();
                console.log(`✅ ${name}`);
                passed++;
            } catch (err) {
                console.error(`❌ ${name}\n   ${err.message}`);
            }
        }
        console.log(`\n${passed}/${registered.length} tests passed`);
    }

    // Run automatically on next tick
    Promise.resolve().then(runAll);
})();


async function simpleCheck(name, code, required = "chrome.runtime.sendMessage", forbidden = []) {
    check(name, async () => {
        const files = { "main.js": code };
        const result = await StaticAnalysis.analyze(["main.js"], id => files[id], true)

        // Check required APIs (presence)
        if (required) {
            const requiredApis = Array.isArray(required) ? required : [required];
            if (!requiredApis.some(req => result.apis.includes(req))) {
                throw new Error(`Expected APIs not found: ${JSON.stringify(result.apis)}`);
            }
        }

        // Check forbidden APIs (absence)
        if (forbidden.length > 0 || typeof forbidden === 'string') {
            const forbiddenApis = Array.isArray(forbidden) ? forbidden : [forbidden];

            // Special case: "*" means no APIs should be detected at all
            if (forbiddenApis.includes("*")) {
                if (result.apis.length > 0) {
                    throw new Error(`Expected no APIs but found: ${JSON.stringify(result.apis)}`);
                }
            } else {
                const foundForbidden = forbiddenApis.filter(api => result.apis.includes(api));
                if (foundForbidden.length > 0) {
                    throw new Error(`Unexpected APIs found: ${JSON.stringify(foundForbidden)} in ${JSON.stringify(result.apis)}`);
                }
            }
        }
    });
}