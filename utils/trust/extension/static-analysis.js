class StaticAnalysis {
    static async analyze(entrypoints, fileGetter, debug = false) {
        const visited = new Map();

        function log(...args) {
            if (debug) console.log("[StaticAnalysis]", ...args);
        }

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
                plugins: ["optionalChaining", "nullishCoalescingOperator"],
            });

            visited.set(id, { ast, code });

            // find dependencies
            const deps = DependencyResolver.findDependencies(ast);

            // recursively visit dependencies
            for (const dep of deps) {
                const resolved = DependencyResolver.normalizeImport(id, dep);
                await visit(resolved);
            }
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

        const apis = APICollector.collectAPIUsage(visited, log);
        return { ...extractFeatures(), apis };
    }
}

class DependencyResolver {
    static findDependencies(ast) {
        const deps = new Set();
        BabelTraverse.default(ast, {
            ImportDeclaration(p) {
                deps.add(p.node.source.value);
            },
            CallExpression(p) {
                const c = p.node.callee;
                if (c.type === "Identifier" &&
                    (c.name === "require" || c.name === "importScripts")) {
                    const [arg] = p.node.arguments;
                    if (arg?.type === "StringLiteral") deps.add(arg.value);
                }
            },
        });
        return deps;
    }

    static normalizeImport(from, spec) {
        const base = from.split("/").slice(0, -1).join("/") + "/";
        return new URL(spec, "file://" + base).pathname.slice(1);
    }
}

class ExpressionEvaluator {
    constructor(vars) {
        this.vars = vars;
    }

    tryEvaluate(node) {
        if (node.type === "StringLiteral") return node.value;
        if (node.type === "NumericLiteral") return String(node.value);
        if (node.type === "TemplateLiteral") {
            if (node.expressions.length === 0) {
                return node.quasis[0].value.cooked;
            }
            let result = "";
            for (let i = 0; i < node.quasis.length; i++) {
                result += node.quasis[i].value.cooked || "";
                if (i < node.expressions.length) {
                    const exprVal = this.tryEvaluate(node.expressions[i]);
                    if (exprVal !== null) {
                        result += exprVal;
                    } else if (node.expressions[i].type === "Identifier" &&
                        this.vars.has(node.expressions[i].name)) {
                        const values = this.vars.get(node.expressions[i].name);
                        if (values.size === 1 && !values.has("*")) {
                            result += Array.from(values)[0];
                        } else {
                            return null;
                        }
                    } else {
                        return null;
                    }
                }
            }
            return result;
        }
        if (node.type === "BinaryExpression" && node.operator === "+") {
            const left = this.tryEvaluate(node.left);
            const right = this.tryEvaluate(node.right);
            if (left !== null && right !== null) return left + right;
        }
        if (node.type === "Identifier" && this.vars.has(node.name)) {
            const values = this.vars.get(node.name);
            if (values.size === 1 && !values.has("*")) {
                return Array.from(values)[0];
            }
        }
        if (node.type === "CallExpression" &&
            node.callee.type === "MemberExpression" &&
            node.callee.property.name === "toString") {
            return null;
        }
        return null;
    }
}

class ExpressionResolver {
    constructor(vars, evaluator) {
        this.vars = vars;
        this.evaluator = evaluator;
    }

    resolveExpression(node) {
        if (!node) return null;

        switch (node.type) {
            case "MemberExpression":
            case "OptionalMemberExpression":
                return this.getMemberPath(node);

            case "Identifier":
                return this._resolveIdentifier(node);

            case "ThisExpression":
                // Handle `this` by searching for matching instance properties
                return { path: "this", hasDynamic: false };

            case "CallExpression":
                return this._resolveCallExpression(node);

            case "ConditionalExpression":
                return this._resolveConditional(node);

            case "LogicalExpression":
                return this._resolveLogical(node);

            case "SequenceExpression":
                return this.resolveExpression(node.expressions[node.expressions.length - 1]);

            case "AssignmentExpression":
                return this.resolveExpression(node.right);

            case "NewExpression":
                return this._resolveNew(node);

            case "AwaitExpression":
                return this.resolveExpression(node.argument);

            case "YieldExpression":
                return this.resolveExpression(node.argument);

            default:
                return null;
        }
    }

