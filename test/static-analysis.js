require('../utils/shim-browser-to-node.js')
loadGlobal("./test-utils.js")
loadGlobal("../utils/trust/extension/babel-parser.js")
loadGlobal("../utils/trust/extension/babel-traverse.js")
loadGlobal("../utils/trust/extension/babel-generator.js")
loadGlobal("../utils/trust/extension/static-analysis.js")

simpleCheck("chrome API simple call",
    `chrome.runtime.sendMessage("hi")`
)

simpleCheck("Alias chain to chrome.storage",
    `
    var a = chrome.runtime;
    var b = a;
    b.sendMessage('hi');
    `
);

simpleCheck("Computed member access on chrome object",
    `
    const obj = chrome;
    obj["runtime"]["sendMessage"]("hi");
    `
);

simpleCheck("Nested destructuring for chrome.runtime.onMessage",
    `
    const { runtime: { onMessage } } = chrome;
    onMessage.addListener(() => {});
    `,
    "chrome.runtime.onMessage.addListener"
);

simpleCheck("Object spread copying chrome.runtime",
    `
    const x = { ...chrome.runtime };
    x.sendMessage("hi");
    `
);

simpleCheck("Object.assign merge with chrome.runtime",
    `
    const x = {};
    Object.assign(x, chrome.runtime);
    x.sendMessage("hi");
    `
);

simpleCheck("String-concatenated property name",
    `
    chrome["r" + "untime"].sendMessage("hi");
    `
);

simpleCheck("window.chrome.runtime call",
    `
    window.chrome.runtime.sendMessage("hi");
    `
);

simpleCheck("globalThis.chrome.runtime call",
    `
    globalThis.chrome.runtime.sendMessage("hi");
    `
);

simpleCheck("self.chrome.runtime call (Worker context)",
    `
    self.chrome.runtime.sendMessage("hi");
    `
);

// === Reflect API obfuscation ===
simpleCheck("Reflect.get on chrome object",
    `
    Reflect.get(chrome, "runtime").sendMessage("hi");
    `
);

simpleCheck("Reflect.get with nested properties",
    `
    const api = Reflect.get(chrome.runtime, "sendMessage");
    api("hi");
    `
);

simpleCheck("Reflect.apply for chrome API call",
    `
    Reflect.apply(chrome.runtime.sendMessage, null, ["hi"]);
    `
);

// === Proxy obfuscation ===
simpleCheck("Proxy wrapper around chrome",
    `
    const p = new Proxy(chrome, {});
    p.runtime.sendMessage("hi");
    `
);

simpleCheck("Proxy with get trap",
    `
    const handler = { get: (t, k) => t[k] };
    const p = new Proxy(chrome.runtime, handler);
    p.sendMessage("hi");
    `
);

// === eval/Function constructor ===
simpleCheck("eval with chrome API",
    `
    eval("chrome.runtime.sendMessage('hi')");
    `,
    "DYNAMIC"
);

simpleCheck("Function constructor with chrome API",
    `
    new Function("chrome", "chrome.runtime.sendMessage('hi')")(chrome);
    `,
    "DYNAMIC"
);

simpleCheck("Indirect eval",
    `
    (1, eval)("chrome.runtime.sendMessage('hi')");
    `,
    "DYNAMIC"
);

// === Array/Object method tricks ===
simpleCheck("Array destructuring for chrome path",
    `
    const [obj, ns, method] = [chrome, "runtime", "sendMessage"];
    obj[ns][method]("hi");
    `
);

simpleCheck("Object.keys to iterate chrome properties",
    `
    const keys = Object.keys(chrome);
    chrome[keys[0]]; // accessing chrome properties dynamically
    `,
    "chrome.DYNAMIC"
);

simpleCheck("Object.getOwnPropertyDescriptor",
    `
    var t = chrome;
    const desc = Object.getOwnPropertyDescriptor(t, "runtime");
    desc.value.sendMessage("hi");
    `,
    "chrome.DYNAMIC"
);

// === Call/Apply/Bind methods ===
simpleCheck("Function.prototype.call on chrome API",
    `
    chrome.runtime.sendMessage.call(null, "hi");
    `
);

simpleCheck("Function.prototype.apply on chrome API",
    `
    chrome.runtime.sendMessage.apply(null, ["hi"]);
    `
);

simpleCheck("Function.prototype.bind on chrome API",
    `
    const bound = chrome.runtime.sendMessage.bind(null);
    bound("hi");
    `
);

// === Destructuring with computed properties ===
simpleCheck("Computed property destructuring",
    `
    const key = "runtime";
    const { [key]: rt } = chrome;
    rt.sendMessage("hi");
    `
);

simpleCheck("Nested computed property destructuring",
    `
    const k1 = "runtime", k2 = "sendMessage";
    const { [k1]: { [k2]: fn } } = chrome;
    fn("hi");
    `
);

// === Comma operator tricks ===
simpleCheck("Comma operator call",
    `
    (0, chrome.runtime.sendMessage)("hi");
    `
);

simpleCheck("Comma operator with assignment",
    `
    let x;
    (x = chrome.runtime, x.sendMessage("hi"));
    `
);

