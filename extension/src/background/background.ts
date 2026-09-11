console.log("[LocalSight] SERVICE WORKER LOADED");

chrome.runtime.onInstalled.addListener(() => {
  console.log("[LocalSight] EXTENSION INSTALLED");
  chrome.sidePanel.setPanelBehavior({
    openPanelOnActionClick: true
  }).catch((error) => console.error("[LocalSight] Failed to set panel behavior:", error));
});

chrome.action.onClicked.addListener(async (tab) => {
  console.log("[LocalSight] ACTION CLICKED");
  if (!tab.windowId) return;
  
  try {
    await chrome.sidePanel.open({ windowId: tab.windowId });
    console.log("[LocalSight] SIDE PANEL OPENED");
  } catch (error) {
    console.error("[LocalSight] SIDE PANEL ERROR", error);
  }
});

let activeAgent = false;
let currentAgentState = 'IDLE';
let conversationHistory: any[] = [];
let actionHistory: any[] = [];
let currentTask = "";
let currentTraces: string[] = [];
let currentTaskId = "";
let recentDownloads: any[] = [];

// Listen for downloads
chrome.downloads.onCreated.addListener((downloadItem) => {
    console.log(`[DOWNLOAD INITIATED] Task: ${currentTaskId}, Filename: ${downloadItem.filename}`);
    recentDownloads.push({
        taskId: currentTaskId,
        filename: downloadItem.filename,
        url: downloadItem.url,
        state: downloadItem.state
    });
});

chrome.runtime.onMessage.addListener((message: any, _sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void) => {
  if (message.action === 'PING') {
    sendResponse({ status: 'OK' });
  } else if (message.action === 'SEND_MESSAGE') {
    if (activeAgent) {
        activeAgent = false; // Stop any currently running loop
    }
    conversationHistory.push({ role: 'user', content: message.text });
    currentTask = message.text;
    currentTaskId = "TASK_" + Math.random().toString(36).substr(2, 9);
    activeAgent = true;
    currentAgentState = 'OBSERVING';
    runAgentStateMachine(currentTask, currentTaskId).catch(e => {
        console.error("[LocalSight] Agent Error:", e);
        chrome.runtime.sendMessage({ action: 'AGENT_ERROR', error: e.message });
        chrome.runtime.sendMessage({ action: 'AGENT_INIT', agentStatus: 'FAILED' });
        activeAgent = false;
        currentAgentState = 'FAILED';
    });
    sendResponse({ status: 'STARTED' });
  } else if (message.action === 'CONFIRM_ACTION') {
      if (currentAgentState === 'WAITING_FOR_USER') {
          conversationHistory.push({ role: 'user', content: message.confirmed ? 'Confirmed. Proceed.' : 'Cancelled.' });
          if (message.confirmed) {
              currentAgentState = 'OBSERVING';
              runAgentStateMachine(currentTask, currentTaskId).catch(e => {
                  console.error("[LocalSight] Agent Error:", e);
                  chrome.runtime.sendMessage({ action: 'AGENT_ERROR', error: e.message });
                  chrome.runtime.sendMessage({ action: 'AGENT_INIT', agentStatus: 'FAILED' });
                  activeAgent = false;
                  currentAgentState = 'FAILED';
              });
          } else {
              activeAgent = false;
              currentAgentState = 'STOPPED';
              chrome.runtime.sendMessage({ action: 'AGENT_COMPLETE' });
          }
      }
      sendResponse({ status: 'OK' });
  } else if (message.action === 'STOP_AGENT') {
    activeAgent = false;
    currentAgentState = 'STOPPED';
    sendResponse({ status: 'STOPPED' });
  } else if (message.action === 'GET_HISTORY') {
      sendResponse({ history: conversationHistory });
  }
});

async function ensureContentScript(tabId: number) {
    try {
        await chrome.tabs.sendMessage(tabId, { action: 'PING' });
        return;
    } catch (e) {
        const manifest = chrome.runtime.getManifest();
        const contentScriptPath = manifest.content_scripts?.[0]?.js?.[0];
        if (contentScriptPath) {
            await chrome.scripting.executeScript({ target: { tabId }, files: [contentScriptPath] });
            await new Promise(r => setTimeout(r, 200));
        }
    }
}

function setStatus(status: string) {
    chrome.runtime.sendMessage({ action: 'AGENT_STATUS', status });
    console.log(`[LocalSight State Machine] ${status}`);
}