    _resolveIdentifier(node) {
        if (node.name === "chrome" || node.name === "navigator" || node.name === "browser") {
            return { path: node.name, hasDynamic: false };
        }
        if (node.name === "window" || node.name === "globalThis" || node.name === "self") {
            return { path: "window", hasDynamic: false };
        }
        // Handle 'arguments' as a special identifier
        if (node.name === "arguments") {
            return { path: "arguments", hasDynamic: false };
        }
        if (this.vars.has(node.name)) {
            const values = this.vars.get(node.name);
            if (values.size === 1 && !values.has("*")) {
                return { path: Array.from(values)[0], hasDynamic: false };
            }
        }
        return null;
    }
    _resolveCallExpression(node) {
        // Handle static method calls like API.get()
        if (node.callee.type === "MemberExpression" &&
            node.callee.object.type === "Identifier") {
            const className = node.callee.object.name;
            const methodName = node.callee.property.name;

            if (this.vars.get(className)?.has("class")) {
                const staticMethodKey = `${className}.${methodName}()`;
                if (this.vars.has(staticMethodKey)) {
                    const retVal = this.vars.get(staticMethodKey);
                    if (retVal.size === 1 && !retVal.has("*")) {
                        return { path: Array.from(retVal)[0], hasDynamic: false };
                    }
                }
            }
        }

        // Handle Reflect.get() calls
        if (node.callee.type === "MemberExpression" &&
            node.callee.object.type === "Identifier" &&
            node.callee.object.name === "Reflect" &&
            node.callee.property.name === "get") {

            const [target, prop] = node.arguments;
            const targetResult = this.resolveExpression(target);

            if (targetResult?.path && /^(chrome|navigator|browser)/.test(targetResult.path)) {
                const propValue = this.evaluator.tryEvaluate(prop);
                if (propValue !== null) {
                    return { path: `${targetResult.path}.${propValue}`, hasDynamic: false };
                } else {
                    return { path: `${targetResult.path}.DYNAMIC`, hasDynamic: true };
                }
            }
        }

        if (node.callee.type === "MemberExpression") {
            const methodName = node.callee.property.name;

            if (methodName === "get") {
                if (node.callee.object.type === "Identifier") {
                    const objName = node.callee.object.name;
                    if (this.vars.has(objName)) {
                        const mapValues = this.vars.get(objName);
                        if (mapValues.has("Map") || mapValues.has("WeakMap")) {
                            return { path: "chrome.DYNAMIC", hasDynamic: true };
                        }
                    }
                }
            }

            if (methodName === "next") {
                return { path: "chrome.DYNAMIC", hasDynamic: true };
            }

            if (methodName === "then" || methodName === "catch" || methodName === "finally") {
                const promiseResult = this.resolveExpression(node.callee.object);
                if (promiseResult?.path) {
                    // Pass through the promise result, maintaining isPromise flag
                    return promiseResult;
                }
                return null;
            }
        }

        // Check if this CallExpression has a resolved path from Reflect.get
        if (node._resolvedPath) {
            return { path: node._resolvedPath, hasDynamic: false };
        }

        // IIFE: (function() { return chrome; })()
        if ((node.callee.type === "FunctionExpression" ||
                node.callee.type === "ArrowFunctionExpression" ||
                node.callee.type === "AsyncFunctionExpression") &&  // ✅ Added async
            node.callee.body) {
            const body = node.callee.body;

            // For async functions, the result is wrapped in a Promise
            const isAsync = node.callee.async || node.callee.type === "AsyncFunctionExpression";

            if (body.type === "BlockStatement" && body.body.length === 1 &&
                body.body[0].type === "ReturnStatement") {
                const result = this.resolveExpression(body.body[0].argument);
                // Async functions wrap result in Promise - mark it
                if (isAsync && result?.path) {
                    return { path: result.path, hasDynamic: result.hasDynamic, isPromise: true };
                }
                return result;
            }
            if ((node.callee.type === "ArrowFunctionExpression" ||
                    node.callee.type === "AsyncFunctionExpression") &&
                body.type !== "BlockStatement") {
                const result = this.resolveExpression(body);
                if (isAsync && result?.path) {
                    return { path: result.path, hasDynamic: result.hasDynamic, isPromise: true };
                }
                return result;
            }
        }

        return null;
    }

    _resolveConditional(node) {
        const consequent = this.resolveExpression(node.consequent);
        if (consequent?.path && /^(chrome|navigator|browser)/.test(consequent.path)) {
            return consequent;
        }
        const alternate = this.resolveExpression(node.alternate);
        if (alternate?.path && /^(chrome|navigator|browser)/.test(alternate.path)) {
            return alternate;
        }
        return null;
    }

