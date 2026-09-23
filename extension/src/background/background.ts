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
let lastOpenedTabId: number | null = null;      // Last tab opened by any navigation
let currentTaskTabId: number | null = null;     // Authoritative task-context tab (survives user tab switches)
let currentTaskUrl: string = '';               // URL of the task-context tab
let lastActionType: string = '';               // Last action type for multi-step context

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
    console.log("[LocalSight] BACKGROUND BUILD: BROWSER_ROUTER_V2");
    console.log("[LocalSight] Browser router initialized");
    if (activeAgent) {
        activeAgent = false; // Stop any currently running loop
    }
    conversationHistory.push({ role: 'user', content: message.text });
    currentTask = message.text;
    currentTaskId = "TASK_" + Math.random().toString(36).substr(2, 9);
    activeAgent = true;
    currentAgentState = 'OBSERVING';
    processUserCommand(currentTask, currentTaskId).catch(e => {
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
              processUserCommand(currentTask, currentTaskId).catch(e => {
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

// URLs where content scripts cannot be injected (browser internals)
const UNINJECTABLE_URL_PATTERNS = [
    /^chrome:\/\//,
    /^chrome-extension:\/\//,
    /^about:/,
    /^edge:\/\//,
    /^devtools:\/\//,
];

function isInjectableUrl(url: string | undefined): boolean {
    if (!url) return false;
    return !UNINJECTABLE_URL_PATTERNS.some(p => p.test(url));
}

/**
 * Robust content-script connection helper.
 * 1. Validates the tab exists.
 * 2. Checks the URL is injectable.
 * 3. PINGs the content script.
 * 4. On failure: injects the script via chrome.scripting.executeScript, waits, re-PINGs.
 * 5. Returns true if connected, false otherwise.
 */
async function ensureContentScript(tabId: number): Promise<boolean> {
    // Step 1: Verify tab exists
    let tab: chrome.tabs.Tab;
    try {
        tab = await chrome.tabs.get(tabId);
    } catch {
        console.log(`[LocalSight CS] Tab ${tabId} does not exist.`);
        return false;
    }

    // Step 2: Check URL is injectable
    if (!isInjectableUrl(tab.url)) {
        console.log(`[LocalSight CS] Tab ${tabId} URL is not injectable: ${tab.url}`);
        return false;
    }

    // Step 3: Wait for tab to finish loading
    if (tab.status === 'loading') {
        await waitForTabLoad(tabId);
        await new Promise(r => setTimeout(r, 300));
    }

    // Step 4: Try PING
    try {
        const pong = await chrome.tabs.sendMessage(tabId, { action: 'PING' });
        if (pong && pong.status === 'OK') {
            console.log(`[LocalSight CS] Tab ${tabId} content script connected (PING OK).`);
            return true;
        }
    } catch { /* fall through to injection */ }

    // Step 5: Inject content script
    console.log(`[LocalSight CS] Tab ${tabId} no response — injecting content script...`);
    try {
        // Get the actual hashed filename from the live manifest
        const manifest = chrome.runtime.getManifest();
        const contentScriptPath = manifest.content_scripts?.[0]?.js?.[0];
        if (!contentScriptPath) {
            console.log(`[LocalSight CS] No content script path found in manifest.`);
            return false;
        }
        await chrome.scripting.executeScript({
            target: { tabId, allFrames: false },
            files: [contentScriptPath]
        });
        console.log(`[LocalSight CS] Injected: ${contentScriptPath}`);
        await new Promise(r => setTimeout(r, 400));
    } catch (injectErr: any) {
        console.log(`[LocalSight CS] Injection failed: ${injectErr.message}`);
        return false;
    }

    // Step 6: Re-PING after injection
    try {
        const pong2 = await chrome.tabs.sendMessage(tabId, { action: 'PING' });
        if (pong2 && pong2.status === 'OK') {
            console.log(`[LocalSight CS] Tab ${tabId} content script connected after injection.`);
            return true;
        }
    } catch (e: any) {
        console.log(`[LocalSight CS] Re-PING failed after injection: ${e.message}`);
    }

    return false;
}

/**
 * Centralized gateway for all tab-to-content-script messaging.
 * Ensures content script is connected before sending.
 * Retries once after re-injection on failure.
 */
async function sendToContentScript(tabId: number, message: any): Promise<any> {
    const connected = await ensureContentScript(tabId);
    if (!connected) {
        console.log(`[LocalSight CS] Cannot connect to content script on tab ${tabId}.`);
        return { success: false, stage: 'CONTENT_SCRIPT_CONNECTION', error: 'CONTENT_SCRIPT_UNAVAILABLE', tabId };
    }
    try {
        const result = await chrome.tabs.sendMessage(tabId, message);
        return result;
    } catch (e: any) {
        // Message channel died mid-flight — likely caused by a navigation (which means the click worked)
        if (e.message && e.message.includes('Receiving end does not exist')) {
            console.log(`[LocalSight CS] Channel closed mid-message (likely navigation triggered). Treating as navigated.`);
            return { success: true, navigated: true, verification: { passed: true, reason: 'Navigation triggered (channel closed during action).' } };
        }
        console.log(`[LocalSight CS] sendMessage error: ${e.message}`);
        return { success: false, stage: 'MESSAGING', error: e.message };
    }
}

function setStatus(status: string) {
    chrome.runtime.sendMessage({ action: 'AGENT_STATUS', status });
    console.log(`[LocalSight State Machine] ${status}`);
}

/**
 * Update the task-context tab (authoritative tab for the current workflow).
 * Called after every navigation/search/open action.
 */
function setTaskTab(tabId: number, url: string, actionType: string) {
    currentTaskTabId = tabId;
    currentTaskUrl = url;
    lastActionType = actionType;
    lastOpenedTabId = tabId;
    console.log(`[LocalSight TaskTab] Set: tabId=${tabId}, url=${url}, action=${actionType}`);
}

/**
 * Find the Google search-results tab.
 * Priority: 1) currentTaskTabId if it's a Google search, 2) find any Google search tab.
 */
async function resolveSearchTab(): Promise<chrome.tabs.Tab | null> {
    const isGoogleSearchUrl = (url: string | undefined) =>
        !!url && (url.includes('google.com/search') || url.includes('www.google.com/search'));

    // Priority 1: task tab is already a Google search page
    if (currentTaskTabId !== null) {
        try {
            const taskTab = await chrome.tabs.get(currentTaskTabId);
            if (taskTab && isGoogleSearchUrl(taskTab.url)) {
                console.log(`[LocalSight SearchTab] Using currentTaskTabId=${currentTaskTabId}: ${taskTab.url}`);
                return taskTab;
            }
        } catch { /* tab closed */ }
    }

    // Priority 2: scan all tabs for a Google search tab
    const allTabs = await chrome.tabs.query({ currentWindow: true });
    const googleSearchTabs = allTabs.filter(t => isGoogleSearchUrl(t.url));
    if (googleSearchTabs.length === 1) {
        console.log(`[LocalSight SearchTab] Found single Google search tab: ${googleSearchTabs[0].url}`);
        return googleSearchTabs[0];
    }
    if (googleSearchTabs.length > 1) {
        // Prefer the most recently updated / focused one
        const active = googleSearchTabs.find(t => t.active) || googleSearchTabs[googleSearchTabs.length - 1];
        console.log(`[LocalSight SearchTab] Multiple Google tabs, using: ${active.url}`);
        return active;
    }

    return null;
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


// -----------------------------------------------------------------------------
// DETERMINISTIC ROUTING & BROWSER COMMANDS
// -----------------------------------------------------------------------------

function resolveDestination(input: string): { type: "url" | "search"; value: string } {
    let lower = input.toLowerCase().trim();
    if (lower.startsWith('http://') || lower.startsWith('https://')) {
        return { type: "url", value: input };
    }
    if (lower.match(/^([a-z0-9-]+\.)+[a-z]{2,}(?:\/[^ ]*)?$/)) {
        return { type: "url", value: "https://" + input };
    }
    if (lower === 'google') return { type: "url", value: "https://www.google.com" };
    if (lower === 'youtube') return { type: "url", value: "https://www.youtube.com" };
    if (lower === 'github') return { type: "url", value: "https://github.com" };
    if (lower === 'wikipedia') return { type: "url", value: "https://www.wikipedia.org" };
    
    return { type: "search", value: input };
}

function classifyBrowserCommand(task: string): any {
    // Normalize: lowercase, trim, collapse whitespace, strip trailing punctuation
    const lower = task.toLowerCase().trim().replace(/\s+/g, ' ').replace(/[.!?]+$/, '');

    console.log(`[LocalSight Router] Input: "${lower}"`);

    // --- EMAIL / INBOX INTERACTION INTENTS (must be checked BEFORE the greedy 'open (.+)' catch-all) ---
    // Patterns: "open the first email", "open the first mail in gmail",
    //           "click the first email", "open first mail", "read first email", etc.
    const emailInteractionPattern = /(?:open|click|read|view|show)\s+(?:the\s+)?(?:first|1st)\s+(?:email|mail|message|thread)(?:\s+(?:in|on|from|inside)?\s+(?:gmail|inbox|my\s+inbox|my\s+email))?$/;
    const emailInteractionGeneral = /(?:open|click|read|view)\s+(?:the\s+)?(?:first|1st)\s+(?:email|mail|message|thread)/;

    if (emailInteractionPattern.test(lower) || emailInteractionGeneral.test(lower)) {
        console.log(`[LocalSight Router] Intent: CLICK_FIRST_EMAIL`);
        return { type: 'click_first_email', ordinal: 0 };
    }

    // Second/third email
    const emailNthPattern = /(?:open|click|read)\s+(?:the\s+)?(?:second|2nd)\s+(?:email|mail|message|thread)/;
    if (emailNthPattern.test(lower)) {
        console.log(`[LocalSight Router] Intent: CLICK_EMAIL (index=1)`);
        return { type: 'click_first_email', ordinal: 1 };
    }
    const emailThirdPattern = /(?:open|click|read)\s+(?:the\s+)?(?:third|3rd)\s+(?:email|mail|message|thread)/;
    if (emailThirdPattern.test(lower)) {
        console.log(`[LocalSight Router] Intent: CLICK_EMAIL (index=2)`);
        return { type: 'click_first_email', ordinal: 2 };
    }

    // --- SEARCH RESULT CLICK ---
    let match = lower.match(/(?:open|click)(?:\s+the)?\s+(first|second|third|1st|2nd|3rd)(?:\s+search)?\s+result/);
    if (match) {
        let ordinal = match[1];
        let index = 0;
        if (ordinal === 'second' || ordinal === '2nd') index = 1;
        if (ordinal === 'third' || ordinal === '3rd') index = 2;
        console.log(`[LocalSight Router] Intent: CLICK_RESULT (index=${index})`);
        return { type: 'click_result', index: index };
    }

    // --- GENERIC CLICK (button/link by name) ---
    let clickMatch = lower.match(/^click\s+(?:the\s+)?(.+)$/);
    if (clickMatch && !lower.match(/result$/) && !lower.match(/email|mail|message/)) {
        console.log(`[LocalSight Router] Intent: CLICK_GENERIC`);
        return { type: 'click_generic', value: clickMatch[1] };
    }

    // --- TAB COMMANDS ---
    if (/^open\s+.+\s+in\s+a\s+new\s+tab$/.test(lower) || /^open\s+a\s+new\s+tab\s+for\s+.+$/.test(lower) || /^go\s+to\s+.+\s+in\s+a\s+new\s+tab$/.test(lower)) {
        const m = lower.match(/^open\s+(.+)\s+in\s+a\s+new\s+tab$/) || lower.match(/^open\s+a\s+new\s+tab\s+for\s+(.+)$/) || lower.match(/^go\s+to\s+(.+)\s+in\s+a\s+new\s+tab$/);
        console.log(`[LocalSight Router] Intent: OPEN_TAB (new tab)`);
        return { type: 'open_tab', value: m![1] };
    }

    // Pure open/navigate (only a site name, no complex modifier like "first" / "email" etc.)
    // We use a safeguard: value must look like a site/URL, not a complex phrase
    const openMatch = lower.match(/^(?:open|launch|go\s+to|navigate\s+to)\s+(.+)$/);
    if (openMatch) {
        const val = openMatch[1].trim();
        // Reject if value is a complex phrase that looks like a browser action (contains ordinal + noun)
        const complexPhrasePattern = /(first|second|third|1st|2nd|3rd)\s+(email|mail|message|thread|result|link|tab)/;
        // Reject if val contains typical interaction verbs or multi-word browser phrases
        const interactionPhrasePattern = /\b(email|mail|inbox|message|thread)\b/;
        if (complexPhrasePattern.test(val) || interactionPhrasePattern.test(val)) {
            // This is a browser action, not a navigation — fall through to VLM
            console.log(`[LocalSight Router] 'open' command detected as browser interaction, not navigation: "${val}"`);
            return null;
        }
        console.log(`[LocalSight Router] Intent: OPEN_TAB value="${val}"`);
        return { type: 'open_tab', value: val };
    }

    // --- CLOSE / SWITCH / LIST ---
    if (/^close\s+(?:this\s+tab|the\s+current\s+tab|this|the\s+tab)$/.test(lower)) {
        return { type: 'close_tab' };
    }
    if (/^switch\s+to\s+(.+)$/.test(lower) || /^go\s+to\s+my\s+(.+)\s+tab$/.test(lower) || /^switch\s+to\s+the\s+(.+)\s+tab$/.test(lower)) {
        const m = lower.match(/^switch\s+to\s+(.+)$/) || lower.match(/^go\s+to\s+my\s+(.+)\s+tab$/) || lower.match(/^switch\s+to\s+the\s+(.+)\s+tab$/);
        return { type: 'switch_tab', value: m![1].replace(/^the\s+/, '').replace(/\s+tab$/, '') };
    }
    if (/^(?:show\s+my\s+(?:open\s+)?tabs|what\s+tabs\s+are\s+open|list\s+(?:open\s+)?tabs|what\s+do\s+i\s+have\s+open|show\s+open\s+tabs)/.test(lower)) {
        return { type: 'list_tabs' };
    }
    if (/^what\s+tab\s+am\s+i\s+on|what\s+is\s+the\s+current\s+tab|which\s+tab\s+is\s+active|tell\s+me\s+the\s+current\s+page/.test(lower)) {
        return { type: 'get_active_tab' };
    }

    // --- SEARCH ---
    if (/^(?:search\s+for|google|search\s+google\s+for|look\s+up)\s+(.+)$/.test(lower)) {
        const m = lower.match(/^(?:search\s+for|google|search\s+google\s+for|look\s+up)\s+(.+)$/);
        return { type: 'search', value: m![1] };
    }

    // --- NAVIGATION ---
    if (lower === 'go back' || lower === 'back') return { type: 'go_back' };
    if (lower === 'go forward' || lower === 'forward') return { type: 'go_forward' };
    if (/^(?:reload|refresh(?:\s+this\s+page)?|reload\s+this\s+page)$/.test(lower)) return { type: 'reload' };

    return null;
}

function waitForTabLoad(tabId: number): Promise<void> {
    return new Promise((resolve) => {
        const listener = (tid: number, info: any, _tab: any) => {
            if (tid === tabId && info.status === 'complete') {
                chrome.tabs.onUpdated.removeListener(listener);
                resolve();
            }
        };
        chrome.tabs.onUpdated.addListener(listener);
        setTimeout(() => {
            chrome.tabs.onUpdated.removeListener(listener);
            resolve();
        }, 5000);
    });
}

async function executeBrowserAction(step: any, targetTabId: number, currentUrl: string): Promise<any> {
    let before_url = currentUrl;
    let after_url = currentUrl;
    let state_changed = true;
    let reason = "";
    let success = true;
    let newTargetTabId = targetTabId;
    let reply = "";

    try {
        if (step.type === 'open_tab') {
            const dest = resolveDestination(step.value || '');
            let url = dest.type === 'url' ? dest.value : `https://www.google.com/search?q=${encodeURIComponent(dest.value)}`;
            const newTab = await chrome.tabs.create({ url, active: true });
            newTargetTabId = newTab.id!;
            if (url !== 'chrome://newtab/') await waitForTabLoad(newTargetTabId);
            setTaskTab(newTargetTabId, url, 'open_tab');
            after_url = url;
            reason = `Opened new tab: ${url}`;
            reply = `Opened ${step.value} in a new tab.`;
        } else if (step.type === 'search') {
            const query = encodeURIComponent(step.value || '');
            const url = `https://www.google.com/search?q=${query}`;
            await chrome.tabs.update(targetTabId, { url });
            await waitForTabLoad(targetTabId);
            // Store this as the authoritative task tab (critical for subsequent "open first result" commands)
            setTaskTab(targetTabId, url, 'search');
            after_url = url;
            reason = `Searched for: ${step.value}`;
            reply = `Searched Google for ${step.value}.`;
            success = true;
            console.log(`[LocalSight Search] Tab ${targetTabId} is now the search-results tab for: ${step.value}`);
        } else if (step.type === 'close_tab') {
            await chrome.tabs.remove(targetTabId);
            const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (active && active.id) newTargetTabId = active.id;
            reason = `Closed tab.`;
            reply = `Closed the tab.`;
        } else if (step.type === 'switch_tab') {
            const allTabs = await chrome.tabs.query({ currentWindow: true });
            const target = step.value?.toLowerCase() || '';
            const match = allTabs.find(t => (t.title && t.title.toLowerCase().includes(target)) || (t.url && t.url.toLowerCase().includes(target)));
            if (match && match.id) {
                await chrome.tabs.update(match.id, { active: true });
                newTargetTabId = match.id;
                reason = `Switched to tab: ${match.title}`;
                reply = `Switched to ${match.title}.`;
                after_url = match.url || currentUrl;
            } else {
                success = false;
                reason = `Tab not found matching: ${step.value}`;
                reply = reason;
            }
        } else if (step.type === 'list_tabs') {
            const allTabs = await chrome.tabs.query({ currentWindow: true });
            const list = allTabs.map(t => ({ id: t.id, title: t.title, url: t.url, active: t.active }));
            reason = `Open tabs: ${JSON.stringify(list)}`;
            reply = `You have ${list.length} tabs open: ` + list.map(t => t.title).join(", ");
            state_changed = false;
        } else if (step.type === 'get_active_tab') {
            const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
            reason = `Active tab: ${active?.title} (${active?.url})`;
            reply = `Active tab is ${active?.title}.`;
            state_changed = false;
        } else if (step.type === 'reload') {
            await chrome.tabs.reload(targetTabId);
            reason = "Page reloaded";
            reply = "Reloaded the page.";
            await waitForTabLoad(targetTabId);
        } else if (step.type === 'click_first_email') {
            // ---------------------------------------------------------------
            // CLICK_FIRST_EMAIL: Find Gmail tab, click first email row, verify
            // ---------------------------------------------------------------
            const ordinal = step.ordinal || 0;
            const ordinalWords = ['first', 'second', 'third', 'fourth', 'fifth'];
            const ordinalWord = ordinal < ordinalWords.length ? ordinalWords[ordinal] : 'first';

            // Step A: Find the Gmail tab (prefer lastOpenedTabId if it's Gmail, else search all tabs)
            const allTabs = await chrome.tabs.query({ currentWindow: true });
            let gmailTab = allTabs.find(t => t.id === lastOpenedTabId && t.url && t.url.includes('mail.google.com'));
            if (!gmailTab) {
                gmailTab = allTabs.find(t => t.url && t.url.includes('mail.google.com'));
            }
            if (!gmailTab) {
                // Gmail not open — try to open it first
                console.log(`[LocalSight Tabs] Gmail not found. Opening Gmail...`);
                const newTab = await chrome.tabs.create({ url: 'https://mail.google.com', active: true });
                newTargetTabId = newTab.id!;
                lastOpenedTabId = newTargetTabId;
                await waitForTabLoad(newTargetTabId);
                await new Promise(r => setTimeout(r, 2000)); // Gmail SPA needs extra time
                gmailTab = await chrome.tabs.get(newTargetTabId);
            }

            if (!gmailTab || !gmailTab.id) {
                success = false;
                reason = 'Could not find or open Gmail.';
                reply = '❌ Could not find or open Gmail.';
            } else {
                const gmailTabId = gmailTab.id;
                newTargetTabId = gmailTabId;

                // Step B: Make Gmail tab active so content script can run
                await chrome.tabs.update(gmailTabId, { active: true });
                console.log(`[LocalSight Tabs] Target tab: ${gmailTabId}`);
                console.log(`[LocalSight Tabs] URL: ${gmailTab.url}`);

                // Step C: Ensure content script is injected
                try { await ensureContentScript(gmailTabId); } catch(e) {}
                await new Promise(r => setTimeout(r, 500));

                // Step D: Send CLICK_FIRST_EMAIL to content script with retry logic
                let emailResult: any = null;
                for (let attempt = 0; attempt < 3; attempt++) {
                    console.log(`[LocalSight Gmail] Attempt ${attempt + 1}: Clicking ${ordinalWord} email...`);
                    emailResult = await sendToContentScript(gmailTabId, {
                        action: 'CLICK_FIRST_EMAIL',
                        ordinal: ordinal
                    });

                    if (emailResult && emailResult.success) break;
                    if (emailResult && emailResult.navigated) break;

                    // If email rows not visible yet, wait and retry (SPA rendering)
                    console.log(`[LocalSight Gmail] Not found on attempt ${attempt + 1}: ${emailResult?.verification?.reason}`);
                    await new Promise(r => setTimeout(r, 1500));
                }

                if (emailResult && emailResult.success) {
                    // Step E: Verify Gmail thread URL
                    await new Promise(r => setTimeout(r, 1500));
                    const updatedTab = await chrome.tabs.get(gmailTabId).catch(() => null);
                    const newUrl = updatedTab?.url || '';
                    const isThreadView = newUrl.includes('#inbox/') || newUrl.includes('#all/') ||
                        newUrl.includes('#sent/') || newUrl.includes('#starred/') ||
                        newUrl.match(/#[a-z]+\/[A-Za-z0-9]+/) !== null;

                    console.log(`[LocalSight Gmail] Before URL: ${gmailTab.url}`);
                    console.log(`[LocalSight Gmail] After URL: ${newUrl}`);
                    console.log(`[LocalSight Gmail] Thread view detected: ${isThreadView}`);

                    if (isThreadView) {
                        success = true;
                        after_url = newUrl;
                        reason = `Gmail thread opened. URL: ${newUrl}`;
                        reply = `✅ Opened the ${ordinalWord} email in Gmail.`;
                        console.log(`[LocalSight Verification] PASSED: Gmail message opened`);
                    } else if (emailResult.navigated || (newUrl !== (gmailTab.url || ''))) {
                        // URL changed, likely opened
                        success = true;
                        after_url = newUrl;
                        reason = `URL changed after clicking email.`;
                        reply = `✅ Opened the ${ordinalWord} email in Gmail.`;
                        console.log(`[LocalSight Verification] PASSED: URL changed`);
                    } else {
                        success = false;
                        reason = `Clicked the email row but Gmail URL did not change to a thread view. Current URL: ${newUrl}`;
                        reply = `❌ I clicked the ${ordinalWord} email but couldn't verify it opened. Please check Gmail.`;
                        console.log(`[LocalSight Verification] FAILED: No thread URL detected`);
                    }
                } else {
                    success = false;
                    reason = emailResult?.verification?.reason || 'Could not find email rows in Gmail inbox.';
                    reply = `❌ Couldn't find the ${ordinalWord} email in Gmail. Make sure Gmail is loaded and the inbox is visible.`;
                }
            }
        } else if (step.type === 'click_result') {
            const index = step.index || 0;
            const ordinalWords = ['first', 'second', 'third', 'fourth', 'fifth'];
            const ordinalWord = index < ordinalWords.length ? ordinalWords[index] : 'first';

            // -----------------------------------------------------------------------
            // RESOLVE THE CORRECT TAB — must be Google search results, not active tab
            // -----------------------------------------------------------------------
            let searchTab = await resolveSearchTab();
            let resolvedTabId = targetTabId; // fallback

            const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
            console.log(`[LocalSight] CLICK_RESULT`);
            console.log(`[LocalSight] currentTaskTabId: ${currentTaskTabId}`);
            console.log(`[LocalSight] activeTabId: ${activeTab?.id}`);
            console.log(`[LocalSight] searchTab: ${searchTab?.id} (${searchTab?.url?.substring(0, 60)})`);
            console.log(`[LocalSight] targetTabId (processUserCommand): ${targetTabId}`);

            if (searchTab && searchTab.id) {
                resolvedTabId = searchTab.id;
                // Make the search tab active so we can send messages to it
                await chrome.tabs.update(resolvedTabId, { active: true });
                await new Promise(r => setTimeout(r, 300));
            } else {
                // No Google search tab — check if current task tab has any results
                const taskTab = currentTaskTabId ? await chrome.tabs.get(currentTaskTabId).catch(() => null) : null;
                const activeTabInfo = await chrome.tabs.get(targetTabId).catch(() => null);
                const fallbackUrl = taskTab?.url || activeTabInfo?.url || '';
                success = false;
                reason = `No Google search-results tab found. Task tab URL: ${fallbackUrl}. Please search Google first.`;
                reply = `❌ I couldn't find a Google search-results tab. Please search Google first, then ask me to open a result.`;
                console.log(`[LocalSight] CLICK_RESULT failed: no search tab found`);
                // Return early, skip remaining click logic
                return {
                    executed: true,
                    success: false,
                    state_changed: false,
                    before_url: currentUrl,
                    after_url: currentUrl,
                    verification: { passed: false, reason },
                    newTargetTabId: targetTabId,
                    reply
                };
            }

            // Verify the resolved tab is a Google search page
            const resolvedTab = await chrome.tabs.get(resolvedTabId).catch(() => null);
            console.log(`[LocalSight] targetURL: ${resolvedTab?.url}`);

            // Snapshot tab IDs before click to detect new-tab navigation
            const tabsBefore = (await chrome.tabs.query({ currentWindow: true })).map(t => t.id);

            // Use dedicated CLICK_SEARCH_RESULT handler in content script
            const execRes = await sendToContentScript(resolvedTabId, {
                action: 'CLICK_SEARCH_RESULT',
                ordinal: index
            });

            if (!execRes || execRes.stage === 'CONTENT_SCRIPT_CONNECTION') {
                success = false;
                reason = `Content script unavailable on search tab ${resolvedTabId}. ${execRes?.error || ''}`;
                reply = `❌ Could not connect to the Google search page. Try reloading it first.`;
            } else if (execRes.navigated || (execRes.success && execRes.after_url && execRes.after_url !== (resolvedTab?.url || ''))) {
                // Navigation happened — detect where we ended up
                await new Promise(r => setTimeout(r, 2000));
                const tabsAfter = await chrome.tabs.query({ currentWindow: true });
                const newTab = tabsAfter.find(t => !tabsBefore.includes(t.id));
                if (newTab && newTab.id) {
                    newTargetTabId = newTab.id;
                    after_url = newTab.url || currentUrl;
                    setTaskTab(newTargetTabId, after_url, 'click_result');
                } else {
                    const updatedTab = await chrome.tabs.get(resolvedTabId).catch(() => null);
                    after_url = updatedTab?.url || currentUrl;
                    newTargetTabId = resolvedTabId;
                    setTaskTab(newTargetTabId, after_url, 'click_result');
                }
                success = true;
                reason = `Clicked ${ordinalWord} result, navigated to ${after_url}`;
                reply = `Opened the ${ordinalWord} result.`;
                console.log(`[LocalSight] URL before: ${resolvedTab?.url}`);
                console.log(`[LocalSight] URL after: ${after_url}`);
            } else if (execRes && execRes.success) {
                success = true;
                after_url = execRes.after_url || currentUrl;
                newTargetTabId = resolvedTabId;
                setTaskTab(newTargetTabId, after_url, 'click_result');
                reason = execRes.verification?.reason || `Clicked ${ordinalWord} result.`;
                reply = `Opened the ${ordinalWord} result.`;
                console.log(`[LocalSight] URL before: ${resolvedTab?.url}`);
                console.log(`[LocalSight] URL after: ${after_url}`);
            } else {
                success = false;
                reason = execRes?.verification?.reason || `Failed to click ${ordinalWord} result.`;
                reply = `❌ ${reason}`;
                console.log(`[LocalSight] CLICK_RESULT failed: ${reason}`);
            }
        } else if (step.type === 'click_generic') {
            console.log(`[LocalSight Browser] click_generic: tab=${targetTabId} value="${step.value}"`);

            const tabsBefore2 = (await chrome.tabs.query({ currentWindow: true })).map(t => t.id);

            const execResG = await sendToContentScript(targetTabId, {
                action: 'EXECUTE_ACTION',
                step: { type: 'click_generic', value: step.value },
                target_id: ''
            });

            if (!execResG || execResG.stage === 'CONTENT_SCRIPT_CONNECTION') {
                success = false;
                reason = `Content script unavailable on tab ${targetTabId}.`;
                reply = `❌ Could not connect to the page. Try reloading it first.`;
            } else if (execResG.navigated) {
                await new Promise(r => setTimeout(r, 1800));
                const tabsAfter2 = await chrome.tabs.query({ currentWindow: true });
                const newTab2 = tabsAfter2.find(t => !tabsBefore2.includes(t.id));
                if (newTab2 && newTab2.id) {
                    newTargetTabId = newTab2.id;
                    lastOpenedTabId = newTab2.id;
                    after_url = newTab2.url || currentUrl;
                } else {
                    const [activeNow2] = await chrome.tabs.query({ active: true, currentWindow: true });
                    after_url = activeNow2?.url || currentUrl;
                    if (activeNow2?.id) newTargetTabId = activeNow2.id;
                }
                success = true;
                reason = `Clicked '${step.value}', navigated to ${after_url}`;
                reply = `Clicked: ${step.value}.`;
            } else if (execResG && execResG.success) {
                success = true;
                after_url = execResG.after_url || currentUrl;
                reason = execResG.verification?.reason || `Clicked '${step.value}'.`;
                reply = `Clicked: ${step.value}.`;
            } else {
                success = false;
                reason = execResG?.verification?.reason || `Failed to click '${step.value}'.`;
                reply = `❌ ${reason}`;
            }
        } else if (step.type === 'go_back') {
            const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
            const currentTabId = active?.id || targetTabId;
            try {
                await chrome.tabs.goBack(currentTabId);
                await waitForTabLoad(currentTabId);
                const [updated] = await chrome.tabs.query({ active: true, currentWindow: true });
                after_url = updated?.url || currentUrl;
                if (after_url === before_url) {
                    reason = "Went back, but URL did not appear to change.";
                } else {
                    reason = "Went back";
                }
                reply = "Went back to the previous page.";
                newTargetTabId = currentTabId;
            } catch (e: any) {
                if (e.message && e.message.toLowerCase().includes('history')) {
                    success = false;
                    reason = "No previous page in this tab's history.";
                    reply = "No previous page in this tab's history.";
                } else {
                    throw e;
                }
            }
        } else if (step.type === 'go_forward') {
            const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
            const currentTabId = active?.id || targetTabId;
            try {
                await chrome.tabs.goForward(currentTabId);
                await waitForTabLoad(currentTabId);
                const [updated] = await chrome.tabs.query({ active: true, currentWindow: true });
                after_url = updated?.url || currentUrl;
                if (after_url === before_url) {
                    reason = "Went forward, but URL did not appear to change.";
                } else {
                    reason = "Went forward";
                }
                reply = "Went forward.";
                newTargetTabId = currentTabId;
            } catch (e: any) {
                if (e.message && e.message.toLowerCase().includes('history')) {
                    success = false;
                    reason = "No next page in this tab's history.";
                    reply = "No next page in this tab's history.";
                } else {
                    throw e;
                }
            }
        }
    } catch (e: any) {
        success = false;
        reason = `Browser action error: ${e.message}`;
        reply = `Couldn't execute browser action: ${e.message}`;
    }

    return {
        executed: true,
        success: success,
        state_changed: state_changed,
        before_url,
        after_url,
        verification: { passed: success, reason: reason },
        newTargetTabId,
        reply
    };
}

async function processUserCommand(task: string, taskId: string) {
    if (!activeAgent) return;
    
    console.log(`\n==================================================`);
    console.log(`TASK ${taskId}`);
    console.log(`[USER]\n${task}`);
    console.log(`==================================================`);

    currentTraces = [];
    actionHistory = [];
    recentDownloads = []; 
    
    const [initialTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!initialTab || !initialTab.id) throw new Error("No active tab to start");
    let targetTabId = initialTab.id;
    
    chrome.runtime.sendMessage({ 
        action: 'AGENT_INIT', 
        visionStatus: 'CHECKING',
        vlmStatus: 'CHECKING',
        agentStatus: 'RUNNING'
    });

    const localIntent = classifyBrowserCommand(task);
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
    }

    try {
        const intentReqBody = {
            task,
            conversation_history: conversationHistory.slice(-10)
        };
        const intentResponse = await fetch('http://localhost:8000/api/intent', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(intentReqBody)
        });
        
        if (intentResponse.ok) {
            const intentRes = await intentResponse.json();
            if (intentRes.status === 'PLAN' && intentRes.steps && intentRes.steps.length > 0) {
                const step = intentRes.steps[0].action;
                console.log(`[LocalSight Router] Backend browser intent detected: ${step.type.toUpperCase()}`);
                pushTrace(`⚡ Backend browser command routed: ${step.type}`);
                setStatus(`Executing ${step.type}...`);
                
                let execRes: any = null;
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
                }
                activeAgent = false;
                return;
            } else if (intentRes.status === 'CHAT') {
                 chrome.runtime.sendMessage({ action: 'CHAT_RESPONSE', message: intentRes.reply });
                 conversationHistory.push({ role: 'assistant', content: intentRes.reply });
                 chrome.runtime.sendMessage({ action: 'HISTORY_UPDATED', history: conversationHistory });
                 chrome.runtime.sendMessage({ action: 'AGENT_INIT', agentStatus: 'COMPLETED' });
                 chrome.runtime.sendMessage({ action: 'AGENT_COMPLETE' });
                 activeAgent = false;
                 return;
            }
        }
    } catch(e) {
        console.error("[LocalSight] Intent API error:", e);
    }

    return runVisionAgent(task, taskId);
}
async function runVisionAgent(task: string, taskId: string) {
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
        let rawDataUrl = null;
        try {
            rawDataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'jpeg' });
        } catch (e: any) {
            console.log("[LocalSight] captureVisibleTab failed, falling back to DOM-only.", e.message);
        }
        
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

        let redactedBase64 = null;
        let viewport = { width: 1280, height: 720 };
        
        if (rawDataUrl) {
            const response = await fetch(rawDataUrl);
            const blob = await response.blob();
            const imageBitmap = await createImageBitmap(blob);
            const MAX_IMAGE_SIZE = 1024;
            let targetWidth = imageBitmap.width;
            let targetHeight = imageBitmap.height;
            let scale = 1.0;
            viewport = { width: targetWidth, height: targetHeight };
            
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
            redactedBase64 = await new Promise<string>((resolve) => {
                reader.onloadend = () => resolve(reader.result as string);
                reader.readAsDataURL(redactedBlob);
            });
        }

        const recentConversation = conversationHistory.slice(-10);

        const reqBody = {
            task_id: taskId,
            step_id: stepCount + 1,
            task,
            original_task: currentTask,
            url,
            title,
            sanitized_image: redactedBase64,
            viewport: viewport,
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

        // Extract step from steps array if it exists
        if (vlmRes.steps && vlmRes.steps.length > 0) {
            vlmRes.action = vlmRes.steps[0].action;
        }
        
        // Prevent LLM hallucinating SUCCESS when it actually provided an action to execute
        if (vlmRes.status === 'SUCCESS' && vlmRes.action) {
            console.log(`[LocalSight] LLM hallucinated SUCCESS but provided an action. Forcing status to PLAN.`);
            vlmRes.status = 'PLAN';
        }

        if (vlmRes.status === 'SUCCESS' || (vlmRes.success === true && !vlmRes.action && vlmRes.status !== 'NEEDS_USER' && vlmRes.status !== 'PLAN' && vlmRes.status !== 'ACTION')) {
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
