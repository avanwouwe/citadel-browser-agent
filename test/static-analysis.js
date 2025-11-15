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


simpleCheck("Dynamic member access (unknown key)",
    `
    const k = "runtime";
    chrome[k + "X"].sendMessage("hi"); // should not match, unknown dynamic
    `
);