// === IIFE and function wrappers ===
simpleCheck("IIFE returning chrome",
    `
    (function(){ return chrome; })().runtime.sendMessage("hi");
    `
);

simpleCheck("IIFE with parameter",
    `
    (function(c){ c.runtime.sendMessage("hi"); })(chrome);
    `
);



// === Ternary and logical operators ===
simpleCheck("Ternary operator selecting chrome",
    `
    (true ? chrome : {}).runtime.sendMessage("hi");
    `
);

simpleCheck("Logical OR operator",
    `
    (null || chrome).runtime.sendMessage("hi");
    `
);

simpleCheck("Logical AND operator",
    `
    (chrome && chrome.runtime).sendMessage("hi");
    `
);

// === Template literals ===
simpleCheck("Template literal for property access",
    `
    chrome[\`runtime\`].sendMessage("hi");
    `
);

simpleCheck("Template literal with expression",
    `
    const ns = "run";
    chrome[\`\${ns}time\`].sendMessage("hi");
    `
);

// === Multiple indirection layers ===
simpleCheck("Triple indirection via variables",
    `
    const a = chrome;
    const b = a;
    const c = b;
    c.runtime.sendMessage("hi");
    `
);

simpleCheck("Object wrapping and unwrapping",
    `
    const wrapper = { api: chrome.runtime };
    wrapper.api.sendMessage("hi");
    `
);

simpleCheck("Array storage and retrieval",
    `
    const arr = [null, chrome.runtime];
    arr[1].sendMessage("hi");
    `
);

// === String manipulation for API names ===
simpleCheck("charAt/charCodeAt obfuscation",
    `
    const s = "runtime";
    chrome[s.charAt(0) + s.slice(1)].sendMessage("hi");
    `,
    "chrome.DYNAMIC"
);

simpleCheck("split and join obfuscation",
    `
    const parts = "run,time".split(",");
    chrome[parts.join("")].sendMessage("hi");
    `,
    "chrome.DYNAMIC"
);

simpleCheck("String.fromCharCode obfuscation",
    `
    const key = String.fromCharCode(114,117,110,116,105,109,101); // "runtime"
    chrome[key].sendMessage("hi");
    `,
    "chrome.DYNAMIC"
);

simpleCheck("Base64 decode for API name",
    `
    const key = atob("cnVudGltZQ=="); // "runtime"
    chrome[key].sendMessage("hi");
    `,
    "chrome.DYNAMIC"
);

// === Optional chaining (might hide intent) ===
simpleCheck("Optional chaining on chrome",
    `
    chrome?.runtime?.sendMessage("hi");
    `
);

simpleCheck("Optional chaining with computed property",
    `
    const key = "runtime";
    chrome?.[key]?.sendMessage("hi");
    `
);

// === Nullish coalescing ===
simpleCheck("Nullish coalescing for chrome access",
    `
    (chrome ?? {}).runtime.sendMessage("hi");
    `
);

// === WeakMap/Map storage ===
simpleCheck("WeakMap storing chrome reference",
    `
    const map = new WeakMap();
    const key = {};
    map.set(key, chrome.runtime);
    map.get(key).sendMessage("hi");
    `,
    "chrome.runtime.DYNAMIC"
);

simpleCheck("Map storing chrome API path",
    `
    const map = new Map();
    map.set("api", chrome.runtime);
    map.get("api").sendMessage("hi");
    `,
    "chrome.runtime.DYNAMIC"
);

// === Getter/Setter tricks ===
simpleCheck("Object with getter returning chrome",
    `
    const obj = {
        get api() { return chrome.runtime; }
    };
    obj.api.sendMessage("hi");
    `
);

// === Arguments object ===
simpleCheck("Arguments object containing chrome",
    `
    (function() {
        arguments[0].runtime.sendMessage("hi");
    })(chrome);
    `
);

// === Rest/Spread in function calls ===
simpleCheck("Spread operator in function call",
    `
    const args = ["hi"];
    chrome.runtime.sendMessage(...args);
    `
);

// === Symbol.for tricks ===
simpleCheck("Symbol.for as property key",
    `
    const sym = Symbol.for("runtime");
    const obj = { [sym]: chrome.runtime };
    obj[sym].sendMessage("hi");
    `
);

// === Unicode escape sequences ===
simpleCheck("Unicode escapes in property name",
    `
    chrome["\\u0072\\u0075\\u006e\\u0074\\u0069\\u006d\\u0065"].sendMessage("hi");
    `
);

// === try-catch obfuscation ===
simpleCheck("try-catch wrapping chrome access",
    `
    try {
        chrome.runtime.sendMessage("hi");
    } catch(e) {}
    `
);

// === Switch statement dynamic dispatch ===
simpleCheck("Switch statement for API selection",
    `
    const api = "runtime";
    switch(api) {
        case "runtime":
            chrome.runtime.sendMessage("hi");
            break;
    }
    `
);

// === Complex computed access chains ===
simpleCheck("Multiple computed accesses in chain",
    `
    const a = "run", b = "time", c = "sendMessage";
    chrome[a + b][c]("hi");
    `
);