function pushTrace(traceLine: string) {
    currentTraces.push(traceLine);
    chrome.runtime.sendMessage({ action: 'AGENT_TRACE', trace: traceLine });
}

function finalizeTurn() {
    if (currentTraces.length > 0) {
        conversationHistory.push({ role: 'trace', traces: [...currentTraces] });
        chrome.runtime.sendMessage({ action: 'HISTORY_UPDATED', history: conversationHistory });
        currentTraces = [];
    }
}

async function runAgentStateMachine(task: string, taskId: string) {
    if (!activeAgent) return;
    
    console.log(`\n==================================================`);
    console.log(`TASK ${taskId}`);
    console.log(`[USER]\n${task}`);
    console.log(`==================================================`);

    currentTraces = [];
    actionHistory = [];
    recentDownloads = []; // Reset downloads for the new task
    
    const [initialTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!initialTab || !initialTab.id) throw new Error("No active tab to start");
    let targetTabId = initialTab.id;
    
    chrome.runtime.sendMessage({ 
        action: 'AGENT_INIT', 
        visionStatus: 'CHECKING',
        vlmStatus: 'CHECKING',
        agentStatus: 'RUNNING'
    });
    
    const MAX_RETRIES = 3;
    const MAX_STEPS = 8;
    let stepCount = 0;
    let retries = 0;

    while (activeAgent && currentTaskId === taskId && stepCount < MAX_STEPS && retries < MAX_RETRIES) {
        
        currentAgentState = 'OBSERVING';
        setStatus(`Observing page...`);
        pushTrace(`👁 Observing page (Step ${stepCount + 1})...`);
        
        const [currentActiveTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (currentActiveTab && currentActiveTab.id && currentActiveTab.id !== targetTabId) {
            console.log(`[NAV] Tab changed. Updating targetTabId from ${targetTabId} to ${currentActiveTab.id}`);
            targetTabId = currentActiveTab.id;
        }

        let tab;
        try { tab = await chrome.tabs.get(targetTabId); } catch (e) { 
            setStatus('Target tab closed.');
            break; 
        }
        const rawDataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'jpeg' });
        
        let analyzeRes;
        try {
            await ensureContentScript(targetTabId);
            analyzeRes = await chrome.tabs.sendMessage(targetTabId, { action: 'ANALYZE_PAGE' });
        } catch (e: any) {
            console.log(`[MSG] reacquiring content context due to error:`, e.message);
            await new Promise(r => setTimeout(r, 1000));
            try {
                await ensureContentScript(targetTabId);
                analyzeRes = await chrome.tabs.sendMessage(targetTabId, { action: 'ANALYZE_PAGE' });
            } catch (retryErr: any) {
                setStatus(`Tab communication failed`);
                pushTrace(`❌ Failed to communicate with tab: ${retryErr.message}`);
                retries++;
                continue;
            }
        }
        const { safe_dom, regex_detections, url, title } = analyzeRes;
        
        console.log(`\n[OBSERVE]`);
        console.log(`URL=${url}`);
        console.log(`elements=${safe_dom.length}`);
        console.log(`activeTab=${targetTabId}`);

        const response = await fetch(rawDataUrl);
        const blob = await response.blob();
        const imageBitmap = await createImageBitmap(blob);
        const MAX_IMAGE_SIZE = 1024;
        let targetWidth = imageBitmap.width;
        let targetHeight = imageBitmap.height;
        let scale = 1.0;
        
        if (targetWidth > MAX_IMAGE_SIZE || targetHeight > MAX_IMAGE_SIZE) {
            scale = targetWidth > targetHeight ? MAX_IMAGE_SIZE / targetWidth : MAX_IMAGE_SIZE / targetHeight;
            targetWidth = Math.round(targetWidth * scale);
            targetHeight = Math.round(targetHeight * scale);
        }

        const canvas = new OffscreenCanvas(targetWidth, targetHeight);
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error("Canvas failed");
        ctx.drawImage(imageBitmap, 0, 0, targetWidth, targetHeight);
        ctx.fillStyle = 'black';
        for (const det of regex_detections) {
            ctx.fillRect(det.bbox[0] * scale, det.bbox[1] * scale, det.bbox[2] * scale, det.bbox[3] * scale);
        }
        
        const redactedBlob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.8 });
        const reader = new FileReader();
        const redactedBase64 = await new Promise<string>((resolve) => {
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(redactedBlob);
        });

        const recentConversation = conversationHistory.slice(-10);

        const reqBody = {
            task_id: taskId,
            step_id: stepCount + 1,
            task,
            original_task: currentTask,
            url,
            title,
            sanitized_image: redactedBase64,
            viewport: { width: imageBitmap.width, height: imageBitmap.height },
            safe_dom,
            detections: [],
            history: actionHistory,
            conversation_history: recentConversation,
            recent_downloads: recentDownloads
        };

        currentAgentState = 'PLANNING';
        setStatus('Reasoning...');
        
        let vlmRes: any = null;
        try {
            const apiRes = await fetch('http://localhost:8000/api/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(reqBody)
            });
            
            if (!activeAgent || currentTaskId !== taskId) break;
            
            if (!apiRes.ok) throw new Error(`VLM server error: ${apiRes.status}`);
            vlmRes = await apiRes.json();
            chrome.runtime.sendMessage({ action: 'AGENT_INIT', visionStatus: 'ACTIVE', vlmStatus: 'ACTIVE' });
        } catch (e: any) {
            setStatus(`VLM Error: ${e.message}`);
            pushTrace(`❌ Server Error: ${e.message}`);
            break;
        }

        console.log(`\n[PLAN]`);
        if (vlmRes.reasoning) {
            console.log(vlmRes.reasoning);
            pushTrace(`🎯 Reasoning: ${vlmRes.reasoning}`);
        }

        if (vlmRes.status === 'CHAT') {
            currentAgentState = 'COMPLETED';
            setStatus(`Chat responded`);
            pushTrace(`✓ Chat mode: Sent response`);
            finalizeTurn();
            
            console.log(`\n[ASSISTANT]`);
            console.log(vlmRes.reply);
            
            if (vlmRes.reply) {
                chrome.runtime.sendMessage({ action: 'CHAT_RESPONSE', message: vlmRes.reply });
                conversationHistory.push({ role: 'assistant', content: vlmRes.reply });
                chrome.runtime.sendMessage({ action: 'HISTORY_UPDATED', history: conversationHistory });
            }
            
            chrome.runtime.sendMessage({ action: 'AGENT_INIT', agentStatus: 'COMPLETED' });
            chrome.runtime.sendMessage({ action: 'AGENT_COMPLETE' });
            activeAgent = false;
            return;
        }

        if (vlmRes.status === 'SUCCESS' || vlmRes.success === true && !vlmRes.action && vlmRes.status !== 'NEEDS_USER' && vlmRes.status !== 'ACTION') {
            currentAgentState = 'COMPLETED';
            setStatus(`Task Complete`);
            pushTrace(`✓ Task Completed`);
            finalizeTurn();
            
            console.log(`\n[GOAL]`);
            console.log(`fulfilled=true`);
            console.log(`\n[ASSISTANT]`);
            console.log(vlmRes.reply);

            if (vlmRes.reply) {
                const replyText = vlmRes.reply.startsWith('✅') ? vlmRes.reply : `✅ Done — ${vlmRes.reply}`;
                chrome.runtime.sendMessage({ action: 'CHAT_RESPONSE', message: replyText });
                conversationHistory.push({ role: 'assistant', content: replyText });
                chrome.runtime.sendMessage({ action: 'HISTORY_UPDATED', history: conversationHistory });
            }
            
            chrome.runtime.sendMessage({ action: 'AGENT_INIT', agentStatus: 'COMPLETED' });
            chrome.runtime.sendMessage({ action: 'AGENT_COMPLETE' });
            activeAgent = false;
            return;
        } else if (vlmRes.status === 'FAIL' || vlmRes.success === false) {
            currentAgentState = 'FAILED';
            setStatus(`Task Failed`);
            pushTrace(`❌ Task Failed: ${vlmRes.reasoning || vlmRes.error}`);
            finalizeTurn();
            
            console.log(`\n[GOAL]`);
            console.log(`fulfilled=false (Failed: ${vlmRes.reasoning || vlmRes.error})`);

            if (vlmRes.reply || vlmRes.error || vlmRes.reasoning) {
                const text = vlmRes.reply || vlmRes.error || vlmRes.reasoning;
                const replyText = text.startsWith('❌') ? text : `❌ ${text}`;
                chrome.runtime.sendMessage({ action: 'CHAT_RESPONSE', message: replyText });
                conversationHistory.push({ role: 'assistant', content: replyText });
                chrome.runtime.sendMessage({ action: 'HISTORY_UPDATED', history: conversationHistory });
            }
            
            chrome.runtime.sendMessage({ action: 'AGENT_INIT', agentStatus: 'FAILED' });
            activeAgent = false;
            return;
        } else if (vlmRes.status === 'NEEDS_USER') {
            currentAgentState = 'WAITING_FOR_USER';
            setStatus(`Waiting for user confirmation...`);
            finalizeTurn();
            if (vlmRes.reply) {
                chrome.runtime.sendMessage({ action: 'CHAT_RESPONSE', message: vlmRes.reply });
                conversationHistory.push({ role: 'assistant', content: vlmRes.reply });
                chrome.runtime.sendMessage({ action: 'HISTORY_UPDATED', history: conversationHistory });
            }
            chrome.runtime.sendMessage({ action: 'NEEDS_USER' });
            activeAgent = false;
            return; 
        }

        const step = vlmRes.action;
        if (!step) {
            setStatus(`VLM returned ACTION without an action object`);
            break;
        }

        // --- PREVENT DUPLICATE ACTIONS & FORCE TERMINATION ---
        let duplicateCount = 0;
        const targetInfoStr = JSON.stringify(step.target || 'page');
        const valueStr = JSON.stringify(step.value || '');
        
        for (let i = actionHistory.length - 1; i >= 0; i--) {
            const log = actionHistory[i];
            const logValueStr = JSON.stringify(log.value || '');
            if (log.action_taken === step.type && log.target_info === targetInfoStr && logValueStr === valueStr && log.state_changed === false) {
                duplicateCount++;
            }
        }

        if (duplicateCount >= 2) {
            currentAgentState = 'FAILED';
            setStatus(`Agent stuck in loop. Terminating.`);
            pushTrace(`❌ Stopped: repeated action produced no state change.`);
            finalizeTurn();
            
            const failMsg = "❌ I couldn't complete the task because I got stuck repeating the same action.";
            chrome.runtime.sendMessage({ action: 'CHAT_RESPONSE', message: failMsg });
            conversationHistory.push({ role: 'assistant', content: failMsg });
            chrome.runtime.sendMessage({ action: 'HISTORY_UPDATED', history: conversationHistory });
            
            chrome.runtime.sendMessage({ action: 'AGENT_INIT', agentStatus: 'FAILED' });
            activeAgent = false;
            return;
        }

        console.log(`\n[RESOLVE]`);
        let target_id = null;
        let resolveRes = null;
        if (['click', 'type', 'select', 'check', 'uncheck'].includes(step.type) && step.target) {
            currentAgentState = 'RESOLVING_TARGET';
            setStatus(`Locating target...`);
            try {
                resolveRes = await chrome.tabs.sendMessage(targetTabId, { action: 'RESOLVE_TARGET', step });
            } catch (e: any) {
                console.log(`[MSG] stale channel detected during resolve:`, e.message);
                resolveRes = { error: `Channel error: ${e.message}`, target_id: null };
            }
            
            if (!activeAgent || currentTaskId !== taskId) break;

            console.log(`target_found=${!!resolveRes?.target_id}`);
            console.log(`confidence=${resolveRes?.confidence || 0}`);
            console.log(`ambiguity=${resolveRes?.ambiguity || 0}`);

            if (resolveRes.error || !resolveRes.target_id) {
                setStatus(`Attempt ${retries + 1} failed: Target not found`);
                pushTrace(`❌ Target resolution failed: ${JSON.stringify(step.target)}`);
                actionHistory.push({
                    step: stepCount + 1,
                    action_taken: step.type,
                    target_info: JSON.stringify(step.target),
                    value: step.value,
                    verification_result: "Failed: Target not found.",
                    state_changed: false
                });
                retries++;
                await new Promise(r => setTimeout(r, 1000));
                if (!activeAgent || currentTaskId !== taskId) break;
                continue;
            }
            target_id = resolveRes.target_id;
        }
        
        currentAgentState = 'EXECUTING';
        setStatus(`Executing ${step.type}...`);
        pushTrace(`🖱 Action: ${step.type} on target: ${JSON.stringify(step.target || 'page')}`);
        
        console.log(`\n[EXECUTE]`);
        if (resolveRes) {
            console.log(`target resolved`);
            console.log(`element found`);
        }
        console.log(`calling actual ${step.type}`);

        currentAgentState = 'VERIFYING';
        let execRes: any = null;
        try {
            console.log(`[MSG] sending action`);
            execRes = await chrome.tabs.sendMessage(targetTabId, { action: 'EXECUTE_ACTION', step, target_id });
        } catch (e: any) {
            console.log(`[MSG] port disconnected or error:`, e.message);
            const navSensitive = ['click', 'press_key', 'submit', 'navigate', 'go_back', 'go_forward'];
            if (navSensitive.includes(step.type)) {
                console.log(`[NAV] navigation-sensitive action dispatched, context invalidated`);
                console.log(`[VERIFY] waiting for new page state`);
                
                // Wait for navigation and new page load
                await new Promise(r => setTimeout(r, 2000));
                
                let newUrl = "unknown";
                try {
                    const [currentActive] = await chrome.tabs.query({ active: true, currentWindow: true });
                    if (currentActive && currentActive.url) newUrl = currentActive.url;
                } catch(e) {}
                
                execRes = {
                    executed: true,
                    success: true,
                    state_changed: true,
                    before_url: url,
                    after_url: newUrl,
                    verification: { passed: true, reason: `Action dispatched, navigation confirmed to ${newUrl}` }
                };
            } else {
                console.log(`[MSG] stale channel detected for non-nav action`);
                execRes = {
                    executed: false,
                    success: false,
                    verification: { passed: false, reason: `Message channel error: ${e.message}` }
                };
            }
        }
        
        if (!activeAgent || currentTaskId !== taskId) break;
        
        console.log(`\n[RESULT]`);
        console.log(`executed=${execRes?.executed}`);
        if (execRes?.actual_value !== undefined) {
             console.log(`actual_value=${execRes.actual_value}`);
        }
        
        console.log(`\n[POST_STATE]`);
        console.log(`url_before=${execRes?.before_url}`);
        console.log(`url_after=${execRes?.after_url}`);
        console.log(`dom_fingerprint_before=${execRes?.state_fingerprint_before}`);
        console.log(`dom_fingerprint_after=${execRes?.state_fingerprint_after}`);

        if (!execRes || execRes.status === 'error' || !execRes.success) {
            const reason = execRes?.verification?.reason || execRes?.reason || 'Unknown execution error';
            setStatus(`Verification failed`);
            pushTrace(`❌ Verification Failed: ${reason}`);
            actionHistory.push({
                step: stepCount + 1,
                action_taken: step.type,
                target_info: JSON.stringify(step.target),
                value: step.value,
                verification_result: `Failed: ${reason}`,
                state_changed: execRes?.state_changed || false,
                state_fingerprint_before: execRes?.state_fingerprint_before,
                state_fingerprint_after: execRes?.state_fingerprint_after
            });
            retries++;
            await new Promise(r => setTimeout(r, 1000));
            if (!activeAgent || currentTaskId !== taskId) break;
            continue;
        }
        
        console.log(`\n[VERIFY]`);
        if (recentDownloads.length > 0) {
            const latest = recentDownloads[recentDownloads.length - 1];
            console.log(`download detected`);
            console.log(`filename=${latest.filename}`);
        } else {
            console.log(`action triggered: ${step.type}`);
        }

        setStatus(`Verified`);
        pushTrace(`✓ Verification: ${execRes.verification?.reason || 'Action triggered'}`);
        actionHistory.push({
            step: stepCount + 1,
            action_taken: step.type,
            target_info: JSON.stringify(step.target),
            value: step.value,
            verification_result: `Success: ${execRes.verification?.reason || 'Action triggered'}`,
            state_changed: execRes?.state_changed || false,
            state_fingerprint_before: execRes?.state_fingerprint_before,
            state_fingerprint_after: execRes?.state_fingerprint_after
        });
        
        stepCount++;
        retries = 0; 
        
        await new Promise(r => setTimeout(r, 800));
        if (!activeAgent || currentTaskId !== taskId) break;
    }
    
    if (activeAgent && currentTaskId === taskId) {
        currentAgentState = 'FAILED';
        setStatus(`✕ Task failed.`);
        finalizeTurn();
        chrome.runtime.sendMessage({ action: 'AGENT_INIT', agentStatus: 'FAILED' });
    }
}
