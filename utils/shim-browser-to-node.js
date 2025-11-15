const fs   = require("fs");
const path = require("path");
const vm   = require("vm");

(function () {

    // Expose essentials to global scope for loaded scripts
    globalThis.vm           = vm;
    globalThis.require      = require;
    globalThis.module       = module;
    globalThis.process      = process;
    globalThis.dynamicRequire = (_mod, name) => require(name);

    // Sequential shared-global loader
    globalThis.loadGlobal = function (filePath) {
        const absPath = path.resolve(filePath);
        const code = fs.readFileSync(absPath, "utf8");
        vm.runInThisContext(code, { filename: absPath });
        return globalThis;
    };

    // Polyfill fetch for local files (sync read is fine here)
    const originalFetch = globalThis.fetch;

    globalThis.fetch = async function (url, options) {
        const urlStr = String(url);
        if (!urlStr.startsWith("http://") && !urlStr.startsWith("https://")) {
            const filePath = urlStr.replace(/^file:\/\//, "");
            const absPath = path.resolve(filePath);

            try {
                const content = await fs.readFile(absPath);
                return {
                    ok: true,
                    status: 200,
                    statusText: "OK",
                    headers: new Map(),
                    text: async () => content.toString("utf8"),
                    json: async () => JSON.parse(content.toString("utf8")),
                    arrayBuffer: async () =>
                        content.buffer.slice(content.byteOffset, content.byteOffset + content.byteLength),
                    blob: async () => content,
                };
            } catch (err) {
                return {
                    ok: false,
                    status: 404,
                    statusText: "Not Found",
                    text: async () => "",
                    json: async () => { throw err; },
                };
            }
        }

        if (typeof originalFetch === "function")
            return originalFetch(url, options);

        throw new Error("fetch() not available for HTTP(S) URLs in this Node version");
    };

    globalThis.window = globalThis;
})();
