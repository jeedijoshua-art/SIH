const fs = require('fs');

// We'll extract the classifyBrowserCommand function from background.ts
const bgContent = fs.readFileSync('src/background/background.ts', 'utf8');

// Use regex to pull out the classifyBrowserCommand function
const routerRegex = /function classifyBrowserCommand\(task: string\): any \{([\s\S]*?)\nfunction executeBrowserAction/m;
const match = bgContent.match(routerRegex);

if (!match) {
    console.error("Could not find classifyBrowserCommand");
    process.exit(1);
}

const funcCode = `function classifyBrowserCommand(task) {${match[1]}`;

// Define mock resolveDestination
const resolveDestCode = `
function resolveDestination(raw) {
    let dest = raw.trim();
    if (!dest.includes('.') && !dest.startsWith('http') && !dest.includes('localhost')) {
        return { url: \`https://www.google.com/search?q=\${encodeURIComponent(dest)}\`, type: 'search' };
    }
    if (!dest.startsWith('http')) {
        dest = 'https://' + dest;
    }
    return { url: dest, type: 'url' };
}
`;

// Evaluate the functions
eval(resolveDestCode);
eval(funcCode);

// Test cases
const tests = [
    { input: "Open Google in a new tab", expected: "open_tab" },
    { input: "Open YouTube", expected: "open_tab" },
    { input: "Open github.com", expected: "open_tab" },
    { input: "Search Google for Smart India Hackathon", expected: "search" },
    { input: "Search for cats", expected: "search" },
    { input: "Show my open tabs", expected: "list_tabs" },
    { input: "Switch to Google", expected: "switch_tab" },
    { input: "Close this tab", expected: "close_tab" },
    { input: "Reload this page", expected: "reload" },
    { input: "Go back", expected: "go_back" },
    { input: "Go forward", expected: "go_forward" },
    { input: "What tab am I on?", expected: "get_active_tab" },
    
    // Should NOT match
    { input: "Click the red button", expected: null },
    { input: "Fill in the registration form", expected: null },
    { input: "Summarize this page", expected: null }
];

let failed = 0;
console.log("--- BROWSER ROUTER TESTS ---");
for (const t of tests) {
    const res = classifyBrowserCommand(t.input);
    const type = res ? res.type : null;
    if (type === t.expected) {
        console.log(`[PASS] "${t.input}" -> ${type}`);
    } else {
        console.log(`[FAIL] "${t.input}" -> Expected: ${t.expected}, Got: ${type}`);
        failed++;
    }
}

if (failed > 0) process.exit(1);