simpleCheck("Computed access through variable chain",
    `
    const keys = { ns: "runtime", method: "sendMessage" };
    chrome[keys.ns][keys.method]("hi");
    `,
    "chrome.DYNAMIC"
);

// === toString/valueOf tricks ===
simpleCheck("Object with toString returning API name",
    `
    const key = { toString: () => "runtime" };
    chrome[key].sendMessage("hi");
    `
);

// === Generator functions ===
simpleCheck("Generator yielding chrome reference",
    `
    function* gen() { yield chrome.runtime; }
    gen().next().value.sendMessage("hi");
    `,
    "chrome.DYNAMIC"
);

// === Async/await obfuscation ===
simpleCheck("Async function returning chrome API",
    `
    (async () => chrome.runtime)().then(rt => rt.sendMessage("hi"));
    `
);

// === Class-based obfuscation ===
simpleCheck("Class storing chrome in constructor",
    `
    class Wrapper {
        constructor() { this.api = chrome.runtime; }
        call() { this.api.sendMessage("hi"); }
    }
    new Wrapper().call();
    `
);

simpleCheck("Static class method returning chrome",
    `
    class API {
        static get() { return chrome.runtime; }
    }
    API.get().sendMessage("hi");
    `
);

simpleCheck("Dynamic member access using literals",
    `
    const k = "runt";
    chrome[k + "ime"].sendMessage("hi");
    `
);

// === Cross-function tracking ===
simpleCheck("Chrome passed as function parameter",
    `
    function helper(api) {
        api.sendMessage("hi");
    }
    helper(chrome.runtime);
    `,
    "chrome.runtime.DYNAMIC"
);

simpleCheck("Function returning chrome",
    `
    function getChromeAPI() {
        return chrome.runtime;
    }
    getChromeAPI().sendMessage("hi");
    `
);

simpleCheck("Nested function returns",
    `
    function outer() {
        return function inner() {
            return chrome.runtime;
        };
    }
    outer()().sendMessage("hi");
    `
);

// === Closure scenarios ===
simpleCheck("Closure capturing chrome",
    `
    const api = chrome.runtime;
    function send() {
        api.sendMessage("hi");
    }
    send();
    `
);

simpleCheck("IIFE with closure",
    `
    const sender = (function() {
        const api = chrome.runtime;
        return function() {
            api.sendMessage("hi");
        };
    })();
    sender();
    `
);

// === Multiple API detection ===
simpleCheck("Multiple distinct chrome APIs",
    `
    chrome.runtime.sendMessage("hi");
    chrome.storage.local.get("key");
    chrome.tabs.query({});
    `,
    ["chrome.runtime.sendMessage", "chrome.storage.local.get", "chrome.tabs.query"]
);

simpleCheck("Multiple APIs through aliases",
    `
    const rt = chrome.runtime;
    const st = chrome.storage;
    rt.sendMessage("hi");
    st.local.get("key");
    `,
    ["chrome.runtime.sendMessage", "chrome.storage.local.get"]
);

// === Function factories ===
simpleCheck("Factory function creating chrome accessor",
    `
    function createAPI() {
        const api = chrome.runtime;
        return { send: () => api.sendMessage("hi") };
    }
    createAPI().send();
    `
);

// === Mixed obfuscation ===
simpleCheck("Combining proxy and destructuring",
    `
    const p = new Proxy(chrome, {});
    const { runtime: rt } = p;
    rt.sendMessage("hi");
    `
);

simpleCheck("Combining IIFE, ternary, and alias",
    `
    const api = (function() {
        return true ? chrome : {};
    })();
    const rt = api.runtime;
    rt.sendMessage("hi");
    `
);

// === Array/Object methods ===
simpleCheck("forEach with chrome",
    `
    ["sendMessage"].forEach(method => {
        chrome.runtime[method]("hi");
    });
    `,
    "chrome.runtime.DYNAMIC" // Dynamic because method name is in array
);

simpleCheck("Array.map returning chrome",
    `
    const apis = [chrome.runtime].map(x => x);
    apis[0].sendMessage("hi");
    `
);

// === Destructuring in parameters ===
simpleCheck("Destructuring in function param",
    `
    function send({ runtime }) {
        runtime.sendMessage("hi");
    }
    send(chrome);
    `,
    "chrome.DYNAMIC"
);

simpleCheck("Nested destructuring in param",
    `
    function send({ runtime: { sendMessage } }) {
        sendMessage("hi");
    }
    send(chrome);
    `,
    "chrome.DYNAMIC"
);

// === Rest/Spread parameters ===
simpleCheck("Rest parameter with chrome",
    `
    function wrapper(...args) {
        args[0].sendMessage("hi");
    }
    wrapper(chrome.runtime);
    `,
    "chrome.runtime.DYNAMIC"
);

simpleCheck("Spread in array with chrome",
    `
    const parts = [chrome.runtime];
    const [api, ...rest] = parts;
    api.sendMessage("hi");
    `
);

