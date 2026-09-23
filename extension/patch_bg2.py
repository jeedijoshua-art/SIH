import re

with open("src/background/background.ts", "r") as f:
    content = f.read()

new_block = """        } else if (step.type === 'click_result') {
            const index = step.index || 0;
            const ordinalWords = ['first', 'second', 'third', 'fourth', 'fifth'];
            const ordinalWord = index < ordinalWords.length ? ordinalWords[index] : 'first';
            
            try {
                const execRes = await chrome.tabs.sendMessage(targetTabId, { 
                    action: 'EXECUTE_ACTION', 
                    step: { type: 'click_generic', value: `${ordinalWord} result` }, 
                    target_id: '' 
                });
                
                if (execRes && execRes.success) {
                    success = true;
                    after_url = execRes.after_url || currentUrl;
                    reason = execRes.verification?.reason || "Opened search result";
                    reply = `Opened the ${ordinalWord} search result.`;
                } else {
                    success = false;
                    reason = execRes?.verification?.reason || "Could not find a search result on the current page.";
                    reply = reason;
                }
            } catch (e: any) {
                success = false;
                reason = "Error clicking result: " + (e.message || "Could not communicate with page");
                reply = reason;
            }
        } else if (step.type === 'go_back') {"""

# Find the old click_result block
pattern = r"        \} else if \(step\.type === 'click_result'\) \{.*?\} else if \(step\.type === 'go_back'\) \{"

content = re.sub(pattern, new_block, content, flags=re.DOTALL)

with open("src/background/background.ts", "w") as f:
    f.write(content)
