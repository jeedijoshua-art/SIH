import re

with open("src/background/background.ts", "r") as f:
    content = f.read()

# 1. Add click_generic to classifyBrowserCommand
click_generic_parser = """
    let clickMatch = lower.match(/^click (the )?(.+)$/);
    if (clickMatch && !lower.match(/result$/)) {
        return { type: 'click_generic', value: clickMatch[2] };
    }

    if (/^open (.+) in a new tab$/.test(lower) || /^open a new tab for (.+)$/.test(lower) || /^go to (.+) in a new tab$/.test(lower)) {"""

content = content.replace("    if (/^open (.+) in a new tab$/.test(lower) || /^open a new tab for (.+)$/.test(lower) || /^go to (.+) in a new tab$/.test(lower)) {", click_generic_parser, 1)

# 2. Add click_generic handler to executeBrowserAction
click_generic_handler = """        } else if (step.type === 'click_generic') {
            try {
                const execRes = await chrome.tabs.sendMessage(targetTabId, { 
                    action: 'EXECUTE_ACTION', 
                    step: { type: 'click_generic', value: step.value }, 
                    target_id: '' 
                });
                
                if (execRes && execRes.success) {
                    success = true;
                    after_url = execRes.after_url || currentUrl;
                    reason = execRes.verification?.reason || "Clicked element";
                    reply = `Clicked: ${step.value}`;
                } else {
                    success = false;
                    reason = execRes?.verification?.reason || `Could not find a clickable element for '${step.value}'.`;
                    reply = reason;
                }
            } catch (e: any) {
                success = false;
                reason = "Error clicking element: " + (e.message || "Could not communicate with page");
                reply = reason;
            }
        } else if (step.type === 'go_back') {"""

content = content.replace("        } else if (step.type === 'go_back') {", click_generic_handler, 1)

with open("src/background/background.ts", "w") as f:
    f.write(content)