    _resolveLogical(node) {
        if (node.operator === "||" || node.operator === "&&" || node.operator === "??") {
            const left = this.resolveExpression(node.left);
            const right = this.resolveExpression(node.right);

            if (node.operator === "&&") {
                return right?.path ? right : left;
            }

            if (left?.path && /^(chrome|navigator|browser)/.test(left.path)) {
                return left;
            }
            if (right?.path && /^(chrome|navigator|browser)/.test(right.path)) {
                return right;
            }
        }
        return null;
    }

    _resolveNew(node) {
        if (node.callee.type === "Identifier" && this.vars.has(node.callee.name)) {
            const classInfo = this.vars.get(node.callee.name);
            if (classInfo.has("class")) {
                return { path: node.callee.name + "_instance", hasDynamic: false };
            }
        }
        return null;
    }

    getMemberPath(memberExpr) {
        const chain = [];
        let node = memberExpr;
        let hasDynamic = false;

        while (node && (node.type === "MemberExpression" || node.type === "OptionalMemberExpression")) {
            const isComputed = node.computed;
            const isOptional = node.optional || node.type === "OptionalMemberExpression";

            // Only treat as dynamic if it's COMPUTED, not just optional
            if (isComputed) {
                const evaluated = this.evaluator.tryEvaluate(node.property);
                if (evaluated !== null) {
                    chain.unshift(evaluated);
                } else if (node.property.type === "Identifier" && this.vars.has(node.property.name)) {
                    const values = this.vars.get(node.property.name);
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
                // Regular property access (including optional like ?.runtime)
                chain.unshift(node.property.name);
            }
            node = node.object;
        }

        // Check for tracked properties/array elements FIRST, before resolving base
        if (node?.type === "Identifier" && chain.length > 0) {
            // Check for object property: wrapper.api
            const propPath = `${node.name}.${chain[0]}`;
            if (this.vars.has(propPath)) {
                const tracked = this.vars.get(propPath);
                if (tracked.size === 1 && !tracked.has("*")) {
                    const basePath = Array.from(tracked)[0];
                    chain.shift();

                    if (/^(chrome|navigator|browser)/.test(basePath)) {
                        return {
                            path: chain.length ? `${basePath}.${chain.join(".")}` : basePath,
                            hasDynamic: hasDynamic
                        };
                    }
                }
            }

            // Check for array element: arr[1]
            const elemPath = `${node.name}[${chain[0]}]`;
            if (this.vars.has(elemPath)) {
                const tracked = this.vars.get(elemPath);
                if (tracked.size === 1 && !tracked.has("*")) {
                    const basePath = Array.from(tracked)[0];
                    chain.shift();

                    if (/^(chrome|navigator|browser)/.test(basePath)) {
                        return {
                            path: chain.length ? `${basePath}.${chain.join(".")}` : basePath,
                            hasDynamic: hasDynamic
                        };
                    }
                }
            }
        }

        // Resolve the base object
        const baseResult = this.resolveExpression(node);

        if (!baseResult) return null;

        let basePath = baseResult.path;
        if (!basePath) return null;

        // Handle 'this' by checking for any class_instance that has this property
        if (basePath === "this") {
            if (chain.length > 0) {
                // Check all tracked vars for *_instance.propName
                for (const [key, value] of this.vars.entries()) {
                    if (key.endsWith(`_instance.${chain[0]}`)) {
                        if (value.size === 1 && !value.has("*")) {
                            basePath = Array.from(value)[0];
                            chain.shift();

                            if (/^(chrome|navigator|browser)/.test(basePath)) {
                                return {
                                    path: chain.length ? `${basePath}.${chain.join(".")}` : basePath,
                                    hasDynamic: hasDynamic
                                };
                            }
                        }
                    }
                }
            }
            return null;
        }

        // Handle arguments object similar to arrays
        if (basePath === "arguments") {
            // Check for arguments[0], arguments[1], etc.
            if (chain.length > 0 && this.vars.has(`arguments[${chain[0]}]`)) {
                const elemPath = this.vars.get(`arguments[${chain[0]}]`);
                if (elemPath.size === 1 && !elemPath.has("*")) {
                    basePath = Array.from(elemPath)[0];
                    chain.shift();
                }
            } else {
                // Can't resolve arguments without index
                return null;
            }
        }

        // Handle window/globalThis/self wrappers
        if (basePath === "window") {
            if (chain.length > 0 && (chain[0] === "chrome" || chain[0] === "navigator" || chain[0] === "browser")) {
                basePath = chain.shift();
            } else {
                return null;
            }
        }

        // Check for object property access: wrapper.api where wrapper = { api: chrome.runtime }
        if (chain.length > 0 && this.vars.has(`${basePath}.${chain[0]}`)) {
            const propPath = this.vars.get(`${basePath}.${chain[0]}`);
            if (propPath.size === 1 && !propPath.has("*")) {
                basePath = Array.from(propPath)[0];
                chain.shift();
            }
        }

        // Check for array element access: arr[1] where arr = [null, chrome.runtime]
        if (chain.length > 0 && this.vars.has(`${basePath}[${chain[0]}]`)) {
            const elemPath = this.vars.get(`${basePath}[${chain[0]}]`);
            if (elemPath.size === 1 && !elemPath.has("*")) {
                basePath = Array.from(elemPath)[0];
                chain.shift();
            }
        }

        if (/^(chrome|navigator|browser)/.test(basePath)) {
            return {
                path: chain.length ? `${basePath}.${chain.join(".")}` : basePath,
                hasDynamic: hasDynamic || baseResult.hasDynamic
            };
        }

        return null;
    }
}

class VariableTracker {
    constructor(vars, resolver, evaluator, log) {
        this.vars = vars;
        this.resolver = resolver;
        this.evaluator = evaluator;
        this.log = log;
    }