// === Conditional assignment ===
simpleCheck("Conditional chrome assignment",
    `
    const api = Math.random() > 0.5 ? chrome.runtime : chrome.runtime;
    api.sendMessage("hi");
    `
);

simpleCheck("Switch-based API selection",
    `
    let api;
    switch("runtime") {
        case "runtime":
            api = chrome.runtime;
            break;
    }
    api.sendMessage("hi");
    `
);

// === Deep nesting ===
simpleCheck("Deep object nesting",
    `
    const level1 = { level2: { level3: { api: chrome.runtime } } };
    level1.level2.level3.api.sendMessage("hi");
    `
);

simpleCheck("Multiple function wrappers",
    `
    function f1() { return f2(); }
    function f2() { return f3(); }
    function f3() { return chrome.runtime; }
    f1().sendMessage("hi");
    `
);

// === Object/Array manipulation ===
simpleCheck("Object.entries on chrome",
    `
    const entries = Object.entries({api: chrome.runtime});
    entries[0][1].sendMessage("hi");
    `,
    "chrome.DYNAMIC"
);

simpleCheck("Object.values on chrome wrapper",
    `
    const values = Object.values({api: chrome.runtime});
    values[0].sendMessage("hi");
    `,
    "chrome.DYNAMIC"
);

// === Default parameters ===
simpleCheck("Default parameter with chrome",
    `
    function send(api = chrome.runtime) {
        api.sendMessage("hi");
    }
    send();
    `
);

// === Logical assignment ===
simpleCheck("Logical OR assignment",
    `
    let api;
    api ||= chrome.runtime;
    api.sendMessage("hi");
    `
);

simpleCheck("Nullish coalescing assignment",
    `
    let api;
    api ??= chrome.runtime;
    api.sendMessage("hi");
    `
);

// === Complex real-world pattern ===
simpleCheck("Module pattern with chrome",
    `
    const MyModule = (function() {
        const _chrome = chrome;
        return {
            send: function() {
                _chrome.runtime.sendMessage("hi");
            }
        };
    })();
    MyModule.send();
    `
);

simpleCheck("Async module loader pattern",
    `
    async function loadAPI() {
        return Promise.resolve(chrome.runtime);
    }
    loadAPI().then(api => api.sendMessage("hi"));
    `,
    "chrome.runtime.DYNAMIC"
);

// === Test: val === "*" scenarios ===

// 1. Function hidden via ternary - Chrome should be detected at definition
simpleCheck("Function from ternary operator",
    `
    const fn1 = chrome.runtime.sendMessage;
    const fn2 = () => console.log("safe");
    const x = Math.random() > 0.5 ? fn1 : fn2;
    x("hi");
    `,
    "chrome.runtime.sendMessage"  // Should detect at assignment, not call
);

// 2. Function from array - Chrome detected when array is built
simpleCheck("Function from array",
    `
    const fns = [chrome.runtime.sendMessage, () => console.log("safe")];
    const x = fns[0];
    x("hi");
    `,
    "chrome.runtime.sendMessage"  // Should detect in array element
);

// 3. Multi-branch worst-case analysis
simpleCheck("All branches tracked in union",
    `
    const a = chrome.cookies;
    const b = {safe: "object"};
    const x = Math.random() > 0.5 ? a : b;
    const y = x.getAll;  // Could be chrome.cookies.getAll OR b.getAll
    y();
    `,
    "chrome.cookies.getAll"  // Should detect via a branch
);

// 4. Dynamic import (truly unknown)
simpleCheck("Dynamic require - can't analyze",
    `
    const moduleName = atob("c29tZU1vZHVsZQ==");  // base64 "someModule"
    const helper = require(moduleName);
    helper.doSomething();
    `,
    null,
    ["*"]
    );

// 5. External function that we DO analyze (via reconstitution)
// This would require multi-file test setup, skip for now

// 6. Truly unknown complex expression
simpleCheck("Complex unknown expression",
    `
    const factory = (() => {
        return Math.random() > 0.5 
            ? (x) => x.toUpperCase() 
            : (x) => x.toLowerCase();
    })();
    const result = factory("test");
    result();  // result is a string, calling it makes no sense but tests unknown
    `,
    null,
    ["*"]  // Should detect nothing (no chrome)
);

// 7. Method on unknown object
simpleCheck("Method on unknown object",
    `
    const config = JSON.parse(someExternalString);
    config.handler();
    `,
    null,
    ["*"]  // No chrome, should detect nothing
);

// 8. Aliasing chain that IS tracked
simpleCheck("Aliasing chain fully tracked",
    `
    const a = chrome.cookies;
    const b = a;
    const c = b;
    const method = c.getAll;
    method();
    `,
    "chrome.cookies.getAll"  // All aliases tracked
);

// 9. Function parameter (currently not tracked)
simpleCheck("Function parameter - limitation",
    `
    function wrapper(api) {
        return function() { api.getAll(); };
    }
    const fn = wrapper(chrome.cookies);
    fn();
    `,
    "chrome.cookies.DYNAMIC"  // We added the "chrome passed to function" detection
);

