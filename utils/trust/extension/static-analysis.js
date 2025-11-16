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

class Javascript {
    static DYNAMIC = "DYNAMIC";
    static DYNAMIC_CODE = "DYNAMIC_CODE";
    static WILDCARD = "*";
    static ARRAY = "Array";
    static MAP = "Map";
    static WEAK_MAP = "WeakMap";
    static CLASS = "class";
    static OBJECT = "Object";
    static WINDOW = "window";
    static ARGUMENTS = "arguments";
    static THIS = "this";

    static PROMISE_METHODS = ["then", "catch", "finally", "all", "race", "allSettled", "any"];
    static DYNAMIC_CODE_FUNCS = ["eval", "Function"];

    // Additional useful constants
    static WINDOW_ALIASES = ["window", "globalThis", "self"];
    static REFLECT = "Reflect";
    static SYMBOL = "Symbol";
    static PROMISE = "Promise";
    static PROXY = "Proxy";

    // Object methods
    static OBJECT_ASSIGN = "assign";
    static OBJECT_KEYS = "keys";
    static OBJECT_ENTRIES = "entries";
    static OBJECT_VALUES = "values";
    static OBJECT_GET_OWN_PROPERTY_DESCRIPTOR = "getOwnPropertyDescriptor";

    // Reflect methods
    static REFLECT_GET = "get";
    static REFLECT_APPLY = "apply";

    // Array methods
    static ARRAY_MAP = "map";
    static ARRAY_FILTER = "filter";

    // Map methods
    static MAP_SET = "set";
    static MAP_GET = "get";

    // Common methods
    static TO_STRING = "toString";
    static NEXT = "next";
    static CALL = "call";
    static APPLY = "apply";
    static BIND = "bind";

    // Special markers
    static INSTANCE_SUFFIX = "_instance";
    static CONTAINS_KEY = "__contains";

