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
    "chrome.DYNAMIC"
);

simpleCheck("Map storing chrome API path",
    `
    const map = new Map();
    map.set("api", chrome.runtime);
    map.get("api").sendMessage("hi");
    `,
    "chrome.DYNAMIC"
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
    "chrome.DYNAMIC"
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
    "chrome.DYNAMIC"
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
    "chrome.DYNAMIC"
);