    handleNestedPattern(pattern, base) {
        if (pattern.type === "ObjectPattern") {
            for (const prop of pattern.properties) {
                if (prop.type !== "ObjectProperty") continue;

                let key;
                if (prop.computed) {
                    const evaluated = this.evaluator.tryEvaluate(prop.key);
                    if (evaluated !== null) {
                        key = evaluated;
                    } else if (prop.key.type === "Identifier" && this.vars.has(prop.key.name)) {
                        const values = this.vars.get(prop.key.name);
                        if (values.size === 1 && !values.has("*")) {
                            key = Array.from(values)[0];
                        }
                    }
                } else {
                    key = prop.key.type === "Identifier" ? prop.key.name :
                        (prop.key.type === "StringLiteral" ? prop.key.value : null);
                }

                if (!key) continue;

                const value = prop.value;

                if (value.type === "Identifier") {
                    this.vars.set(value.name, new Set([`${base}.${key}`]));
                } else if (value.type === "ObjectPattern") {
                    this.handleNestedPattern(value, `${base}.${key}`);
                }
            }
        } else if (pattern.type === "ArrayPattern") {
            for (let i = 0; i < pattern.elements.length; i++) {
                const element = pattern.elements[i];
                if (element?.type === "Identifier") {
                    this.vars.set(element.name, new Set([`${base}[${i}]`]));
                }
            }
        }
    }

    getVisitors() {
        return {
            VariableDeclarator: (p) => this._handleVariableDeclarator(p),
            AssignmentExpression: (p) => this._handleAssignment(p),
            ClassDeclaration: (p) => this._handleClass(p),
            Function: (p) => this._handleFunction(p),
        };
    }