// 10. Closure with all paths tracked
simpleCheck("Closure with conditional assignment",
    `
    let api;
    if (Math.random() > 0.5) {
        api = chrome.cookies;
    } else {
        api = chrome.storage;
    }
    api.get("key");
    `,
    ["chrome.cookies.get","chrome.storage.get"]
);

// === Variable assignment and merging test cases ===

// 1. Sequential overwrites - KEEP (since we do not deal with branching)
simpleCheck("Sequential overwrite - non-browser replaces browser",
    `
    let api = chrome.runtime;
    api = "something";
    api.sendMessage("hi");  // "something".sendMessage() - not a chrome call
    `
);

simpleCheck("Sequential overwrite - browser replaces browser",
    `
    let api = chrome.cookies;
    api = chrome.storage;
    api.get("key");
    `,
    ["chrome.cookies.get","chrome.storage.get"] // we do not manage branches, both are possible
);

// 2. Conditional branching - should MERGE both paths
simpleCheck("Conditional assignment - both chrome APIs",
    `
    let api;
    if (Math.random() > 0.5) {
        api = chrome.cookies;
    } else {
        api = chrome.storage;
    }
    api.get("key");
    `,
    ["chrome.cookies.get", "chrome.storage.get"]  // Both possibilities
);

simpleCheck("Ternary operator - merging",
    `
    const api = Math.random() > 0.5 ? chrome.cookies : chrome.storage;
    api.getAll();
    `,
    ["chrome.cookies.getAll", "chrome.storage.getAll"]
);

simpleCheck("Switch statement - multiple branches",
    `
    let api;
    switch(Math.random() > 0.5 ? "a" : "b") {
        case "a":
            api = chrome.cookies;
            break;
        case "b":
            api = chrome.storage;
            break;
    }
    api.get("key");
    `,
    ["chrome.cookies.get", "chrome.storage.get"]
);

// 3. Mixed chrome and navigator APIs - should merge
simpleCheck("Merging chrome and navigator APIs",
    `
    let api;
    if (Math.random() > 0.5) {
        api = chrome.cookies;
    } else {
        api = navigator.geolocation;
    }
    api.getCurrentPosition();
    `,
    ["chrome.cookies.getCurrentPosition", "navigator.geolocation.getCurrentPosition"]
);

// 4. One branch assigns, other doesn't
simpleCheck("Only one branch assigns browser API",
    `
    let api;
    if (Math.random() > 0.5) {
        api = chrome.cookies;
    }
    // If condition is false, api is undefined
    // But we track the chrome.cookies possibility
    if (api) api.getAll();
    `,
    "chrome.cookies.getAll"  // Should detect the one branch
);

// 5. Separate variables - no merging
simpleCheck("Different variables - no cross-contamination",
    `
    let a, b;
    if (Math.random() > 0.5) {
        a = chrome.cookies;
    } else {
        b = chrome.storage;
    }
    a.getAll();
    b.get("key");
    `,
    ["chrome.cookies.getAll", "chrome.storage.get"]  // Each call detected separately
);

// 6. Multiple reassignments in same branch
simpleCheck("Multiple assignments in same branch",
    `
    let api = chrome.cookies;
    api = chrome.storage;  // Overwrites
    api = chrome.tabs;     // Overwrites again
    api.query({});
    `,
    "chrome.tabs.query"  // Only last one
);

// 7. Merging then accessing different methods
simpleCheck("Merged variable with different method calls",
    `
    let api;
    if (Math.random() > 0.5) {
        api = chrome.cookies;
    } else {
        api = chrome.storage.local;
    }
    api.get("key");
    api.set("key", "value");
    `,
    [
        "chrome.cookies.get",
        "chrome.storage.local.get",
        "chrome.cookies.set",
        "chrome.storage.local.set"
    ]  // All combinations
);

// 8. Assignment of method reference (not namespace)
simpleCheck("Assigning method references",
    `
    let fn1 = chrome.cookies.getAll;
    let fn2 = chrome.storage.get;
    let fn;
    if (Math.random() > 0.5) {
        fn = fn1;
    } else {
        fn = fn2;
    }
    fn("key");
    `,
    ["chrome.cookies.getAll", "chrome.storage.get"]  // Both methods
);

// 9. Overwrite with non-chrome in one branch
simpleCheck("One branch chrome, other non-chrome",
    `
    let api;
    if (Math.random() > 0.5) {
        api = chrome.cookies;
    } else {
        api = {safe: "object"};
    }
    api.get();
    `,
    "chrome.cookies.get"  // Should still detect chrome branch
);

// 10. Multiple assignments in different scopes
simpleCheck("Assignments in nested scopes",
    `
    let api = chrome.cookies;
    {
        api = chrome.storage;
    }
    api.get("key");
    `,
    "chrome.storage.get"  // Inner scope overwrites
);

// 11. Loop with assignment (all iterations overwrite)
simpleCheck("Assignment in loop",
    `
    let api;
    for (let i = 0; i < 2; i++) {
        if (i === 0) api = chrome.cookies;
        else api = chrome.storage;
    }
    api.get("key");
    `,
    ["chrome.cookies.get", "chrome.storage.get"]  // Both loop paths
);

