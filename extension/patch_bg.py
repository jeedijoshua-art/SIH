import re

with open("src/background/background.ts", "r") as f:
    content = f.read()

# 1. Add classification
class_block = """    let match = lower.match(/^(open|click)( the)? (first|second|third|1st|2nd|3rd)( search)? result$/);
    if (match) {
        let ordinal = match[3];
        let index = 0;
        if (ordinal === 'second' || ordinal === '2nd') index = 1;
        if (ordinal === 'third' || ordinal === '3rd') index = 2;
        return { type: 'click_result', index: index };
    }

    if (/^open (.+) in a new tab$/.test(lower) || /^open a new tab for (.+)$/.test(lower) || /^go to (.+) in a new tab$/.test(lower)) {"""

content = content.replace("    if (/^open (.+) in a new tab$/.test(lower) || /^open a new tab for (.+)$/.test(lower) || /^go to (.+) in a new tab$/.test(lower)) {", class_block, 1)

# 2. Add execution in executeBrowserAction
exec_block = """        } else if (step.type === 'click_result') {
            const index = step.index || 0;
            try {
                const resultUrl = await new Promise((resolve) => {
                    chrome.scripting.executeScript({
                        target: { tabId: targetTabId },
                        func: (idx) => {
                            const results = Array.from(document.querySelectorAll('div.g'));
                            let organicResults = [];
                            for (const r of results) {
                                const a = r.querySelector('a');
                                if (a && a.href && !a.href.includes('google.com') && !a.closest('.related-question-pair') && !a.closest('g-section-with-header')) {
                                    organicResults.push(a.href);
                                }
                            }
                            return organicResults.length > idx ? organicResults[idx] : null;
                        },
                        args: [index]
                    }, (res) => {
                        if (res && res[0] && res[0].result) {
                            resolve(res[0].result);
                        } else {
                            resolve(null);
                        }
                    });
                });

                if (resultUrl) {
                    await chrome.tabs.update(targetTabId, { url: resultUrl as string });
                    await waitForTabLoad(targetTabId);
                    after_url = resultUrl as string;
                    reason = `Opened search result ${index + 1}`;
                    reply = `Opened the ${index === 0 ? 'first' : index === 1 ? 'second' : index === 2 ? 'third' : (index + 1) + 'th'} search result.`;
                } else {
                    success = false;
                    reason = "Could not find a search result on the current page.";
                    reply = reason;
                }
            } catch (e: any) {
                success = false;
                reason = "Error clicking result: " + e.message;
                reply = reason;
            }
        } else if (step.type === 'go_back') {"""

content = content.replace("        } else if (step.type === 'go_back') {", exec_block, 1)

with open("src/background/background.ts", "w") as f:
    f.write(content)