    static isBrowserAPI(path) {
        return path && /^(chrome|navigator|browser)($|\.)/.test(path);
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
                        if (values.size === 1 && !values.has(Javascript.WILDCARD)) {
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
            if (values.size === 1 && !values.has(Javascript.WILDCARD)) {
                return Array.from(values)[0];
            }
        }
        if (node.type === "CallExpression" &&
            node.callee.type === "MemberExpression" &&
            node.callee.property.name === Javascript.TO_STRING) {
            return null;
        }
        if (node.type === "ObjectExpression") {
            for (const prop of node.properties) {
                const propName = prop.key?.type === "Identifier" ? prop.key.name :
                    (prop.key?.type === "StringLiteral" ? prop.key.value : null);

                if (propName === Javascript.TO_STRING) {
                    // Arrow function: () => "runtime"
                    if (prop.value?.type === "ArrowFunctionExpression" &&
                        prop.value.body.type === "StringLiteral") {
                        return prop.value.body.value;
                    }
                    // Method: toString() { return "runtime"; }
                    if (prop.type === "ObjectMethod" &&
                        prop.body.body.length === 1 &&
                        prop.body.body[0].type === "ReturnStatement" &&
                        prop.body.body[0].argument?.type === "StringLiteral") {
                        return prop.body.body[0].argument.value;
                    }
                }
            }
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

    /**
     * Main entry point: resolve an expression to its API path
     * Returns: { path: string, hasDynamic: boolean, isPromise?: boolean } | null
     */
    resolveExpression(node) {
        if (!node) return null;

        const handlers = {
            'MemberExpression': () => this._resolveMemberExpression(node),
            'OptionalMemberExpression': () => this._resolveMemberExpression(node),
            'Identifier': () => this._resolveIdentifier(node),
            'ThisExpression': () => ({ path: Javascript.THIS, hasDynamic: false }),
            'CallExpression': () => this._resolveCallExpression(node),
            'ConditionalExpression': () => this._resolveConditional(node),
            'LogicalExpression': () => this._resolveLogical(node),
            'SequenceExpression': () => this.resolveExpression(node.expressions[node.expressions.length - 1]),
            'AssignmentExpression': () => this.resolveExpression(node.right),
            'NewExpression': () => this._resolveNewExpression(node),
            'AwaitExpression': () => this.resolveExpression(node.argument),
            'YieldExpression': () => this.resolveExpression(node.argument),
        };

        const handler = handlers[node.type];
        return handler ? handler() : null;
    }

    // ===== IDENTIFIER RESOLUTION =====

    _resolveIdentifier(node) {
        const name = node.name;

        // Browser APIs
        if (Javascript.isBrowserAPI(name)) {
            return { path: name, hasDynamic: false };
        }

        // Global objects that wrap window
        if (Javascript.WINDOW_ALIASES.includes(name)) {
            return { path: Javascript.WINDOW, hasDynamic: false };
        }

        // Special identifiers
        if (name === Javascript.ARGUMENTS) {
            return { path: Javascript.ARGUMENTS, hasDynamic: false };
        }

        // Variable lookup
        return this._resolveFromVariableMap(name);
    }

    _resolveFromVariableMap(name) {
        if (!this.vars.has(name)) return null;

        const values = this.vars.get(name);
        if (values.size === 1 && !values.has(Javascript.WILDCARD)) {
            return { path: Array.from(values)[0], hasDynamic: false };
        }

        return null;
    }

    // ===== CALL EXPRESSION RESOLUTION =====

    _resolveCallExpression(node) {
        // Check for stored resolution from Reflect.get
        if (node._resolvedPath) {
            return { path: node._resolvedPath, hasDynamic: false };
        }

        // Handle different call patterns
        return this._resolveStaticMethodCall(node)
            || this._resolveReflectGet(node)
            || this._resolvePromiseMethod(node)
            || this._resolveMapGet(node)
            || this._resolveIteratorNext(node)
            || this._resolveIIFE(node)
            || null;
    }

    _resolveStaticMethodCall(node) {
        if (node.callee.type !== "MemberExpression") return null;
        if (node.callee.object.type !== "Identifier") return null;

        const className = node.callee.object.name;
        const methodName = node.callee.property.name;

        if (!this.vars.get(className)?.has(Javascript.CLASS)) return null;

        const staticMethodKey = `${className}.${methodName}()`;
        if (!this.vars.has(staticMethodKey)) return null;

        const retVal = this.vars.get(staticMethodKey);
        if (retVal.size === 1 && !retVal.has(Javascript.WILDCARD)) {
            return { path: Array.from(retVal)[0], hasDynamic: false };
        }

        return null;
    }

    _resolveReflectGet(node) {
        if (node.callee.type !== "MemberExpression") return null;
        if (node.callee.object.type !== "Identifier") return null;
        if (node.callee.object.name !== Javascript.REFLECT) return null;
        if (node.callee.property.name !== Javascript.REFLECT_GET) return null;

        const [target, prop] = node.arguments;
        const targetResult = this.resolveExpression(target);

        if (!Javascript.isBrowserAPI(targetResult?.path)) return null;

        const propValue = this.evaluator.tryEvaluate(prop);
        if (propValue !== null) {
            return { path: `${targetResult.path}.${propValue}`, hasDynamic: false };
        }

        return { path: `${targetResult.path}.${Javascript.DYNAMIC}`, hasDynamic: true };
    }

    _resolvePromiseMethod(node) {
        if (node.callee.type !== "MemberExpression") return null;

        const methodName = node.callee.property.name;
        if (!Javascript.PROMISE_METHODS.includes(methodName)) return null;

        const promiseResult = this.resolveExpression(node.callee.object);
        return promiseResult?.path ? promiseResult : null;
    }

    _resolveMapGet(node) {
        if (node.callee.type !== "MemberExpression") return null;
        if (node.callee.property.name !== Javascript.MAP_GET) return null;
        if (node.callee.object.type !== "Identifier") return null;

        const objName = node.callee.object.name;
        const mapValues = this.vars.get(objName);

        if (!mapValues?.has(Javascript.MAP) && !mapValues?.has(Javascript.WEAK_MAP)) return null;

        // Check if we know what the map contains
        const containsKey = `${objName}.${Javascript.CONTAINS_KEY}`;
        if (this.vars.has(containsKey)) {
            const chromePath = this.vars.get(containsKey);
            if (chromePath.size === 1) {
                const path = Array.from(chromePath)[0];
                return { path: `${path}.${Javascript.DYNAMIC}`, hasDynamic: true };
            }
        }

        // Fallback: map contains unknown chrome API
        return { path: `chrome.${Javascript.DYNAMIC}`, hasDynamic: true };
    }

    _resolveIteratorNext(node) {
        if (node.callee.type !== "MemberExpression") return null;
        if (node.callee.property.name !== Javascript.NEXT) return null;

        // Iterator.next() returns chrome API dynamically
        return { path: `chrome.${Javascript.DYNAMIC}`, hasDynamic: true };
    }

    _resolveIIFE(node) {
        const callee = node.callee;
        const validTypes = ["FunctionExpression", "ArrowFunctionExpression", "AsyncFunctionExpression"];

        if (!validTypes.includes(callee.type)) return null;
        if (!callee.body) return null;

        const isAsync = callee.async || callee.type === "AsyncFunctionExpression";

        // Handle block statements with single return
        if (callee.body.type === "BlockStatement") {
            if (callee.body.body.length !== 1) return null;
            if (callee.body.body[0].type !== "ReturnStatement") return null;

            const result = this.resolveExpression(callee.body.body[0].argument);
            return this._wrapIfAsync(result, isAsync);
        }

        // Handle arrow function with expression body
        if (callee.type === "ArrowFunctionExpression" && callee.body.type !== "BlockStatement") {
            const result = this.resolveExpression(callee.body);
            return this._wrapIfAsync(result, isAsync);
        }

        return null;
    }

    _wrapIfAsync(result, isAsync) {
        if (!result?.path) return result;
        if (isAsync) {
            return { ...result, isPromise: true };
        }
        return result;
    }

    // ===== CONDITIONAL & LOGICAL EXPRESSIONS =====

    _resolveConditional(node) {
        const consequent = this.resolveExpression(node.consequent);
        if (Javascript.isBrowserAPI(consequent?.path)) {
            return consequent;
        }

        const alternate = this.resolveExpression(node.alternate);
        if (Javascript.isBrowserAPI(alternate?.path)) {
            return alternate;
        }

        return null;
    }

    _resolveLogical(node) {
        const { operator, left, right } = node;

        if (!["||", "&&", "??"].includes(operator)) return null;

        const leftResult = this.resolveExpression(left);
        const rightResult = this.resolveExpression(right);

        // For &&, prefer right side (the one that's actually returned if left is truthy)
        if (operator === "&&") {
            return rightResult?.path ? rightResult : leftResult;
        }

        // For || and ??, return first browser API found
        if (Javascript.isBrowserAPI(leftResult?.path)) {
            return leftResult;
        }
        if (Javascript.isBrowserAPI(rightResult?.path)) {
            return rightResult;
        }

        return null;
    }

    // ===== NEW EXPRESSION =====

    _resolveNewExpression(node) {
        if (node.callee.type !== "Identifier") return null;
        if (!this.vars.has(node.callee.name)) return null;

        const classInfo = this.vars.get(node.callee.name);
        if (classInfo.has(Javascript.CLASS)) {
            return { path: node.callee.name + Javascript.INSTANCE_SUFFIX, hasDynamic: false };
        }

        return null;
    }

    // ===== MEMBER EXPRESSION RESOLUTION =====

    _resolveMemberExpression(node) {
        return this.getMemberPath(node);
    }

    getMemberPath(memberExpr) {
        const { chain, hasDynamic } = this._buildPropertyChain(memberExpr);
        const baseNode = this._getBaseObject(memberExpr);

        // Try tracked properties first (before resolving base)
        const trackedResult = this._resolveFromTrackedProperties(baseNode, chain);
        if (trackedResult) {
            return { ...trackedResult, hasDynamic: hasDynamic || trackedResult.hasDynamic };
        }

        // Resolve base object
        const baseResult = this.resolveExpression(baseNode);
        if (!baseResult?.path) return null;

        // Handle special base cases
        const finalPath = this._resolveMemberPathFromBase(baseResult.path, chain);
        if (!finalPath) return null;

        if (Javascript.isBrowserAPI(finalPath)) {
            return {
                path: finalPath,
                hasDynamic: hasDynamic || baseResult.hasDynamic
            };
        }

        return null;
    }

    _buildPropertyChain(memberExpr) {
        const chain = [];
        let node = memberExpr;
        let hasDynamic = false;

        while (node && (node.type === "MemberExpression" || node.type === "OptionalMemberExpression")) {
            if (node.computed) {
                const evaluated = this._evaluateProperty(node.property);
                chain.unshift(evaluated.value);
                hasDynamic = hasDynamic || evaluated.isDynamic;
            } else if (node.property.type === "Identifier") {
                chain.unshift(node.property.name);
            }
            node = node.object;
        }

        return { chain, hasDynamic };
    }

    _evaluateProperty(propertyNode) {
        const evaluated = this.evaluator.tryEvaluate(propertyNode);
        if (evaluated !== null) {
            return { value: evaluated, isDynamic: false };
        }

        // Try variable lookup for computed properties
        if (propertyNode.type === "Identifier" && this.vars.has(propertyNode.name)) {
            const values = this.vars.get(propertyNode.name);
            if (values.size === 1 && !values.has(Javascript.WILDCARD)) {
                return { value: Array.from(values)[0], isDynamic: false };
            }
        }

        return { value: Javascript.DYNAMIC, isDynamic: true };
    }

    _getBaseObject(memberExpr) {
        let node = memberExpr;
        while (node && (node.type === "MemberExpression" || node.type === "OptionalMemberExpression")) {
            node = node.object;
        }
        return node;
    }

    _resolveFromTrackedProperties(baseNode, chain) {
        if (!baseNode || baseNode.type !== "Identifier" || chain.length === 0) {
            return null;
        }

        const baseName = baseNode.name;

        // Try progressively longer paths: obj.a, obj.a.b, obj.a.b.c
        for (let depth = 1; depth <= chain.length; depth++) {
            const pathSegments = chain.slice(0, depth);
            const trackedPath = `${baseName}.${pathSegments.join(".")}`;

            const tracked = this.vars.get(trackedPath);
            if (tracked?.size === 1 && !tracked.has(Javascript.WILDCARD)) {
                const resolvedBase = Array.from(tracked)[0];

                if (Javascript.isBrowserAPI(resolvedBase)) {
                    const remainingChain = chain.slice(depth);
                    const fullPath = remainingChain.length
                        ? `${resolvedBase}.${remainingChain.join(".")}`
                        : resolvedBase;

                    return { path: fullPath, hasDynamic: false };
                }
            }
        }

        // Check array element: obj[0]
        if (chain.length > 0) {
            const elemPath = `${baseName}[${chain[0]}]`;
            const tracked = this.vars.get(elemPath);

            if (tracked?.size === 1 && !tracked.has(Javascript.WILDCARD)) {
                const resolvedBase = Array.from(tracked)[0];

                if (Javascript.isBrowserAPI(resolvedBase)) {
                    const remainingChain = chain.slice(1);
                    const fullPath = remainingChain.length
                        ? `${resolvedBase}.${remainingChain.join(".")}`
                        : resolvedBase;

                    return { path: fullPath, hasDynamic: false };
                }
            }
        }

        return null;
    }

    _resolveMemberPathFromBase(basePath, chain) {
        // Handle special base cases
        if (basePath === Javascript.THIS) {
            return this._resolveThisProperty(chain);
        }

        if (basePath === Javascript.ARGUMENTS) {
            return this._resolveArgumentsAccess(chain);
        }

        if (basePath === Javascript.WINDOW) {
            return this._resolveWindowProperty(chain);
        }

        // Check for object property: basePath.prop
        if (chain.length > 0) {
            const propertyPath = `${basePath}.${chain[0]}`;
            const tracked = this.vars.get(propertyPath);

            if (tracked?.size === 1 && !tracked.has(Javascript.WILDCARD)) {
                basePath = Array.from(tracked)[0];
                chain = chain.slice(1);
            }
        }

        // Check for array element: basePath[index]
        if (chain.length > 0) {
            const elemPath = `${basePath}[${chain[0]}]`;
            const tracked = this.vars.get(elemPath);

            if (tracked?.size === 1 && !tracked.has(Javascript.WILDCARD)) {
                basePath = Array.from(tracked)[0];
                chain = chain.slice(1);
            }
        }

        // Build final path
        return chain.length ? `${basePath}.${chain.join(".")}` : basePath;
    }

    _resolveThisProperty(chain) {
        if (chain.length === 0) return null;

        // Search for matching instance property across all tracked classes
        for (const [key, value] of this.vars.entries()) {
            if (key.endsWith(`${Javascript.INSTANCE_SUFFIX}.${chain[0]}`)) {
                if (value.size === 1 && !value.has(Javascript.WILDCARD)) {
                    const basePath = Array.from(value)[0];

                    if (Javascript.isBrowserAPI(basePath)) {
                        const remainingChain = chain.slice(1);
                        return remainingChain.length
                            ? `${basePath}.${remainingChain.join(".")}`
                            : basePath;
                    }
                }
            }
        }

        return null;
    }

    _resolveArgumentsAccess(chain) {
        if (chain.length === 0) return null;

        const argPath = `${Javascript.ARGUMENTS}[${chain[0]}]`;
        const tracked = this.vars.get(argPath);

        if (tracked?.size === 1 && !tracked.has(Javascript.WILDCARD)) {
            const basePath = Array.from(tracked)[0];
            const remainingChain = chain.slice(1);
            return remainingChain.length
                ? `${basePath}.${remainingChain.join(".")}`
                : basePath;
        }

        return null;
    }

    _resolveWindowProperty(chain) {
        if (chain.length === 0) return null;

        // window.chrome -> chrome
        if (Javascript.isBrowserAPI(chain[0])) {
            return chain.join(".");
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
                        if (values.size === 1 && !values.has(Javascript.WILDCARD)) {
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
            // Special case for array destructuring from array literal
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
                                this.vars.set(element.name, new Set([Javascript.WILDCARD]));
                            }
                        }
                    }
                }
                return;
            }

