const fs = require("fs");
const path = require("path");
require('../../../utils/shim-browser-to-node.js')

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