import re

with open("src/background/background.ts", "r") as f:
    content = f.read()

# Fix executeBrowserAction to not always return success=true for click_result / click_generic
original_execute_action_inner = """                if (execRes && execRes.success) {
                    success = true;
                    after_url = execRes.after_url || currentUrl;
                    reason = execRes.verification?.reason || "Opened search result";
                    reply = `Opened the ${ordinalWord} search result.`;
                } else {
                    success = false;
                    reason = execRes?.verification?.reason || "Could not find a search result on the current page.";
                    reply = reason;
                }"""

new_execute_action_inner = """                if (execRes && execRes.success) {
                    success = true;
                    after_url = execRes.after_url || currentUrl;
                    reason = execRes.verification?.reason || "Opened search result";
                    reply = `Opened the ${ordinalWord} search result.`;
                } else {
                    success = false;
                    reason = execRes?.verification?.reason || "Failed to open search result.";
                    reply = reason;
                }"""
content = content.replace(original_execute_action_inner, new_execute_action_inner)

original_execute_action_inner2 = """                if (execRes && execRes.success) {
                    success = true;
                    after_url = execRes.after_url || currentUrl;
                    reason = execRes.verification?.reason || "Clicked element";
                    reply = `Clicked: ${step.value}`;
                } else {
                    success = false;
                    reason = execRes?.verification?.reason || `Could not find a clickable element for '${step.value}'.`;
                    reply = reason;
                }"""

new_execute_action_inner2 = """                if (execRes && execRes.success) {
                    success = true;
                    after_url = execRes.after_url || currentUrl;
                    reason = execRes.verification?.reason || "Clicked element";
                    reply = `Clicked: ${step.value}`;
                } else {
                    success = false;
                    reason = execRes?.verification?.reason || `Failed to click '${step.value}'.`;
                    reply = reason;
                }"""
content = content.replace(original_execute_action_inner2, new_execute_action_inner2)

# Fix processUserCommand logic to retry
original_process_block = """    const localIntent = classifyBrowserCommand(task);
    if (localIntent) {
        console.log(`[LocalSight Router] Local browser intent detected: ${localIntent.type.toUpperCase()}`);
        pushTrace(`⚡ Local browser command routed: ${localIntent.type}`);
        setStatus(`Executing ${localIntent.type}...`);
        
        const execRes = await executeBrowserAction(localIntent, targetTabId, initialTab.url || "");
        
        if (execRes.success) {
            console.log(`[LocalSight Browser] Verification passed`);
            console.log(`[LocalSight] Task completed`);
            const replyText = `✅ ${execRes.reply}`;
            chrome.runtime.sendMessage({ action: 'CHAT_RESPONSE', message: replyText });
            conversationHistory.push({ role: 'assistant', content: replyText });
            chrome.runtime.sendMessage({ action: 'HISTORY_UPDATED', history: conversationHistory });
            chrome.runtime.sendMessage({ action: 'AGENT_INIT', agentStatus: 'COMPLETED' });
            chrome.runtime.sendMessage({ action: 'AGENT_COMPLETE' });
        } else {
            console.log(`[LocalSight Browser] Verification failed: ${execRes.verification.reason}`);
            const replyText = `❌ ${execRes.reply}`;
            chrome.runtime.sendMessage({ action: 'CHAT_RESPONSE', message: replyText });
            conversationHistory.push({ role: 'assistant', content: replyText });
            chrome.runtime.sendMessage({ action: 'HISTORY_UPDATED', history: conversationHistory });
            chrome.runtime.sendMessage({ action: 'AGENT_INIT', agentStatus: 'FAILED' });
        }
        activeAgent = false;
        return;
    }"""