    _handleVariableDeclarator(p) {
        const id = p.node.id;
        const init = p.node.init;
        if (!init) return;

        if (id.type === "ObjectPattern" || id.type === "ArrayPattern") {
            // ✅ NEW: Special case for array destructuring from array literal
            if (id.type === "ArrayPattern" && init.type === "ArrayExpression") {
                for (let i = 0; i < id.elements.length && i < init.elements.length; i++) {
                    const element = id.elements[i];
                    const value = init.elements[i];

                    if (element?.type === "Identifier" && value) {
                        const result = this.resolver.resolveExpression(value);
                        if (result?.path) {
                            this.vars.set(element.name, new Set([result.path]));
                            this.log(`Array destructure: ${element.name} = ${result.path}`);
                        } else {
                            const literalValue = this.evaluator.tryEvaluate(value);
                            if (literalValue !== null) {
                                this.vars.set(element.name, new Set([literalValue]));
                                this.log(`Array destructure: ${element.name} = ${literalValue}`);
                            } else {
                                this.vars.set(element.name, new Set(["*"]));
                            }
                        }
                    }
                }
                return;
            }

            const result = this.resolver.resolveExpression(init);
            const base = result?.path || "*";
            this.handleNestedPattern(id, base);
            return;
        }

        if (id.type === "Identifier") {
            if (init.type === "ArrayExpression") {
                for (let i = 0; i < init.elements.length; i++) {
                    const elem = init.elements[i];
                    if (elem) {
                        const elemResult = this.resolver.resolveExpression(elem);
                        if (elemResult?.path) {
                            this.vars.set(`${id.name}[${i}]`, new Set([elemResult.path]));
                        }
                    }
                }
                this.vars.set(id.name, new Set(["Array"]));
                return;
            }

            if (init.type === "ObjectExpression") {
                this._handleObjectExpression(id.name, init);
                return;
            }

            // Track Symbol.for() calls
            if (init.type === "CallExpression" &&
                init.callee.type === "MemberExpression" &&
                init.callee.object.type === "Identifier" &&
                init.callee.object.name === "Symbol" &&
                init.callee.property.name === "for" &&
                init.arguments.length === 1 &&
                init.arguments[0].type === "StringLiteral") {
                this.vars.set(id.name, new Set([`Symbol.for(${init.arguments[0].value})`]));
                this.log(`Symbol: ${id.name} = Symbol.for(${init.arguments[0].value})`);
                return;
            }


            if (init.type === "NewExpression" && init.callee.type === "Identifier") {
                if (init.callee.name === "Map" || init.callee.name === "WeakMap") {
                    this.vars.set(id.name, new Set([init.callee.name]));
                    return;
                }
            }

            const result = this.resolver.resolveExpression(init);
            if (result?.path) {
                this.vars.set(id.name, new Set([result.path]));
                this.log(`Variable: ${id.name} = ${result.path}`);
                return;
            }

            if (init.type === "StringLiteral") {
                this.vars.set(id.name, new Set([init.value]));
            } else {
                this.vars.set(id.name, new Set(["*"]));
            }
        }
    }

    _handleObjectExpression(idName, init) {
        let foundSpread = false;
        let toStringValue = null;

        for (const prop of init.properties) {
            if (prop.type === "SpreadElement") {
                const result = this.resolver.resolveExpression(prop.argument);
                if (result?.path && /^(chrome|navigator|browser)/.test(result.path)) {
                    this.vars.set(idName, new Set([result.path]));
                    foundSpread = true;
                    break;
                }
            }

            if (prop.type === "ObjectProperty" || prop.type === "ObjectMethod") {
                let key = null;

                // Check for toString method
                const propName = prop.key.type === "Identifier" ? prop.key.name :
                    (prop.key.type === "StringLiteral" ? prop.key.value : null);

                if (propName === "toString") {
                    // Check if it's an arrow function or method that returns a literal
                    if (prop.value?.type === "ArrowFunctionExpression" &&
                        prop.value.body.type === "StringLiteral") {
                        toStringValue = prop.value.body.value;
                        this.log(`toString method returns: ${toStringValue}`);
                    } else if (prop.type === "ObjectMethod" &&
                        prop.body.body.length === 1 &&
                        prop.body.body[0].type === "ReturnStatement" &&
                        prop.body.body[0].argument?.type === "StringLiteral") {
                        toStringValue = prop.body.body[0].argument.value;
                        this.log(`toString method returns: ${toStringValue}`);
                    }
                }

                if (prop.computed) {
                    // Handle Symbol.for() as key
                    if (prop.key.type === "CallExpression" &&
                        prop.key.callee.type === "MemberExpression" &&
                        prop.key.callee.object.type === "Identifier" &&
                        prop.key.callee.object.name === "Symbol" &&
                        prop.key.callee.property.name === "for" &&
                        prop.key.arguments.length === 1 &&
                        prop.key.arguments[0].type === "StringLiteral") {
                        key = `Symbol.for(${prop.key.arguments[0].value})`;
                    } else {
                        key = this.evaluator.tryEvaluate(prop.key);
                        if (key === null && prop.key.type === "Identifier" && this.vars.has(prop.key.name)) {
                            const values = this.vars.get(prop.key.name);
                            if (values.size === 1 && !values.has("*")) {
                                key = Array.from(values)[0];
                            }
                        }
                    }
                } else {
                    key = propName;
                }

                if (key && key !== "toString") {
                    if (prop.type === "ObjectMethod" && prop.kind === "get") {
                        if (prop.body.body.length === 1 &&
                            prop.body.body[0].type === "ReturnStatement") {
                            const retVal = this.resolver.resolveExpression(prop.body.body[0].argument);
                            if (retVal?.path && /^(chrome|navigator|browser)/.test(retVal.path)) {
                                this.vars.set(`${idName}.${key}`, new Set([retVal.path]));
                                this.log(`Getter: ${idName}.${key} = ${retVal.path}`);
                            }
                        }
                    } else if (prop.value) {
                        const propResult = this.resolver.resolveExpression(prop.value);
                        if (propResult?.path) {
                            this.vars.set(`${idName}.${key}`, new Set([propResult.path]));
                            this.log(`Object property: ${idName}.${key} = ${propResult.path}`);
                        }
                    }
                }
            }
        }

        if (!foundSpread) {
            // If toString returns a literal, track that instead of "Object"
            if (toStringValue !== null) {
                this.vars.set(idName, new Set([toStringValue]));
            } else {
                this.vars.set(idName, new Set(["Object"]));
            }
        }
    }

