class StaticAnalysis {
    static async analyze(entrypoints, fileGetter) {
        const visited = new Map();

        async function visit(id) {
            if (visited.has(id)) return;

            const code = await fileGetter(id);
            if (!code) {
                console.warn(`[StaticAnalysis] missing file: ${id}`);
                return;
            }

            const ast = BabelParser.parse(code, {
                sourceType: "unambiguous",
                allowReturnOutsideFunction: true,
            });

console.log(BabelGenerator.generate(ast).code)

            visited.set(id, { ast, code });

            // find dependencies
            const deps = new Set();
            BabelTraverse.default(ast, {
                ImportDeclaration(p) { deps.add(p.node.source.value); },
                CallExpression(p) {
                    const c = p.node.callee;
                    if (c.type === "Identifier" &&
                        (c.name === "require" || c.name === "importScripts")) {
                        const [arg] = p.node.arguments;
                        if (arg?.type === "StringLiteral") deps.add(arg.value);
                    }
                },
            });

            // recursively visit dependencies
            for (const dep of deps) {
                const resolved = normalizeImport(id, dep);
                await visit(resolved);
            }
        }

        function normalizeImport(from, spec) {
            const base = from.split("/").slice(0, -1).join("/") + "/";
            return new URL(spec, "file://" + base).pathname.slice(1);
        }

        function extractFeatures() {
            let functions = 0;
            let exports = 0;
            for (const { ast } of visited.values()) {
                BabelTraverse.default(ast, {
                    FunctionDeclaration() { functions++; },
                    ArrowFunctionExpression() { functions++; },
                    ExportNamedDeclaration() { exports++; },
                    ExportDefaultDeclaration() { exports++; },
                });
            }
            return { modules: visited.size, functions, exports };
        }

        // run analysis
        for (const entry of entrypoints) {
            await visit(entry);
        }

        return extractFeatures();
    }
}