            // Special case for destructuring from named array
            if (id.type === "ArrayPattern" && init.type === "Identifier") {
                const arrayName = init.name;
                if (this.vars.has(arrayName) && this.vars.get(arrayName).has(Javascript.ARRAY)) {
                    // Destructure from tracked array elements
                    for (let i = 0; i < id.elements.length; i++) {
                        const element = id.elements[i];

                        // Handle rest elements: ...rest
                        if (element?.type === "RestElement" && element.argument.type === "Identifier") {
                            // Rest gets remaining elements - mark as Array
                            this.vars.set(element.argument.name, new Set([Javascript.ARRAY]));
                            this.log(`Rest element: ${element.argument.name} = ${Javascript.ARRAY}`);
                            continue;
                        }

                        if (element?.type === "Identifier") {
                            const elemKey = `${arrayName}[${i}]`;
                            if (this.vars.has(elemKey)) {
                                const elemPath = this.vars.get(elemKey);
                                this.vars.set(element.name, elemPath);
                                this.log(`Array destructure from named: ${element.name} = ${Array.from(elemPath)[0]}`);
                            } else {
                                this.vars.set(element.name, new Set([Javascript.WILDCARD]));
                            }
                        }
                    }
                    return;
                }
            }

            const result = this.resolver.resolveExpression(init);
            const base = result?.path || Javascript.WILDCARD;
            this.handleNestedPattern(id, base);
            return;
        }

        if (id.type === "Identifier") {
            // Track assignments to eval or Function constructor
            if (init.type === "Identifier" &&
                Javascript.DYNAMIC_CODE_FUNCS.includes(init.name)) {
                this.vars.set(id.name, new Set([Javascript.DYNAMIC_CODE]));
                this.log(`Dynamic code: ${id.name} = ${init.name}`);
                return;
            }

            // Also track window.eval, globalThis.eval, etc.
            if (init.type === "MemberExpression" &&
                init.object.type === "Identifier" &&
                Javascript.WINDOW_ALIASES.includes(init.object.name) &&
                init.property.type === "Identifier" &&
                Javascript.DYNAMIC_CODE_FUNCS.includes(init.property.name)) {
                this.vars.set(id.name, new Set([Javascript.DYNAMIC_CODE]));
                this.log(`Dynamic code: ${id.name} = ${init.object.name}.${init.property.name}`);
                return;
            }

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
                this.vars.set(id.name, new Set([Javascript.ARRAY]));
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
                init.callee.object.name === Javascript.SYMBOL &&
                init.callee.property.name === "for" &&
                init.arguments.length === 1 &&
                init.arguments[0].type === "StringLiteral") {
                this.vars.set(id.name, new Set([`${Javascript.SYMBOL}.for(${init.arguments[0].value})`]));
                this.log(`Symbol: ${id.name} = ${Javascript.SYMBOL}.for(${init.arguments[0].value})`);
                return;
            }

            if (init.type === "NewExpression" && init.callee.type === "Identifier") {
                if (init.callee.name === Javascript.MAP || init.callee.name === Javascript.WEAK_MAP) {
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
                this.vars.set(id.name, new Set([Javascript.WILDCARD]));
            }
        }
    }

    _handleObjectExpression(idName, init) {
        let foundSpread = false;
        let toStringValue = null;

        for (const prop of init.properties) {
            if (prop.type === "SpreadElement") {
                const result = this.resolver.resolveExpression(prop.argument);
                if (Javascript.isBrowserAPI(result?.path)) {
                    this.vars.set(idName, new Set([result.path]));
                    foundSpread = true;
                    break;
                }
            }

            if (prop.type === "ObjectProperty" || prop.type === "ObjectMethod") {
                let key = null;

                const propName = prop.key.type === "Identifier" ? prop.key.name :
                    (prop.key.type === "StringLiteral" ? prop.key.value : null);

                if (propName === Javascript.TO_STRING) {
                    if (prop.value?.type === "ArrowFunctionExpression" &&
                        prop.value.body.type === "StringLiteral") {
                        toStringValue = prop.value.body.value;
                        this.log(`${Javascript.TO_STRING} method returns: ${toStringValue}`);
                    } else if (prop.type === "ObjectMethod" &&
                        prop.body.body.length === 1 &&
                        prop.body.body[0].type === "ReturnStatement" &&
                        prop.body.body[0].argument?.type === "StringLiteral") {
                        toStringValue = prop.body.body[0].argument.value;
                        this.log(`${Javascript.TO_STRING} method returns: ${toStringValue}`);
                    }
                }

                if (prop.computed) {
                    if (prop.key.type === "CallExpression" &&
                        prop.key.callee.type === "MemberExpression" &&
                        prop.key.callee.object.type === "Identifier" &&
                        prop.key.callee.object.name === Javascript.SYMBOL &&
                        prop.key.callee.property.name === "for" &&
                        prop.key.arguments.length === 1 &&
                        prop.key.arguments[0].type === "StringLiteral") {
                        key = `${Javascript.SYMBOL}.for(${prop.key.arguments[0].value})`;
                    } else {
                        key = this.evaluator.tryEvaluate(prop.key);
                        if (key === null && prop.key.type === "Identifier" && this.vars.has(prop.key.name)) {
                            const values = this.vars.get(prop.key.name);
                            if (values.size === 1 && !values.has(Javascript.WILDCARD)) {
                                key = Array.from(values)[0];
                            }
                        }
                    }
                } else {
                    key = propName;
                }

                if (key && key !== Javascript.TO_STRING) {
                    if (prop.type === "ObjectMethod" && prop.kind === "get") {
                        if (prop.body.body.length === 1 &&
                            prop.body.body[0].type === "ReturnStatement") {
                            const retVal = this.resolver.resolveExpression(prop.body.body[0].argument);
                            if (Javascript.isBrowserAPI(retVal?.path)) {
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

                        // Recursively handle nested objects
                        if (prop.value.type === "ObjectExpression") {
                            const nestedPrefix = `${idName}.${key}`;
                            this._handleNestedObjectProperties(nestedPrefix, prop.value);
                        }
                    }
                }
            }
        }

        if (!foundSpread) {
            if (toStringValue !== null) {
                this.vars.set(idName, new Set([toStringValue]));
            } else {
                this.vars.set(idName, new Set([Javascript.OBJECT]));
            }
        }
    }

    // Helper to recursively track nested object properties
    _handleNestedObjectProperties(prefix, objectExpr) {
        for (const prop of objectExpr.properties) {
            if (prop.type === "ObjectProperty") {
                const key = prop.key.type === "Identifier" ? prop.key.name :
                    (prop.key.type === "StringLiteral" ? prop.key.value : null);

                if (key && prop.value) {
                    const propResult = this.resolver.resolveExpression(prop.value);
                    if (propResult?.path) {
                        this.vars.set(`${prefix}.${key}`, new Set([propResult.path]));
                        this.log(`Nested object property: ${prefix}.${key} = ${propResult.path}`);
                    }

                    // Continue recursion
                    if (prop.value.type === "ObjectExpression") {
                        this._handleNestedObjectProperties(`${prefix}.${key}`, prop.value);
                    }
                }
            }
        }
    }

    _handleAssignment(p) {
        const left = p.node.left;
        const right = p.node.right;

        // Handle destructuring assignments
        if (left.type === "ObjectPattern" || left.type === "ArrayPattern") {
            const result = this.resolver.resolveExpression(right);
            const base = result?.path || Javascript.WILDCARD;
            this.handleNestedPattern(left, base);
            return;
        }

        // Handle simple identifier assignments
        if (left.type === "Identifier") {
            const result = this.resolver.resolveExpression(right);

            if (result?.path) {
                this._updateVariable(left.name, result.path);
            } else if (right.type === "StringLiteral") {
                this._updateVariable(left.name, right.value);
            } else {
                // Unknown value (object literal, complex expression, etc.)
                this._updateVariable(left.name, Javascript.WILDCARD);
            }
        }

        // Track Map assignments for chrome API storage
        if (left.type === "MemberExpression" &&
            left.object.type === "Identifier" &&
            this.vars.get(left.object.name)?.has(Javascript.MAP)) {
            const result = this.resolver.resolveExpression(right);
            if (Javascript.isBrowserAPI(result?.path)) {
                this.vars.set(left.object.name, new Set([Javascript.MAP]));
            }
        }
    }

    // Helper: Update variable with browser API taint preservation
    _updateVariable(varName, newValue) {
        if (this.vars.has(varName)) {
            const existing = this.vars.get(varName);
            const hasBrowserTaint = Array.from(existing).some(v =>
                Javascript.isBrowserAPI(v)
            );
            const newIsBrowser = Javascript.isBrowserAPI(newValue);

            if (hasBrowserTaint && newIsBrowser) {
                // Both are browser APIs - merge for branch analysis
                existing.add(newValue);
                this.log(`Variable ${varName}: merged ${newValue}`);
            } else if (hasBrowserTaint) {
                // Conservative analysis: keep browser taint even when assigning non-browser
                existing.add(newValue);
                this.log(`Variable ${varName}: kept browser taint, added ${newValue}`);
            } else {
                // No browser involvement - simple replacement
                this.vars.set(varName, new Set([newValue]));
            }
        } else {
            // First assignment
            this.vars.set(varName, new Set([newValue]));
        }
    }

    _handleClass(p) {
        if (p.node.id) {
            this.vars.set(p.node.id.name, new Set([Javascript.CLASS]));

            for (const item of p.node.body.body) {
                if (item.type === "ClassProperty" && item.value) {
                    const result = this.resolver.resolveExpression(item.value);
                    if (Javascript.isBrowserAPI(result?.path)) {
                        const key = item.key.name || item.key.value;
                        if (key) {
                            this.vars.set(`${p.node.id.name}${Javascript.INSTANCE_SUFFIX}.${key}`, new Set([result.path]));
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
                                if (Javascript.isBrowserAPI(result?.path)) {
                                    this.vars.set(`${p.node.id.name}${Javascript.INSTANCE_SUFFIX}.${key}`, new Set([result.path]));
                                    this.log(`Constructor: ${p.node.id.name}${Javascript.INSTANCE_SUFFIX}.${key} = ${result.path}`);
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
                    if (Javascript.isBrowserAPI(result?.path)) {
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

        // Track default parameter values (e.g., function foo(api = chrome.runtime))
        for (const param of params) {
            if (param.type === "AssignmentPattern") {
                // param.left is the parameter name, param.right is the default value
                if (param.left.type === "Identifier") {
                    const result = this.resolver.resolveExpression(param.right);
                    if (result?.path) {
                        this.vars.set(param.left.name, new Set([result.path]));
                        this.log(`Default parameter: ${param.left.name} = ${result.path}`);
                    }
                }
            }
        }

        if (p.parentPath.isCallExpression()) {
            const callExpr = p.parentPath.node;

            // Check if this is a Promise callback
            if (callExpr.callee.type === "MemberExpression" &&
                callExpr.callee.property.type === "Identifier" &&
                Javascript.PROMISE_METHODS.includes(callExpr.callee.property.name)) {

                // Resolve what the promise contains
                const promiseResult = this.resolver.resolveExpression(callExpr.callee.object);
                if (promiseResult?.path && params.length > 0 && params[0].type === "Identifier") {
                    // First parameter receives the resolved value
                    this.vars.set(params[0].name, new Set([promiseResult.path]));
                    this.log(`Promise callback: ${params[0].name} = ${promiseResult.path}`);
                }
            }

            // Track named parameters
            for (let i = 0; i < params.length; i++) {
                const param = params[i];
                const arg = callExpr.arguments[i];

                // Handle AssignmentPattern (default params)
                const paramName = param.type === "AssignmentPattern" ? param.left : param;

                if (paramName.type === "Identifier" && arg) {
                    const result = this.resolver.resolveExpression(arg);
                    if (result?.path) {
                        this.vars.set(paramName.name, new Set([result.path]));
                        this.vars.set(`${Javascript.ARGUMENTS}[${i}]`, new Set([result.path]));
                    }
                }
            }

            // Track arguments[i] even if no named parameters
            for (let i = params.length; i < callExpr.arguments.length; i++) {
                const arg = callExpr.arguments[i];
                if (arg) {
                    const result = this.resolver.resolveExpression(arg);
                    if (result?.path) {
                        this.vars.set(`${Javascript.ARGUMENTS}[${i}]`, new Set([result.path]));
                        this.log(`${Javascript.ARGUMENTS}[${i}] = ${result.path}`);
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
                OptionalCallExpression: (p) => callHandler.handleCall(p),
                NewExpression: (p) => callHandler.handleNew(p),
            });
        }

        // postprocess
        const result = Array.from(calls).map(name =>
            name.includes(Javascript.DYNAMIC) ? name.replace(/\.DYNAMIC.*/, `.${Javascript.DYNAMIC}`) : name
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
        this.log(`handleCall: ${callee.type}`);

        // Handle special patterns first (these return early if matched)
        if (this._handleSpecialPatterns(p, callee)) return;

        // Unwrap .call()/.apply()/.bind() to get actual function
        const unwrapped = this._unwrapCallApplyBind(callee);

        // Skip Promise chain methods (they're not API calls themselves)
        if (this._isPromiseChainMethod(unwrapped)) return;

        // Handle Promise.resolve/reject with chrome argument
        if (this._handlePromiseFactory(p, unwrapped)) return;

        // Handle dynamic code execution (eval, Function constructor, etc.)
        if (this._handleDynamicCode(p, unwrapped)) return;

        // Handle immediate invocation of new Function()
        if (this._handleImmediateFunctionConstruction(callee)) return;

        // Resolve the callee to see what's being called
        const calleeResult = this.resolver.resolveExpression(unwrapped);

        if (calleeResult?.path) {
            // Check for dynamic code marker
            if (calleeResult.path === Javascript.DYNAMIC_CODE) {
                this._checkDynamicCallArgs(p);
                return;
            }

            // Direct chrome API call
            if (Javascript.isBrowserAPI(calleeResult.path)) {
                this.calls.add(calleeResult.path);
                this.log(`Call: ${calleeResult.path}`);
                return;
            }

            // Instance method call (e.g., wrapper_instance.method())
            if (this._handleInstanceMethodCall(calleeResult.path)) return;
        }

        // Handle variables with multiple possible values (from branching)
        if (this._handleMultiValueVariable(p, unwrapped)) return;

        // Check if chrome is passed as argument to any function
        this._checkChromeAsArgument(p, unwrapped);
    }

    handleNew(p) {
        if (p.node.callee.type === "Identifier" && p.node.callee.name === Javascript.PROXY) {
            const [target] = p.node.arguments;
            const result = this.resolver.resolveExpression(target);

            if (Javascript.isBrowserAPI(result?.path)) {
                const parent = p.parentPath;
                if (parent.isVariableDeclarator() && parent.node.id.type === "Identifier") {
                    this.vars.set(parent.node.id.name, new Set([result.path]));
                    this.log(`${Javascript.PROXY}: ${parent.node.id.name} = ${result.path}`);
                }
            }
        }
    }

    // ===== SPECIAL PATTERN HANDLERS =====

    _handleSpecialPatterns(p, callee) {
        return this._handleReflect(p, callee)
            || this._handleObjectMethods(p, callee)
            || this._handleArrayMethods(p, callee)
            || this._handleMapSet(p, callee);
    }

    _handleReflect(p, callee) {
        if (callee.type !== "MemberExpression") return false;
        if (callee.object.type !== "Identifier" || callee.object.name !== Javascript.REFLECT) return false;

        const method = callee.property.name;

        if (method === Javascript.REFLECT_GET) {
            const [target, prop] = p.node.arguments;
            const targetResult = this.resolver.resolveExpression(target);

            if (Javascript.isBrowserAPI(targetResult?.path)) {
                const propValue = this.evaluator.tryEvaluate(prop);

                if (propValue !== null) {
                    const fullPath = `${targetResult.path}.${propValue}`;

                    // Track for variable assignment
                    const parent = p.parentPath;
                    if (parent.isVariableDeclarator() && parent.node.id.type === "Identifier") {
                        this.vars.set(parent.node.id.name, new Set([fullPath]));
                        this.log(`${Javascript.REFLECT}.${Javascript.REFLECT_GET}: ${parent.node.id.name} = ${fullPath}`);
                    }

                    // Store on node for chained member access
                    p.node._resolvedPath = fullPath;
                } else {
                    this.calls.add(`${targetResult.path}.${Javascript.DYNAMIC}`);
                }
            } else {
                this.calls.add(`chrome.${Javascript.DYNAMIC}`);
            }
            return true;
        }

        if (method === Javascript.REFLECT_APPLY) {
            const [target] = p.node.arguments;
            const result = this.resolver.resolveExpression(target);

            if (Javascript.isBrowserAPI(result?.path)) {
                this.calls.add(result.path);
            } else {
                this.calls.add(`chrome.${Javascript.DYNAMIC}`);
            }
            return true;
        }

        return false;
    }

    _handleObjectMethods(p, callee) {
        if (callee.type !== "MemberExpression") return false;
        if (callee.object.type !== "Identifier" || callee.object.name !== Javascript.OBJECT) return false;

        const method = callee.property.name;

        if (method === Javascript.OBJECT_ASSIGN) {
            return this._handleObjectAssign(p);
        }

        if (method === Javascript.OBJECT_KEYS || method === Javascript.OBJECT_GET_OWN_PROPERTY_DESCRIPTOR) {
            return this._handleObjectIntrospection(p, method);
        }

        if (method === Javascript.OBJECT_ENTRIES || method === Javascript.OBJECT_VALUES) {
            return this._handleObjectIteration(p, method);
        }

        return false;
    }

    _handleArrayMethods(p, callee) {
        if (callee.type !== "MemberExpression") return false;
        if (callee.property.type !== "Identifier") return false;

        const method = callee.property.name;

        if (method === Javascript.ARRAY_MAP || method === Javascript.ARRAY_FILTER) {
            const [callback] = p.node.arguments;
            let hasChromeElements = false;
            let chromeElementPath = null;

            // Check if it's an inline array like [chrome.runtime].map()
            if (callee.object.type === "ArrayExpression") {
                for (const elem of callee.object.elements) {
                    if (elem) {
                        const elemResult = this.resolver.resolveExpression(elem);
                        if (Javascript.isBrowserAPI(elemResult?.path)) {
                            hasChromeElements = true;
                            chromeElementPath = elemResult.path;
                            break;
                        }
                    }
                }
            }
            // Check named arrays: const arr = [chrome.runtime]; arr.map(...)
            else if (callee.object.type === "Identifier" && this.vars.has(callee.object.name)) {
                const arrayType = this.vars.get(callee.object.name);
                if (arrayType.has(Javascript.ARRAY)) {
                    const arrayName = callee.object.name;

                    // Check array[0], array[1], etc.
                    for (let i = 0; i < 10; i++) {
                        const elemKey = `${arrayName}[${i}]`;
                        if (this.vars.has(elemKey)) {
                            const elemPath = this.vars.get(elemKey);
                            if (elemPath.size === 1 && !elemPath.has(Javascript.WILDCARD)) {
                                const path = Array.from(elemPath)[0];
                                if (Javascript.isBrowserAPI(path)) {
                                    hasChromeElements = true;
                                    chromeElementPath = path;
                                    break;
                                }
                            }
                        }
                    }
                }
            }

            if (hasChromeElements && callback) {
                const parent = p.parentPath;
                if (parent.isVariableDeclarator() && parent.node.id.type === "Identifier") {
                    const resultArrayName = parent.node.id.name;

                    // For identity function (x => x), preserve chrome references
                    if (callback.type === "ArrowFunctionExpression" &&
                        callback.params.length === 1 &&
                        callback.params[0].type === "Identifier" &&
                        callback.body.type === "Identifier" &&
                        callback.body.name === callback.params[0].name) {
                        this.vars.set(`${resultArrayName}[0]`, new Set([chromeElementPath]));
                        this.vars.set(resultArrayName, new Set([Javascript.ARRAY]));
                        this.log(`${Javascript.ARRAY}.${method} identity: ${resultArrayName}[0] = ${chromeElementPath}`);
                    } else {
                        this.vars.set(resultArrayName, new Set([Javascript.ARRAY]));
                    }
                }
            }

            return hasChromeElements;
        }

        return false;
    }

    _handleObjectAssign(p) {
        const [target, source] = p.node.arguments;

        if (target && source) {
            const result = this.resolver.resolveExpression(source);

            if (Javascript.isBrowserAPI(result?.path)) {
                if (target.type === "Identifier") {
                    this.vars.set(target.name, new Set([result.path]));
                    this.log(`${Javascript.OBJECT}.${Javascript.OBJECT_ASSIGN}: ${target.name} = ${result.path}`);
                }
            }
        }

        return true;
    }

    _handleObjectIntrospection(p, method) {
        const [target] = p.node.arguments;
        const result = this.resolver.resolveExpression(target);

        if (Javascript.isBrowserAPI(result?.path)) {
            this.calls.add(`${result.path}.${Javascript.DYNAMIC}`);
            this.log(`${Javascript.OBJECT}.${method} on ${result.path}`);
        }

        return true;
    }

    _handleObjectIteration(p, method) {
        const [target] = p.node.arguments;
        const result = this.resolver.resolveExpression(target);

        let hasChromeProperties = false;

        // Check resolved target
        if (Javascript.isBrowserAPI(result?.path)) {
            hasChromeProperties = true;
        }
        // Check object literal properties
        else if (target?.type === "ObjectExpression") {
            for (const prop of target.properties) {
                if (prop.type === "ObjectProperty" && prop.value) {
                    const propResult = this.resolver.resolveExpression(prop.value);
                    if (Javascript.isBrowserAPI(propResult?.path)) {
                        hasChromeProperties = true;
                        break;
                    }
                }
            }
        }

        if (hasChromeProperties) {
            this.calls.add(`chrome.${Javascript.DYNAMIC}`);
            this.log(`${Javascript.OBJECT}.${method} on chrome-containing object`);

            // Track array element
            const parent = p.parentPath;
            if (parent.isVariableDeclarator() && parent.node.id.type === "Identifier") {
                this.vars.set(`${parent.node.id.name}[0]`, new Set([`chrome.${Javascript.DYNAMIC}`]));
            }
        }

        return true;
    }

    _handleMapSet(p, callee) {
        if (callee.type !== "MemberExpression") return false;
        if (callee.property.name !== Javascript.MAP_SET) return false;
        if (callee.object.type !== "Identifier") return false;

        const mapName = callee.object.name;
        const mapType = this.vars.get(mapName);

        if (mapType?.has(Javascript.MAP) || mapType?.has(Javascript.WEAK_MAP)) {
            const [key, value] = p.node.arguments;
            const result = this.resolver.resolveExpression(value);

            if (Javascript.isBrowserAPI(result?.path)) {
                this.vars.set(`${mapName}.${Javascript.CONTAINS_KEY}`, new Set([result.path]));
                this.log(`${Javascript.MAP} ${mapName} contains: ${result.path}`);
            }

            return true;
        }

        return false;
    }

    // ===== CALLEE UNWRAPPING AND FILTERING =====

    _unwrapCallApplyBind(callee) {
        if (callee.type === "MemberExpression" &&
            callee.property.type === "Identifier" &&
            (callee.property.name === Javascript.CALL ||
                callee.property.name === Javascript.APPLY ||
                callee.property.name === Javascript.BIND)) {
            return callee.object;
        }
        return callee;
    }

    _isPromiseChainMethod(callee) {
        if (callee.type !== "MemberExpression") return false;
        if (callee.property.type !== "Identifier") return false;

        const method = callee.property.name;
        return Javascript.PROMISE_METHODS.includes(method);
    }

    _handlePromiseFactory(p, callee) {
        if (callee.type !== "MemberExpression") return false;
        if (callee.object.type !== "Identifier" || callee.object.name !== Javascript.PROMISE) return false;

        const method = callee.property.name;

        if (method === "resolve" || method === "reject") {
            const [arg] = p.node.arguments;

            if (arg) {
                const result = this.resolver.resolveExpression(arg);

                if (Javascript.isBrowserAPI(result?.path)) {
                    this.calls.add(`${result.path}.${Javascript.DYNAMIC}`);
                    this.log(`${Javascript.PROMISE}.${method}(${result.path})`);
                    return true;
                }
            }
        }

        return false;
    }

    // ===== DYNAMIC CODE HANDLERS =====

    _handleDynamicCode(p, callee) {
        // Direct eval() or Function() call
        if (callee.type === "Identifier") {
            if (Javascript.DYNAMIC_CODE_FUNCS.includes(callee.name)) {
                this._checkDynamicCallArgs(p);
                return true;
            }

            // Check if it's an alias to eval/Function
            const values = this.vars.get(callee.name);
            if (values?.has(Javascript.DYNAMIC_CODE)) {
                this._checkDynamicCallArgs(p);
                return true;
            }
        }

        // Handle SequenceExpression like (1, eval)
        if (callee.type === "SequenceExpression") {
            const lastExpr = callee.expressions[callee.expressions.length - 1];

            if (lastExpr.type === "Identifier" &&
                Javascript.DYNAMIC_CODE_FUNCS.includes(lastExpr.name)) {
                this._checkDynamicCallArgs(p);
                return true;
            }
        }

        return false;
    }

    _handleImmediateFunctionConstruction(callee) {
        if (callee.type === "NewExpression" &&
            callee.callee.type === "Identifier" &&
            callee.callee.name === "Function") {
            this.calls.add(Javascript.DYNAMIC);
            return true;
        }
        return false;
    }

    _checkDynamicCallArgs(callPath) {
        let mostSpecificPath = null;

        for (const arg of callPath.node.arguments) {
            const result = this.resolver.resolveExpression(arg);

            if (Javascript.isBrowserAPI(result?.path)) {
                if (!mostSpecificPath || result.path.length > mostSpecificPath.length) {
                    mostSpecificPath = result.path;
                }
            }
        }

        if (mostSpecificPath) {
            this.calls.add(`${mostSpecificPath}.${Javascript.DYNAMIC}`);
            this.log(`Dynamic code with chrome: ${mostSpecificPath}`);
        }

        this.calls.add(Javascript.DYNAMIC);
    }

    // ===== INSTANCE METHOD CALLS =====

    _handleInstanceMethodCall(path) {
        if (!path.includes(Javascript.INSTANCE_SUFFIX)) return false;

        // Look for matching instance properties
        for (const [key, value] of this.vars.entries()) {
            if (key.startsWith(path) && value.size === 1) {
                const chromePath = Array.from(value)[0];

                if (Javascript.isBrowserAPI(chromePath)) {
                    this.calls.add(`${chromePath}.${Javascript.DYNAMIC}`);
                    this.log(`Instance method: ${path} -> ${chromePath}`);
                    return true;
                }
            }
        }

        // Fallback
        this.calls.add(`chrome.${Javascript.DYNAMIC}`);
        return true;
    }

    // ===== MULTI-VALUE VARIABLE HANDLING =====

    _handleMultiValueVariable(p, callee) {
        // Handle case where variable can have multiple chrome API values
        if (callee.type === "MemberExpression" && callee.object.type === "Identifier") {
            const objName = callee.object.name;
            const possibleValues = this.vars.get(objName);

            if (possibleValues && possibleValues.size > 0) {
                const methodName = callee.property.type === "Identifier"
                    ? callee.property.name
                    : (callee.computed ? this.evaluator.tryEvaluate(callee.property) : null);

                if (methodName) {
                    let foundChrome = false;

                    // Add all possible chrome API paths (even if "*" is also in the set)
                    for (const val of possibleValues) {
                        if (Javascript.isBrowserAPI(val)) {
                            this.calls.add(`${val}.${methodName}`);
                            this.log(`Multi-value call: ${val}.${methodName}`);
                            foundChrome = true;
                        }
                    }

                    return foundChrome;
                }
            }
        }

        // Plain identifier with multiple values
        if (callee.type === "Identifier") {
            const possibleValues = this.vars.get(callee.name);

            if (possibleValues && possibleValues.size > 0) {
                let foundAny = false;

                for (const val of possibleValues) {
                    if (val === Javascript.DYNAMIC_CODE) {
                        this.calls.add(Javascript.DYNAMIC);
                        foundAny = true;
                    } else if (Javascript.isBrowserAPI(val)) {
                        this.calls.add(val);
                        this.log(`Identifier call: ${val}`);
                        foundAny = true;
                    }
                }

                return foundAny;
            }
        }

        return false;
    }

    // ===== CHROME AS ARGUMENT DETECTION =====

    _checkChromeAsArgument(p, callee) {
        if (callee.type === "Identifier") {
            const funcName = callee.name;

            // Skip eval/Function - they're handled specially in _handleDynamicCode()
            if (Javascript.DYNAMIC_CODE_FUNCS.includes(funcName)) return;

            // Check if any argument is a chrome reference
            for (const arg of p.node.arguments) {
                const result = this.resolver.resolveExpression(arg);

                if (Javascript.isBrowserAPI(result?.path)) {
                    this.calls.add(`${result.path}.${Javascript.DYNAMIC}`);
                    this.log(`Chrome passed to function: ${funcName}(${result.path})`);
                }
            }
        }
    }
}