    _handleAssignment(p) {
        const left = p.node.left;
        const right = p.node.right;

        if (left.type === "ObjectPattern" || left.type === "ArrayPattern") {
            const result = this.resolver.resolveExpression(right);
            const base = result?.path || "*";
            this.handleNestedPattern(left, base);
            return;
        }

        if (left.type === "Identifier") {
            const result = this.resolver.resolveExpression(right);
            if (result?.path) {
                this.vars.set(left.name, new Set([result.path]));
            } else if (right.type === "StringLiteral") {
                this.vars.set(left.name, new Set([right.value]));
            } else {
                this.vars.set(left.name, new Set(["*"]));
            }
        }

        if (left.type === "MemberExpression" &&
            left.object.type === "Identifier" &&
            this.vars.get(left.object.name)?.has("Map")) {
            const result = this.resolver.resolveExpression(right);
            if (result?.path && /^(chrome|navigator|browser)/.test(result.path)) {
                this.vars.set(left.object.name, new Set(["Map"]));
            }
        }
    }

    _handleClass(p) {
        if (p.node.id) {
            this.vars.set(p.node.id.name, new Set(["class"]));

            for (const item of p.node.body.body) {
                if (item.type === "ClassProperty" && item.value) {
                    const result = this.resolver.resolveExpression(item.value);
                    if (result?.path && /^(chrome|navigator|browser)/.test(result.path)) {
                        const key = item.key.name || item.key.value;
                        if (key) {
                            this.vars.set(`${p.node.id.name}_instance.${key}`, new Set([result.path]));
                        }
                    }
                }

                // Track assignments in constructor
                if (item.type === "ClassMethod" && item.kind === "constructor") {
                    for (const stmt of item.body.body) {
                        if (stmt.type === "ExpressionStatement" &&
                            stmt.expression.type === "AssignmentExpression" &&
                            stmt.expression.left.type === "MemberExpression" &&
                            stmt.expression.left.object.type === "ThisExpression") {

                            const key = stmt.expression.left.property.name || stmt.expression.left.property.value;
                            if (key) {
                                const result = this.resolver.resolveExpression(stmt.expression.right);
                                if (result?.path && /^(chrome|navigator|browser)/.test(result.path)) {
                                    this.vars.set(`${p.node.id.name}_instance.${key}`, new Set([result.path]));
                                    this.log(`Constructor: ${p.node.id.name}_instance.${key} = ${result.path}`);
                                }
                            }
                        }
                    }
                }

                // Track static methods that return chrome APIs
                if (item.type === "ClassMethod" && item.static &&
                    item.body.body.length === 1 &&
                    item.body.body[0].type === "ReturnStatement") {

                    const result = this.resolver.resolveExpression(item.body.body[0].argument);
                    if (result?.path && /^(chrome|navigator|browser)/.test(result.path)) {
                        const methodName = item.key.name || item.key.value;
                        if (methodName) {
                            this.vars.set(`${p.node.id.name}.${methodName}()`, new Set([result.path]));
                            this.log(`Static method: ${p.node.id.name}.${methodName}() returns ${result.path}`);
                        }
                    }
                }
            }
        }
    }