new_process_block = """    const localIntent = classifyBrowserCommand(task);
    if (localIntent) {
        console.log(`[LocalSight Router] Local browser intent detected: ${localIntent.type.toUpperCase()}`);
        
        let execRes: any = null;
        let attempt = 0;
        const maxAttempts = 2;
        
        while (attempt < maxAttempts) {
            pushTrace(`⚡ Local browser command routed: ${localIntent.type} (Attempt ${attempt + 1})`);
            setStatus(`Executing ${localIntent.type}...`);
            execRes = await executeBrowserAction(localIntent, targetTabId, initialTab.url || "");
            
            if (execRes.success) {
                break;
            } else {
                console.log(`[LocalSight Browser] Verification failed: ${execRes.verification.reason}. Retrying...`);
                pushTrace(`⚠ Verification failed: ${execRes.verification.reason}. Refreshing DOM and retrying...`);
                await new Promise(r => setTimeout(r, 1000));
            }
            attempt++;
        }
        
        if (execRes && execRes.success) {
            console.log(`[LocalSight Browser] Verification passed`);
            console.log(`[LocalSight] Task completed`);
            const replyText = `✅ ${execRes.reply}`;
            chrome.runtime.sendMessage({ action: 'CHAT_RESPONSE', message: replyText });
            conversationHistory.push({ role: 'assistant', content: replyText });
            chrome.runtime.sendMessage({ action: 'HISTORY_UPDATED', history: conversationHistory });
            chrome.runtime.sendMessage({ action: 'AGENT_INIT', agentStatus: 'COMPLETED' });
            chrome.runtime.sendMessage({ action: 'AGENT_COMPLETE' });
        } else {
            console.log(`[LocalSight Browser] Verification ultimately failed: ${execRes?.verification?.reason}`);
            const replyText = `❌ I attempted to execute the command, but the browser state did not change as expected: ${execRes?.reply || 'Verification failed.'}`;
            chrome.runtime.sendMessage({ action: 'CHAT_RESPONSE', message: replyText });
            conversationHistory.push({ role: 'assistant', content: replyText });
            chrome.runtime.sendMessage({ action: 'HISTORY_UPDATED', history: conversationHistory });
            chrome.runtime.sendMessage({ action: 'AGENT_INIT', agentStatus: 'FAILED' });
        }
        activeAgent = false;
        return;
    }"""
content = content.replace(original_process_block, new_process_block)


original_backend_block = """                const execRes = await executeBrowserAction(step, targetTabId, initialTab.url || "");
                
                if (execRes.success) {
                    const replyText = `✅ ${execRes.reply || intentRes.reply || 'Done.'}`;
                    chrome.runtime.sendMessage({ action: 'CHAT_RESPONSE', message: replyText });
                    conversationHistory.push({ role: 'assistant', content: replyText });
                    chrome.runtime.sendMessage({ action: 'HISTORY_UPDATED', history: conversationHistory });
                    chrome.runtime.sendMessage({ action: 'AGENT_INIT', agentStatus: 'COMPLETED' });
                    chrome.runtime.sendMessage({ action: 'AGENT_COMPLETE' });
                } else {
                    const replyText = `❌ ${execRes.reply || 'Failed.'}`;
                    chrome.runtime.sendMessage({ action: 'CHAT_RESPONSE', message: replyText });
                    conversationHistory.push({ role: 'assistant', content: replyText });
                    chrome.runtime.sendMessage({ action: 'HISTORY_UPDATED', history: conversationHistory });
                    chrome.runtime.sendMessage({ action: 'AGENT_INIT', agentStatus: 'FAILED' });
                }"""

new_backend_block = """                let execRes: any = null;
                let attempt = 0;
                const maxAttempts = 2;
                
                while (attempt < maxAttempts) {
                    pushTrace(`⚡ Backend browser command routed: ${step.type} (Attempt ${attempt + 1})`);
                    setStatus(`Executing ${step.type}...`);
                    execRes = await executeBrowserAction(step, targetTabId, initialTab.url || "");
                    
                    if (execRes.success) {
                        break;
                    } else {
                        console.log(`[LocalSight Browser] Verification failed: ${execRes.verification.reason}. Retrying...`);
                        pushTrace(`⚠ Verification failed: ${execRes.verification.reason}. Refreshing DOM and retrying...`);
                        await new Promise(r => setTimeout(r, 1000));
                    }
                    attempt++;
                }
                
                if (execRes && execRes.success) {
                    const replyText = `✅ ${execRes.reply || intentRes.reply || 'Done.'}`;
                    chrome.runtime.sendMessage({ action: 'CHAT_RESPONSE', message: replyText });
                    conversationHistory.push({ role: 'assistant', content: replyText });
                    chrome.runtime.sendMessage({ action: 'HISTORY_UPDATED', history: conversationHistory });
                    chrome.runtime.sendMessage({ action: 'AGENT_INIT', agentStatus: 'COMPLETED' });
                    chrome.runtime.sendMessage({ action: 'AGENT_COMPLETE' });
                } else {
                    const replyText = `❌ I attempted to execute the command, but verification failed: ${execRes?.reply || 'Failed.'}`;
                    chrome.runtime.sendMessage({ action: 'CHAT_RESPONSE', message: replyText });
                    conversationHistory.push({ role: 'assistant', content: replyText });
                    chrome.runtime.sendMessage({ action: 'HISTORY_UPDATED', history: conversationHistory });
                    chrome.runtime.sendMessage({ action: 'AGENT_INIT', agentStatus: 'FAILED' });
                }"""
content = content.replace(original_backend_block, new_backend_block)

with open("src/background/background.ts", "w") as f:
    f.write(content)
