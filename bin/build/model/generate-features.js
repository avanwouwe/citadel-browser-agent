const fs = require("fs");
const path = require("path");

(function () {
    const vm     = require("vm");
    const { TextDecoder, TextEncoder } = require("util");

    // Expose essentials to global scope for loaded scripts
    globalThis.vm           = vm;
    globalThis.require      = require;
    globalThis.module       = module;
    globalThis.process      = process;
    globalThis.TextDecoder  = TextDecoder;
    globalThis.TextEncoder  = TextEncoder;
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

    // Give browser-like convenience
    globalThis.window = globalThis;
})();

loadGlobal('../../../utils/unzipit.js')
loadGlobal('../../../utils/trust/extension/babel-parser.js')
loadGlobal('../../../utils/trust/extension/babel-traverse.js')
loadGlobal('../../../utils/trust/extension/babel-generator.js')
loadGlobal('../../../utils/trust/extension/static-analysis.js')
loadGlobal('../../../utils/trust/extension/extension-store.js')

/**
 * Extract background process entry points for MV2 and MV3 extensions.
 * Returns independent results for each version style.
 *
 * @param {string} zipFilename - Path or URL to the .zip/.crx package.
 * @returns {Promise<{
 *   mv2: { entryFiles: string[], fetchFile: Function, manifest: Object },
 *   mv3: { entryFiles: string[], fetchFile: Function, manifest: Object }
 * }>}
 */
async function listScripts(zipFilename) {
    // 1️⃣  Load the extension package
    const file = await fs.readFileSync(zipFilename);
    const buffer = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
    const entries = await ExtensionStore.parsePackage(buffer)

    // 2️⃣  Parse manifest
    const manifest = await ExtensionStore.getManifest(entries)
    console.log(Object.keys(entries).toString())

    // 3️⃣  Define a single fetchFile() usable for both MV2 and MV3
    async function fetchFile(path) {
        const entry =
            entries[path] ||
            entries[`/${path}`] ||
            Object.values(entries).find(e => e.name.endsWith("/" + path));
        if (!entry) throw new Error("File not found in package: " + path);

        return await entry.text();
    }

    // 4️⃣  Get MV2 and MV3 background entries
    const mv2EntryFiles = Array.isArray(manifest.background?.scripts)
        ? manifest.background.scripts
        : [];

    const mv3EntryFiles = manifest.background?.service_worker
        ? [manifest.background.service_worker]
        : [];

    // 5️⃣  Return both
    return {
        mv2EntryFiles,
        mv3EntryFiles,
        fetchFile,
        manifest
    };
}

(async () => {
    const scripts = await listScripts("/Users/arno.vanwouwe/Downloads/citadel/anheildjmkfdkdpgbndmpjnmkfliefga.zip");
    console.dir(scripts, { depth: null, colors: true });

    const analysis = await StaticAnalysis.analyze(scripts.mv3EntryFiles, scripts.fetchFile)
    console.log(analysis)
 //   console.log(await scripts.fetchFile(scripts.mv3EntryFiles[0]))
})();