    _handleFunction(p) {
        const params = p.node.params;

        if (p.parentPath.isCallExpression()) {
            const callExpr = p.parentPath.node;

            // Check if this is a Promise .then() callback
            if (callExpr.callee.type === "MemberExpression" &&
                callExpr.callee.property.type === "Identifier" &&
                (callExpr.callee.property.name === "then" ||
                    callExpr.callee.property.name === "catch")) {

                // Resolve what the promise contains
                const promiseResult = this.resolver.resolveExpression(callExpr.callee.object);
                if (promiseResult?.path && params.length > 0 && params[0].type === "Identifier") {
                    // First parameter of .then() receives the resolved value
                    this.vars.set(params[0].name, new Set([promiseResult.path]));
                    this.log(`Promise callback: ${params[0].name} = ${promiseResult.path}`);
                }
            }

            // Track named parameters
            for (let i = 0; i < params.length; i++) {
                const param = params[i];
                const arg = callExpr.arguments[i];
                if (param.type === "Identifier" && arg) {
                    const result = this.resolver.resolveExpression(arg);
                    if (result?.path) {
                        this.vars.set(param.name, new Set([result.path]));
                        this.vars.set(`arguments[${i}]`, new Set([result.path]));
                    }
                }
            }

            // Track arguments[i] even if no named parameters
            for (let i = params.length; i < callExpr.arguments.length; i++) {
                const arg = callExpr.arguments[i];
                if (arg) {
                    const result = this.resolver.resolveExpression(arg);
                    if (result?.path) {
                        this.vars.set(`arguments[${i}]`, new Set([result.path]));
                        this.log(`arguments[${i}] = ${result.path}`);
                    }
                }
            }
        }
    }
}

class APICollector {
    static collectAPIUsage(visited, log) {
        const calls = new Set();

        for (const { ast } of visited.values()) {
            const vars = new Map();
            const evaluator = new ExpressionEvaluator(vars);
            const resolver = new ExpressionResolver(vars, evaluator);
            const tracker = new VariableTracker(vars, resolver, evaluator, log);

            const callHandler = new CallHandler(calls, vars, resolver, evaluator, log);

            BabelTraverse.default(ast, {
                ...tracker.getVisitors(),
                CallExpression: (p) => callHandler.handleCall(p),
                OptionalCallExpression: (p) => callHandler.handleCall(p), // ✅ NEW
                NewExpression: (p) => callHandler.handleNew(p),
            });
        }

        // postprocess
        const result = Array.from(calls).map(name =>
            name.includes("DYNAMIC") ? name.replace(/\.DYNAMIC.*/, ".DYNAMIC") : name
        );

        return Array.from(new Set(result)).sort();
    }
}

class CallHandler {
    constructor(calls, vars, resolver, evaluator, log) {
        this.calls = calls;
        this.vars = vars;
        this.resolver = resolver;
        this.evaluator = evaluator;
        this.log = log;
    }

    handleCall(p) {
        const callee = p.node.callee;
        this.log(`handleCall: callee type = ${callee.type}`);

        // Skip Promise methods - they're not API calls
        if (callee.type === "MemberExpression" &&
            callee.property.type === "Identifier") {
            const methodName = callee.property.name;
            if (methodName === "then" ||
                methodName === "catch" ||
                methodName === "finally" ||
                methodName === "all" ||
                methodName === "race" ||
                methodName === "allSettled" ||
                methodName === "any") {
                // This is a Promise method, not a chrome API call
                return;
            }
        }

        // eval() variants
        if (callee.type === "Identifier" && callee.name === "eval") {
            this.calls.add("chrome.DYNAMIC");
            return;
        }

        // new Function() or Function()
        if ((callee.type === "Identifier" && callee.name === "Function") ||
            (callee.type === "NewExpression" && callee.callee.name === "Function")) {
            this.calls.add("chrome.DYNAMIC");
            return;
        }

        // Indirect eval: (1, eval)(...)
        if (callee.type === "SequenceExpression") {
            const lastExpr = callee.expressions[callee.expressions.length - 1];
            if (lastExpr.type === "Identifier" && lastExpr.name === "eval") {
                this.calls.add("chrome.DYNAMIC");
                return;
            }
        }

        // Reflect API
        if (this._handleReflect(p, callee)) return;

        // Object methods
        if (this._handleObjectMethods(p, callee)) return;

        // Map.set(key, chrome.runtime)
        if (this._handleMapSet(p, callee)) return;

        // Regular chrome API calls
        const calleeResult = this.resolver.resolveExpression(callee);
        if (calleeResult?.path) {
            if (/^(chrome|navigator|browser)\./.test(calleeResult.path)) {
                this.calls.add(calleeResult.path);
                this.log(`Call: ${calleeResult.path}`);
                return;
            }
            // Handle instance_class.method()
            if (calleeResult.path.includes("_instance")) {
                this.calls.add("chrome.DYNAMIC");
                return;
            }
        }

        // Plain identifier calls
        if (callee.type === "Identifier" && this.vars.has(callee.name)) {
            for (const val of this.vars.get(callee.name)) {
                if (/^(chrome|navigator|browser)\./.test(val)) {
                    this.calls.add(val);
                } else if (val === "*") {
                    this.calls.add("chrome.DYNAMIC");
                }
            }
        }
    }