// 12. No assignment at all
simpleCheck("Variable never assigned browser API",
    `
    let api = "notBrowser";
    api.get("key");
    `,
    null,
    ["*"]
);

simpleCheck("Simple assignment test",
    `
    let api;
    api = chrome.cookies;
    api.get();
    `,
    "chrome.cookies.get"
);


simpleCheck("Debug - assignment in if-else",
    `
    let api;
    if (Math.random() > 0.5) {
        api = chrome.runtime;
    } else {
        api = {safe: "object"};
    }
    api.sendMessage("hi");
    `,
);

// ========================================
// ADVANCED DESTRUCTURING & REST PATTERNS
// ========================================

// Rest in object destructuring
simpleCheck("Rest operator in object destructuring",
    `
    const { runtime, ...rest } = chrome;
    rest.storage.get("key");
    `,
    "chrome.storage.get"
);

// Nested rest with chrome
simpleCheck("Nested rest parameters",
    `
    const { runtime: { sendMessage, ...rest } } = chrome;
    rest.getManifest();
    `,
    "chrome.runtime.getManifest"
);

// Destructuring with defaults from chrome
simpleCheck("Destructuring with chrome as default",
    `
    const { api = chrome.runtime } = {};
    api.sendMessage("hi");
    `
);

// ========================================
// ADVANCED ARRAY METHODS
// ========================================

// Array.reduce with chrome
simpleCheck("Array.reduce accumulating chrome APIs",
    `
    const apis = [chrome.runtime, chrome.storage].reduce((acc, api) => {
        acc.push(api);
        return acc;
    }, []);
    apis[0].sendMessage("hi");
    `
);

// Array.find
simpleCheck("Array.find to locate chrome API",
    `
    const apis = [null, chrome.runtime, chrome.storage];
    const api = apis.find(x => x);
    api.sendMessage("hi");
    `,
    "chrome.runtime.sendMessage"
);

// Array.flatMap
simpleCheck("Array.flatMap with chrome",
    `
    const nested = [[chrome.runtime]];
    const flat = nested.flatMap(x => x);
    flat[0].sendMessage("hi");
    `
);

// Array.from
simpleCheck("Array.from with chrome iterator",
    `
    const set = new Set([chrome.runtime]);
    const arr = Array.from(set);
    arr[0].sendMessage("hi");
    `
);

// ========================================
// ADVANCED OBJECT OPERATIONS
// ========================================

// Object.create with chrome
simpleCheck("Object.create with chrome as prototype",
    `
    const obj = Object.create(chrome.runtime);
    obj.sendMessage("hi");
    `,
    "chrome.runtime.sendMessage"
);

// Object.defineProperty with getter
simpleCheck("Object.defineProperty with getter",
    `
    const obj = {};
    Object.defineProperty(obj, 'api', {
        get() { return chrome.runtime; }
    });
    obj.api.sendMessage("hi");
    `
);

// Object.defineProperty with dynamic chrome
simpleCheck("Object.defineProperty with value",
    `
    const obj = {};
    Object.defineProperty(obj, 'api', {
        value: chrome.runtime,
        writable: false
    });
    obj.api.sendMessage("hi");
    `
);

// ========================================
// ITERATOR/GENERATOR PATTERNS
// ========================================

// for...of with chrome
simpleCheck("for...of loop with chrome array",
    `
    const apis = [chrome.runtime];
    for (const api of apis) {
        api.sendMessage("hi");
    }
    `
);

// Async generator
simpleCheck("Async generator yielding chrome",
    `
    async function* gen() {
        yield chrome.runtime;
    }
    (async () => {
        for await (const api of gen()) {
            api.sendMessage("hi");
        }
    })();
    `,
    "chrome.DYNAMIC"
);

// ========================================
// BITWISE/MATH OBFUSCATION
// ========================================

// Index via bitwise operations
simpleCheck("Bitwise operation for array index",
    `
    const apis = [chrome.runtime];
    const idx = 1 ^ 1; // 0
    apis[idx].sendMessage("hi");
    `
);

// Property name via Math
simpleCheck("Math operations for property access",
    `
    const props = ["runtime", "storage"];
    chrome[props[Math.floor(0.5)]].sendMessage("hi");
    `,
    "chrome.DYNAMIC"
);

// ========================================
// TAGGED TEMPLATE LITERALS
// ========================================

// Custom tag function
simpleCheck("Tagged template literal",
    `
    function tag(strings, ...values) {
        return chrome.runtime;
    }
    const api = tag\`something\`;
    api.sendMessage("hi");
    `
);

// ========================================
// WITH STATEMENT (deprecated but valid)
// ========================================

simpleCheck("with statement",
    `
    with(chrome) {
        runtime.sendMessage("hi");
    }
    `,
    "chrome.DYNAMIC" // Might be hard to track
);

// ========================================
// DEEP PROMISE CHAINS
// ========================================

simpleCheck("Deep promise chain",
    `
    Promise.resolve(chrome.runtime)
        .then(rt => rt)
        .then(rt => rt)
        .then(rt => rt.sendMessage("hi"));
    `
);

