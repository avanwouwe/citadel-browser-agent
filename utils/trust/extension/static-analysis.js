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

                // Helper: try to evaluate simple expressions to strings
                function tryEvaluate(node) {
                    if (node.type === "StringLiteral") return node.value;
                    if (node.type === "NumericLiteral") return String(node.value);
                    if (node.type === "BinaryExpression" && node.operator === "+") {
                        const left = tryEvaluate(node.left);
                        const right = tryEvaluate(node.right);
                        if (left !== null && right !== null) return left + right;
                    }
                    return null;
                }

                function getMemberPath(memberExpr) {
                    const chain = [];
                    let node = memberExpr;
                    let hasDynamic = false;

                    while (node && node.type === "MemberExpression") {
                        if (node.computed) {
                            // Try to evaluate computed property
                            const evaluated = tryEvaluate(node.property);
                            if (evaluated !== null) {
                                chain.unshift(evaluated);
                            } else if (node.property.type === "Identifier" && vars.has(node.property.name)) {
                                // Variable used as computed property
                                const values = vars.get(node.property.name);
                                if (values.size === 1 && !values.has("*")) {
                                    const val = Array.from(values)[0];
                                    chain.unshift(val);
                                } else {
                                    chain.unshift("DYNAMIC");
                                    hasDynamic = true;
                                }
                            } else {
                                chain.unshift("DYNAMIC");
                                hasDynamic = true;
                            }
                        } else if (node.property.type === "Identifier") {
                            chain.unshift(node.property.name);
                        }
                        node = node.object;
                    }

                    if (node && node.type === "Identifier") {
                        const rootName = node.name;

                        // Check if root is a known global chrome accessor
                        if (rootName === "chrome" || rootName === "navigator" || rootName === "browser") {
                            return {
                                path: chain.length ? `${rootName}.${chain.join(".")}` : rootName,
                                hasDynamic
                            };
                        }

                        if (rootName === "window" || rootName === "globalThis" || rootName === "self") {
                            // These should have .chrome as first element of chain
                            if (chain.length > 0 && chain[0] === "chrome") {
                                // Remove the wrapper, keep chrome.rest
                                return {
                                    path: chain.join("."),
                                    hasDynamic
                                };
                            }
                            // If no chrome in chain, not a chrome API
                            return null;
                        }

                        // Check if root is a variable pointing to chrome API
                        if (vars.has(rootName)) {
                            const values = vars.get(rootName);
                            if (values.size === 1 && !values.has("*")) {
                                const base = Array.from(values)[0];
                                // If the variable points to "chrome" directly
                                if (base === "chrome" || base === "navigator" || base === "browser") {
                                    return {
                                        path: chain.length ? `${base}.${chain.join(".")}` : base,
                                        hasDynamic
                                    };
                                }
                                // If it points to a chrome.* API
                                if (/^(chrome|navigator|browser)\./.test(base)) {
                                    return {
                                        path: chain.length ? `${base}.${chain.join(".")}` : base,
                                        hasDynamic
                                    };
                                }
                            } else if (values.has("*")) {
                                // Variable could be anything - mark as dynamic
                                return {
                                    path: "chrome.DYNAMIC",
                                    hasDynamic: true
                                };
                            }
                        }

                        return null;
                    }

                    return null;
                }

                function handleNestedPattern(pattern, base) {
                    if (pattern.type === "ObjectPattern") {
                        for (const prop of pattern.properties) {
                            if (prop.type !== "ObjectProperty") continue;

                            const key = prop.key.type === "Identifier" ? prop.key.name :
                                (prop.key.type === "StringLiteral" ? prop.key.value : null);
                            if (!key) continue;

                            const value = prop.value;

                            if (value.type === "Identifier") {
                                vars.set(value.name, new Set([`${base}.${key}`]));
                            } else if (value.type === "ObjectPattern") {
                                // Recursive nested destructuring
                                handleNestedPattern(value, `${base}.${key}`);
                            }
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
                        if (id.type === "ObjectPattern") {
                            let base = null;

                            if (init.type === "MemberExpression") {
                                const result = getMemberPath(init);
                                base = result?.path;
                            } else if (init.type === "Identifier") {
                                // Destructure from a variable
                                if (vars.has(init.name)) {
                                    const values = vars.get(init.name);
                                    if (values.size === 1 && !values.has("*")) {
                                        base = Array.from(values)[0];
                                    }
                                } else if (init.name === "chrome" || init.name === "navigator" || init.name === "browser") {
                                    base = init.name;
                                }
                            }

                            if (base && /^(chrome|navigator|browser)/.test(base)) {
                                handleNestedPattern(id, base);
                            } else if (init.type === "SpreadElement" || init.type === "ObjectExpression") {
                                // Object spread - mark as unknown
                                for (const prop of id.properties) {
                                    if (prop.type === "ObjectProperty" && prop.value.type === "Identifier") {
                                        vars.set(prop.value.name, new Set(["*"]));
                                    }
                                }
                            }
                            return;
                        }

                        // simple identifier variable
                        if (id.type === "Identifier") {
                            // Handle SpreadElement: const x = { ...chrome.runtime }
                            if (init.type === "ObjectExpression") {
                                let foundSpread = false;
                                for (const prop of init.properties) {
                                    if (prop.type === "SpreadElement") {
                                        const spreadArg = prop.argument;
                                        let resolved = null;

                                        if (spreadArg.type === "MemberExpression") {
                                            const result = getMemberPath(spreadArg);
                                            resolved = result?.path;
                                        } else if (spreadArg.type === "Identifier" && vars.has(spreadArg.name)) {
                                            const values = vars.get(spreadArg.name);
                                            if (values.size === 1 && !values.has("*")) {
                                                resolved = Array.from(values)[0];
                                            }
                                        }

                                        if (resolved && /^(chrome|navigator|browser)/.test(resolved)) {
                                            vars.set(id.name, new Set([resolved]));
                                            foundSpread = true;
                                            break;
                                        }
                                    }
                                }
                                if (!foundSpread) {
                                    vars.set(id.name, new Set(["*"]));
                                }
                                return;
                            }

                            if (init.type === "MemberExpression") {
                                const result = getMemberPath(init);
                                if (result?.path) {
                                    vars.set(id.name, new Set([result.path]));
                                    return;
                                }
                            }

                            // Variable aliasing another variable or direct chrome reference
                            if (init.type === "Identifier") {
                                if (init.name === "chrome" || init.name === "navigator" || init.name === "browser") {
                                    vars.set(id.name, new Set([init.name]));
                                } else if (vars.has(init.name)) {
                                    vars.set(id.name, new Set(vars.get(init.name)));
                                } else {
                                    vars.set(id.name, new Set([init.name]));
                                }
                                return;
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
                        if (left.type === "ObjectPattern") {
                            let base = null;

                            if (right.type === "MemberExpression") {
                                const result = getMemberPath(right);
                                base = result?.path;
                            } else if (right.type === "Identifier") {
                                if (vars.has(right.name)) {
                                    const values = vars.get(right.name);
                                    if (values.size === 1 && !values.has("*")) {
                                        base = Array.from(values)[0];
                                    }
                                } else if (right.name === "chrome" || right.name === "navigator" || right.name === "browser") {
                                    base = right.name;
                                }
                            }

                            if (base && /^(chrome|navigator|browser)/.test(base)) {
                                handleNestedPattern(left, base);
                            }
                            return;
                        }

                        // x = chrome.runtime.sendMessage; or x = y;
                        if (left.type === "Identifier") {
                            if (right.type === "MemberExpression") {
                                const result = getMemberPath(right);
                                if (result?.path) {
                                    vars.set(left.name, new Set([result.path]));
                                } else {
                                    vars.set(left.name, new Set(["*"]));
                                }
                            } else if (right.type === "Identifier") {
                                // Variable aliasing: b = a;
                                if (right.name === "chrome" || right.name === "navigator" || right.name === "browser") {
                                    vars.set(left.name, new Set([right.name]));
                                } else if (vars.has(right.name)) {
                                    vars.set(left.name, new Set(vars.get(right.name)));
                                } else {
                                    vars.set(left.name, new Set([right.name]));
                                }
                            } else {
                                vars.set(left.name, new Set(["*"]));
                            }
                        }
                    },

                    // Detect Object.assign patterns
                    CallExpression(p) {
                        const callee = p.node.callee;

                        // Object.assign(x, chrome.runtime) pattern
                        if (callee.type === "MemberExpression" &&
                            callee.object.type === "Identifier" &&
                            callee.object.name === "Object" &&
                            callee.property.name === "assign") {
                            const [target, source] = p.node.arguments;
                            if (target && source) {
                                let resolved = null;
                                if (source.type === "MemberExpression") {
                                    const result = getMemberPath(source);
                                    resolved = result?.path;
                                } else if (source.type === "Identifier" && vars.has(source.name)) {
                                    const values = vars.get(source.name);
                                    if (values.size === 1 && !values.has("*")) {
                                        resolved = Array.from(values)[0];
                                    }
                                }

                                if (resolved && /^(chrome|navigator|browser)/.test(resolved)) {
                                    if (target.type === "Identifier") {
                                        vars.set(target.name, new Set([resolved]));
                                    }
                                }
                            }
                            // Continue to normal call processing
                        }

                        // --- direct MemberExpression calls ---
                        if (callee.type === "MemberExpression") {
                            const result = getMemberPath(callee);
                            if (result && /^(chrome|navigator|browser)/.test(result.path)) {
                                calls.add(result.path);
                                return;
                            }
                        }

                        // --- plain identifier calls, e.g. sendMessage() or alias() ---
                        if (callee.type === "Identifier" && vars.has(callee.name)) {
                            for (const val of vars.get(callee.name)) {
                                if (/^(chrome|navigator|browser)\./.test(val)) {
                                    calls.add(val);
                                } else if (val === "*") {
                                    // Unknown variable being called - potential obfuscation
                                    calls.add("chrome.DYNAMIC");
                                }
                            }
                        }
                    },
                });
            }

            // postprocess: coalesce multiple DYNAMIC markers but keep them as important signals
            const result = Array.from(calls).map(name =>
                name.includes("DYNAMIC") ? name.replace(/\.DYNAMIC.*/, ".DYNAMIC") : name
            );

            return Array.from(new Set(result)).sort();
        }

        // run analysis
        for (const entry of entrypoints) {
            await visit(entry);
        }

        return { ...extractFeatures(), apis: collectAPIUsage() };
    }
}