    handleNew(p) {
        if (p.node.callee.type === "Identifier") {
            if (p.node.callee.name === "Proxy") {
                const [target] = p.node.arguments;
                const result = this.resolver.resolveExpression(target);
                if (result?.path && /^(chrome|navigator|browser)/.test(result.path)) {
                    const parent = p.parentPath;
                    if (parent.isVariableDeclarator() && parent.node.id.type === "Identifier") {
                        this.vars.set(parent.node.id.name, new Set([result.path]));
                    }
                }
            } else if (p.node.callee.name === "Function") {
                this.calls.add("chrome.DYNAMIC");
            }
        }
    }

    _handleReflect(p, callee) {
        if (callee.type === "MemberExpression" &&
            callee.object.type === "Identifier" &&
            callee.object.name === "Reflect") {
            const method = callee.property.name;

            if (method === "get") {
                const [target, prop] = p.node.arguments;
                const targetResult = this.resolver.resolveExpression(target);
                if (targetResult?.path && /^(chrome|navigator|browser)/.test(targetResult.path)) {
                    const propValue = this.evaluator.tryEvaluate(prop);
                    if (propValue !== null) {
                        const fullPath = `${targetResult.path}.${propValue}`;

                        // Track result for chained calls
                        const parent = p.parentPath;
                        if (parent.isVariableDeclarator() && parent.node.id.type === "Identifier") {
                            this.vars.set(parent.node.id.name, new Set([fullPath]));
                            this.log(`Reflect.get tracked: ${parent.node.id.name} = ${fullPath}`);
                        }

                        // ✅ NEW: Also mark the CallExpression itself so it can be used in member expressions
                        // Store the result so getMemberPath can use it
                        p.node._resolvedPath = fullPath;

                        return true;
                    } else {
                        this.calls.add(`${targetResult.path}.DYNAMIC`);
                    }
                } else {
                    this.calls.add("chrome.DYNAMIC");
                }
                return true;
            }

            if (method === "apply") {
                const [target] = p.node.arguments;
                const result = this.resolver.resolveExpression(target);
                if (result?.path && /^(chrome|navigator|browser)\./.test(result.path)) {
                    this.calls.add(result.path);
                } else {
                    this.calls.add("chrome.DYNAMIC");
                }
                return true;
            }
        }
        return false;
    }

    _handleObjectMethods(p, callee) {
        if (callee.type === "MemberExpression" &&
            callee.object.type === "Identifier" &&
            callee.object.name === "Object") {
            const method = callee.property.name;

            if (method === "assign") {
                const [target, source] = p.node.arguments;
                if (target && source) {
                    const result = this.resolver.resolveExpression(source);
                    if (result?.path && /^(chrome|navigator|browser)/.test(result.path)) {
                        if (target.type === "Identifier") {
                            this.vars.set(target.name, new Set([result.path]));
                        }
                    }
                }
            } else if (method === "keys" || method === "getOwnPropertyDescriptor") {
                const [target] = p.node.arguments;
                const result = this.resolver.resolveExpression(target);
                if (result?.path && /^(chrome|navigator|browser)/.test(result.path)) {
                    this.calls.add(`${result.path}.DYNAMIC`);
                }
            }
            return true;
        }
        return false;
    }

    _handleMapSet(p, callee) {
        if (callee.type === "MemberExpression" &&
            callee.property.name === "set" &&
            callee.object.type === "Identifier") {
            const mapName = callee.object.name;
            if (this.vars.get(mapName)?.has("Map") || this.vars.get(mapName)?.has("WeakMap")) {
                const [key, value] = p.node.arguments;
                const result = this.resolver.resolveExpression(value);
                if (result?.path && /^(chrome|navigator|browser)/.test(result.path)) {
                    // Mark this map as containing chrome APIs
                    this.vars.set(mapName, new Set(["Map"]));
                }
                return true;
            }
        }
        return false;
    }
}