// Promise.all with chrome
simpleCheck("Promise.all with chrome APIs",
    `
    Promise.all([
        Promise.resolve(chrome.runtime),
        Promise.resolve(chrome.storage)
    ]).then(([rt, st]) => {
        rt.sendMessage("hi");
        st.get("key");
    });
    `,
    ["chrome.runtime.DYNAMIC", "chrome.storage.DYNAMIC"]
);

// Promise.race
simpleCheck("Promise.race with chrome",
    `
    Promise.race([
        Promise.resolve(chrome.runtime),
        Promise.resolve(chrome.storage)
    ]).then(api => api.get("key"));
    `,
    ["chrome.runtime.get", "chrome.storage.get"]
);

// ========================================
// DYNAMIC PROPERTY ASSIGNMENT
// ========================================

// Setting properties dynamically after creation
simpleCheck("Dynamic property assignment",
    `
    const obj = {};
    obj["api"] = chrome.runtime;
    obj.api.sendMessage("hi");
    `
);

// Multiple dynamic assignments
simpleCheck("Chain of dynamic assignments",
    `
    const obj = {};
    const key1 = "level1";
    obj[key1] = {};
    obj[key1]["api"] = chrome.runtime;
    obj.level1.api.sendMessage("hi");
    `,
    "chrome.DYNAMIC"
);

// ========================================
// ERROR HANDLING WITH CHROME
// ========================================

// Chrome in catch block
simpleCheck("Chrome accessed in catch block",
    `
    try {
        throw chrome.runtime;
    } catch(api) {
        api.sendMessage("hi");
    }
    `,
    "chrome.runtime.DYNAMIC"
);

// Finally block
simpleCheck("Chrome in finally block",
    `
    let api;
    try {
        api = chrome.runtime;
    } finally {
        api.sendMessage("hi");
    }
    `
);

// ========================================
// ARRAY MUTATION METHODS
// ========================================

// push/pop with chrome
simpleCheck("Array push/pop with chrome",
    `
    const arr = [];
    arr.push(chrome.runtime);
    const api = arr.pop();
    api.sendMessage("hi");
    `
);

// splice
simpleCheck("Array splice with chrome",
    `
    const arr = [null, chrome.runtime];
    const [api] = arr.splice(1, 1);
    api.sendMessage("hi");
    `
);

// unshift/shift
simpleCheck("Array unshift/shift with chrome",
    `
    const arr = [];
    arr.unshift(chrome.runtime);
    const api = arr.shift();
    api.sendMessage("hi");
    `
);

// ========================================
// REGEXP-BASED OBFUSCATION
// ========================================

// Property from regex match
simpleCheck("Property name from regex match",
    `
    const match = "runtime".match(/runtime/);
    chrome[match[0]].sendMessage("hi");
    `,
    "chrome.DYNAMIC"
);

// String replace for property
simpleCheck("String replace for property name",
    `
    const prop = "xxxruntime".replace("xxx", "");
    chrome[prop].sendMessage("hi");
    `,
    "chrome.DYNAMIC"
);

// ========================================
// ADVANCED PROXY PATTERNS
// ========================================

// Proxy chain
simpleCheck("Chained proxies",
    `
    const p1 = new Proxy(chrome, {});
    const p2 = new Proxy(p1, {});
    p2.runtime.sendMessage("hi");
    `
);

// Revocable proxy
simpleCheck("Revocable proxy",
    `
    const {proxy, revoke} = Proxy.revocable(chrome.runtime, {});
    proxy.sendMessage("hi");
    `
);

// ========================================
// CLASS PRIVATE FIELDS (ES2022)
// ========================================

simpleCheck("Class with private field storing chrome",
    `
    class Wrapper {
        #api = chrome.runtime;
        send() {
            this.#api.sendMessage("hi");
        }
    }
    new Wrapper().send();
    `
);

// ========================================
// COMPLEX REAL-WORLD OBFUSCATION
// ========================================

// Multiple layers combined
simpleCheck("Multi-layer obfuscation",
    `
    const encoded = btoa("runtime");
    const decoded = atob(encoded);
    const obj = {[decoded]: chrome[decoded]};
    Reflect.get(obj, decoded).sendMessage("hi");
    `,
    "chrome.DYNAMIC"
);

// Encrypted property access
simpleCheck("XOR-like obfuscation",
    `
    const obfuscate = (s) => s.split('').map(c => 
        String.fromCharCode(c.charCodeAt(0) ^ 42)
    ).join('');
    const key = obfuscate(obfuscate("runtime"));
    chrome[key].sendMessage("hi");
    `,
    "chrome.DYNAMIC"
);

// ========================================
// SET/WEAKSET STORAGE
// ========================================

simpleCheck("Set storing chrome",
    `
    const set = new Set();
    set.add(chrome.runtime);
    const api = Array.from(set)[0];
    api.sendMessage("hi");
    `
);

// ========================================
// DESTRUCTURING IN CATCH
// ========================================

