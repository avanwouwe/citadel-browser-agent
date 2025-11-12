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

        function collectAPIUsage() {
            const calls = new Set();

            for (const { ast } of visited.values()) {
                // map: variable name → possible values (small literal sets only)
                const vars = new Map();

                function getMemberPath(memberExpr) {
                    const chain = [];
                    let node = memberExpr;
                    while (node && node.type === "MemberExpression") {
                        if (node.computed) return null; // skip computed indices for now
                        if (node.property.type === "Identifier") chain.unshift(node.property.name);
                        node = node.object;
                    }
                    return node && node.name ? [node.name, ...chain].join(".") : null;
                }

                function handleNestedPattern(pattern, base) {
                    for (const prop of pattern.properties) {
                        if (prop.type !== "ObjectProperty") continue;
                        const key = prop.key.name || (prop.key.value ?? "");
                        const value = prop.value;

                        if (value.type === "Identifier") {
                            vars.set(value.name, new Set([`${base}.${key}`]));
                        } else if (value.type === "ObjectPattern") {
                            handleNestedPattern(value, `${base}.${key}`);
                        }
                    }
                }

                BabelTraverse.default(ast, {
                    // Capture variable declarations
                    VariableDeclarator(p) {
                        const id = p.node.id;
                        const init = p.node.init;
                        if (!init) return;

                        // 🌟 Object destructuring: const { sendMessage } = chrome.runtime;
                        if (id.type === "ObjectPattern" && init.type === "MemberExpression") {
                            const base = getMemberPath(init);
                            if (base && /^(chrome|navigator|browser|window)\./.test(base)) {
                                handleNestedPattern(id, base);
                            }
                            return;
                        }

                        // simple identifier variable
                        if (id.type === "Identifier") {
                            if (init.type === "MemberExpression") {
                                const path = getMemberPath(init);
                                if (path && /^(chrome|navigator|browser|window)\./.test(path)) {
                                    vars.set(id.name, new Set([path]));
                                    return;
                                }
                            }
                            if (init.type === "StringLiteral") {
                                vars.set(id.name, new Set([init.value]));
                            } else {
                                vars.set(id.name, new Set(["*"]));
                            }
                        }
                    },

                    // Capture assignment expressions (including destructuring)
                    AssignmentExpression(p) {
                        const left = p.node.left;
                        const right = p.node.right;

                        // ({ sendMessage } = chrome.runtime);
                        if (left.type === "ObjectPattern" && right.type === "MemberExpression") {
                            const base = getMemberPath(right);
                            if (base && /^(chrome|navigator|browser|window)\./.test(base)) {
                                handleNestedPattern(left, base);
                            }
                            return;
                        }

                        // x = chrome.runtime.sendMessage;
                        if (left.type === "Identifier") {
                            if (right.type === "MemberExpression") {
                                const path = getMemberPath(right);
                                if (path && /^(chrome|navigator|browser|window)\./.test(path)) {
                                    (vars.get(left.name) || vars.set(left.name, new Set())).add(path);
                                } else {
                                    vars.set(left.name, new Set(["*"]));
                                }
                            } else {
                                vars.set(left.name, new Set(["*"]));
                            }
                        }
                    },

                    // Detect function calls (direct and through variables)
                    CallExpression(p) {
                        const callee = p.node.callee;

                        // --- direct .MemberExpression calls ---
                        if (callee.type === "MemberExpression") {
                            const chain = [];
                            let node = callee;

                            while (node && node.type === "MemberExpression") {
                                if (node.computed) {
                                    if (node.property.type === "StringLiteral") {
                                        chain.unshift(node.property.value);
                                    } else if (node.property.type === "Identifier" && vars.has(node.property.name)) {
                                        for (const val of vars.get(node.property.name))
                                            chain.unshift(val === "*" ? "DYNAMIC" : val);
                                    } else {
                                        chain.unshift("DYNAMIC");
                                    }
                                } else if (node.property.type === "Identifier") {
                                    chain.unshift(node.property.name);
                                }
                                node = node.object;
                            }

                            const rootName = node.name;
                            if (rootName === "chrome" || rootName === "navigator" || rootName === "browser" || rootName === "window") {
                                const path = chain.length ? `${rootName}.${chain.join(".")}` : rootName;
                                calls.add(path);
                                return;
                            }

                            // --- indirect call through aliased object ---
                            if (rootName && vars.has(rootName)) {
                                for (const prefix of vars.get(rootName)) {
                                    if (/^(chrome|navigator|browser|window)\./.test(prefix)) {
                                        const path = chain.length ? `${prefix}.${chain.join(".")}` : prefix;
                                        calls.add(path + ".(via-variable)");
                                    }
                                }
                            }
                        }

                        // --- plain identifier calls, e.g. sendMessage() or alias() ---
                        if (callee.type === "Identifier" && vars.has(callee.name)) {
                            for (const val of vars.get(callee.name)) {
                                if (/^(chrome|navigator|browser|window)\./.test(val)) {
                                    calls.add(val + ".(via-variable)");
                                } else if (val === "*") {
                                    calls.add("chrome.DYNAMIC");
                                }
                            }
                        }
                    },
                });
            }

            // postprocess: coalesce dynamic variants
            const result = Array.from(calls).map(name =>
                name.includes("DYNAMIC") ? name.replace(/\.DYNAMIC.*/, ".DYNAMIC") : name
            );

            return Array.from(new Set(result)).sort();
        }

        // run analysis
        for (const entry of entrypoints) {
            await visit(entry);
        }

        return { ...extractFeatures(), apis: collectAPIUsage(), };
    }
}