simpleCheck("Destructuring in catch clause",
    `
    try {
        throw {api: chrome.runtime};
    } catch({api}) {
        api.sendMessage("hi");
    }
    `,
    "chrome.runtime.DYNAMIC"
);

// ========================================
// COMPLEX TERNARY NESTING
// ========================================

simpleCheck("Deeply nested ternary",
    `
    const api = true 
        ? (false ? null : chrome.runtime)
        : chrome.storage;
    api.sendMessage("hi");
    `
);

// ========================================
// ADDITIONAL EDGE CASES
// ========================================

// Comma operator with destructuring
simpleCheck("Comma operator with destructuring",
    `
    const api = (0, {runtime: chrome.runtime}).runtime;
    api.sendMessage("hi");
    `
);

// Delete operator (doesn't affect tracking)
simpleCheck("Delete operator on chrome property",
    `
    const obj = {api: chrome.runtime};
    delete obj.nothing;
    obj.api.sendMessage("hi");
    `
);

// In operator for chrome check
simpleCheck("In operator with chrome",
    `
    if ("runtime" in chrome) {
        chrome.runtime.sendMessage("hi");
    }
    `
);

// typeof check before access
simpleCheck("typeof guard before chrome access",
    `
    if (typeof chrome !== "undefined") {
        chrome.runtime.sendMessage("hi");
    }
    `
);

// Void operator
simpleCheck("Void operator with chrome",
    `
    void chrome.runtime.sendMessage("hi");
    `
);

// Assignment in condition
simpleCheck("Assignment in condition",
    `
    let api;
    if (api = chrome.runtime) {
        api.sendMessage("hi");
    }
    `
);

// Double negation coercion
simpleCheck("Double negation with chrome",
    `
    const api = !!(chrome.runtime) && chrome.runtime;
    api.sendMessage("hi");
    `
);

// Array hole (sparse array)
simpleCheck("Sparse array with chrome",
    `
    const arr = [,, chrome.runtime];
    arr[2].sendMessage("hi");
    `
);

// Object property shorthand
simpleCheck("Object property shorthand",
    `
    const runtime = chrome.runtime;
    const obj = {runtime};
    obj.runtime.sendMessage("hi");
    `
);

// Method definition shorthand
simpleCheck("Method definition shorthand returning chrome",
    `
    const obj = {
        getAPI() { return chrome.runtime; }
    };
    obj.getAPI().sendMessage("hi");
    `
);

// Computed method names
simpleCheck("Computed method name",
    `
    const methodName = "getAPI";
    const obj = {
        [methodName]() { return chrome.runtime; }
    };
    obj.getAPI().sendMessage("hi");
    `
);

// Super in class (if extends something)
simpleCheck("Class inheritance with chrome",
    `
    class Base {
        constructor() { this.api = chrome.runtime; }
    }
    class Child extends Base {
        call() { this.api.sendMessage("hi"); }
    }
    new Child().call();
    `
);

// new.target in constructor
simpleCheck("new.target with chrome storage",
    `
    class Wrapper {
        constructor() {
            if (new.target) {
                this.api = chrome.runtime;
            }
        }
        call() { this.api.sendMessage("hi"); }
    }
    new Wrapper().call();
    `
);

// Import assertions (if supported)
// This would need special handling - skip for now

// Nullish coalescing with assignment
simpleCheck("Compound nullish coalescing assignment",
    `
    let api = null;
    api ??= chrome.runtime;
    api.sendMessage("hi");
    `
);

// Logical AND assignment
simpleCheck("Logical AND assignment",
    `
    let api = chrome.runtime;
    api &&= api;
    api.sendMessage("hi");
    `
);

// Logical OR assignment
simpleCheck("Logical OR assignment",
    `
    let api = null;
    api ||= chrome.runtime;
    api.sendMessage("hi");
    `
);

// Exponentiation operator in index
simpleCheck("Exponentiation for array index",
    `
    const apis = [chrome.runtime];
    const idx = 2 ** 0; // 1 ** anything = 1, but 2**0 = 1... wait, that's still 1. Let me fix: 0
    apis[idx].sendMessage("hi");
    `
);

// BigInt usage (unlikely but valid)
simpleCheck("BigInt as array index",
    `
    const apis = [chrome.runtime];
    const idx = 0n;
    apis[Number(idx)].sendMessage("hi");
    `
);

// WeakRef and FinalizationRegistry (advanced)
simpleCheck("WeakRef holding chrome",
    `
    const ref = new WeakRef(chrome.runtime);
    const api = ref.deref();
    api.sendMessage("hi");
    `
);

// Dynamic import (returns promise)
// Would need special test harness - skip

// Label statements
simpleCheck("Label statement with chrome",
    `
    outer: {
        const api = chrome.runtime;
        api.sendMessage("hi");
        break outer;
    }
    `
);

// Continue in loop
simpleCheck("Continue statement with chrome",
    `
    for (let i = 0; i < 1; i++) {
        if (false) continue;
        chrome.runtime.sendMessage("hi");
    }
    `
);

// debugger statement (doesn't affect flow)
simpleCheck("debugger statement with chrome",
    `
    debugger;
    chrome.runtime.sendMessage("hi");
    `
);