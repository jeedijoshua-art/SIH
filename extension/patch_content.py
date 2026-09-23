import re

with open("src/content/content.ts", "r") as f:
    content = f.read()

# Add the robust candidate discovery and resolver before executeAction
resolver_code = """
// -----------------------------------------------------------------------------
// ROBUST DOM TARGET RESOLUTION
// -----------------------------------------------------------------------------

function isElementVisible(el: HTMLElement): boolean {
    if (!el || !el.getBoundingClientRect) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    return true;
}

function getClickableCandidates(): any[] {
    const isGoogleSearch = window.location.hostname.includes('google.com') && window.location.pathname === '/search';
    let candidates: any[] = [];
    
    if (isGoogleSearch) {
        // Robust Google Organic Result Extraction
        const resultContainers = document.querySelectorAll('#search .g, #search div[data-sokoban-container]');
        resultContainers.forEach((container, index) => {
            const anchor = container.querySelector('a') as HTMLAnchorElement;
            if (anchor && anchor.href && !anchor.href.includes('google.com') && isElementVisible(anchor)) {
                // Filter "People also ask" and ads
                if (!container.closest('.related-question-pair') && !container.closest('.vdLsw')) {
                    candidates.push({
                        element: anchor,
                        text: anchor.innerText || anchor.textContent || '',
                        href: anchor.href,
                        title: anchor.title || '',
                        ariaLabel: anchor.getAttribute('aria-label') || '',
                        role: 'organic_result',
                        ordinal: candidates.length
                    });
                }
            }
        });
        if (candidates.length > 0) return candidates; // Prioritize organic results if found
    }

    // Generic link/button discovery
    const clickableSelectors = 'a[href], button, input[type="submit"], input[type="button"], [role="button"], [role="link"], [onclick], [tabindex]:not([tabindex="-1"])';
    const elements = document.querySelectorAll(clickableSelectors);
    
    elements.forEach((el, index) => {
        const htmlEl = el as HTMLElement;
        if (isElementVisible(htmlEl)) {
            let text = htmlEl.innerText || htmlEl.textContent || '';
            let ariaLabel = htmlEl.getAttribute('aria-label') || '';
            let title = htmlEl.title || '';
            let href = htmlEl instanceof HTMLAnchorElement ? htmlEl.href : '';
            let role = htmlEl.getAttribute('role') || htmlEl.tagName.toLowerCase();
            
            // Clean up text
            text = text.replace(/\\s+/g, ' ').trim();
            
            candidates.push({
                element: htmlEl,
                text,
                href,
                title,
                ariaLabel,
                role,
                ordinal: candidates.length
            });
        }
    });

    return candidates;
}

function resolveElementTarget(command: string, candidates: any[]): any {
    if (!command) return null;
    const cmdLower = command.toLowerCase().trim();
    
    // 1. Ordinal resolution
    let targetIndex = -1;
    if (cmdLower.includes('first') || cmdLower.includes('1st')) targetIndex = 0;
    else if (cmdLower.includes('second') || cmdLower.includes('2nd')) targetIndex = 1;
    else if (cmdLower.includes('third') || cmdLower.includes('3rd')) targetIndex = 2;
    else if (cmdLower.includes('fourth') || cmdLower.includes('4th')) targetIndex = 3;
    else if (cmdLower.includes('fifth') || cmdLower.includes('5th')) targetIndex = 4;
    
    if (targetIndex >= 0 && targetIndex < candidates.length) {
        // If it's a "result" command, filter candidates to organic results first
        if (cmdLower.includes('result') || cmdLower.includes('link')) {
            const results = candidates.filter(c => c.role === 'organic_result' || c.role === 'a' || c.role === 'link');
            if (results.length > targetIndex) return results[targetIndex];
        }
        return candidates[targetIndex];
    }
    
    // 2. Exact match (Text, Aria, Title)
    for (const c of candidates) {
        const textLower = c.text.toLowerCase();
        if (textLower && textLower === cmdLower) return c;
        if (c.ariaLabel && c.ariaLabel.toLowerCase() === cmdLower) return c;
        if (c.title && c.title.toLowerCase() === cmdLower) return c;
    }
    
    // 3. Partial Text/Href match
    // Strip common filler words from command
    const keywords = cmdLower.replace(/click|the|link|button|result|in|this|webpage/g, '').trim();
    if (keywords.length > 2) {
        for (const c of candidates) {
            const textLower = c.text.toLowerCase();
            if (textLower && textLower.includes(keywords)) return c;
            if (c.href && c.href.toLowerCase().includes(keywords)) return c;
            if (c.ariaLabel && c.ariaLabel.toLowerCase().includes(keywords)) return c;
        }
    }
    
    return null;
}
"""

content = content.replace("export async function executeAction(step: any, target_id: string): Promise<any> {", resolver_code + "\nexport async function executeAction(step: any, target_id: string): Promise<any> {")


# Update the executeAction logic to handle generic clicks robustly
execute_action_patch = """
          if (!['go_back', 'go_forward', 'no_op', 'navigate', 'press_key', 'read_page', 'find_text', 'click_generic'].includes(step.type)) {
              let el = document.getElementById(target_id) as HTMLElement;
              
              if (!el && step.type === 'click') {
                  // Fallback to natural language resolution if target_id is invalid/missing
                  const candidates = getClickableCandidates();
                  const resolved = resolveElementTarget(step.value || step.action || target_id, candidates);
                  if (resolved && resolved.element) {
                      el = resolved.element;
                  }
              }

              if (!el) {
                  result.success = false;
                  result.verification = { passed: false, reason: "Element not found in DOM and could not be resolved." };
                  return result;
              }
              
              result.elementFound = true;
              
              if (!isElementVisible(el)) {
                  result.success = false;
                  result.verification = { passed: false, reason: "Element is not visible." };
                  return result;
              }
              result.elementVisible = true;
              
              if ((el as HTMLInputElement).disabled) {
                  result.success = false;
                  result.verification = { passed: false, reason: "Element is disabled." };
                  return result;
              }
              result.elementEnabled = true;
              
              target_id = el.id || "resolved-element"; // Assign a dummy ID if it was resolved
              // We inject the resolved element into the DOM by setting a temporary ID so the rest of the function can find it
              if (!el.id) el.id = "localsight-temp-" + Date.now();
              target_id = el.id;
          }

          if (step.type === 'click_generic') {
              const candidates = getClickableCandidates();
              const resolved = resolveElementTarget(step.value || step.action || '', candidates);
              
              if (!resolved || !resolved.element) {
                  result.success = false;
                  result.verification = { passed: false, reason: `Could not find a visible clickable link matching '${step.value}'` };
                  return result;
              }
              
              const el = resolved.element;
              try {
                  el.scrollIntoView({ behavior: 'instant', block: 'center' });
                  // Fallback robust click sequence
                  el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
                  el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
                  el.click();
                  
                  result.executed = true;
                  result.success = true;
                  
                  // Verification: Check if URL changes or navigation starts
                  const currentUrl = window.location.href;
                  await new Promise(r => setTimeout(r, 800)); // wait briefly for navigation
                  if (window.location.href !== currentUrl || document.readyState === 'loading') {
                      result.verification = { passed: true, reason: `Clicked and navigation started to ${resolved.href || 'new page'}` };
                  } else {
                      result.verification = { passed: true, reason: `Clicked element: ${resolved.text.substring(0,30)}` };
                  }
                  
                  result.after_url = window.location.href;
                  return result;
              } catch (e: any) {
                  result.success = false;
                  result.verification = { passed: false, reason: `Error clicking element: ${e.message}` };
                  return result;
              }
          }
          
          const el = document.getElementById(target_id) as HTMLElement;
"""

# Replace the block from `if (!['go_back', ...` up to `const el = document.getElementById...`
content = re.sub(
    r"if \(\!\['go_back',.*?const el = document\.getElementById\(target_id\) as HTMLElement;",
    execute_action_patch.strip(),
    content,
    flags=re.DOTALL
)

# Also fix the standard 'click' to be robust
click_patch = """              if (step.type === 'click') {
                  try {
                      el.scrollIntoView({ behavior: 'instant', block: 'center' });
                      el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
                      el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
                      el.click();
                      result.executed = true;
                      result.success = true;
                      await new Promise(r => setTimeout(r, 500));
                      result.verification = { passed: true, reason: 'Element clicked successfully.' };
                  } catch (e: any) {
                      result.success = false;
                      result.verification = { passed: false, reason: 'Failed to click element: ' + e.message };
                  }
              } else if (step.type === 'type') {"""

content = content.replace("              if (step.type === 'click') {\n                  el.scrollIntoView({ behavior: 'instant', block: 'center' });\n                  el.click();\n                  result.executed = true;\n              } else if (step.type === 'type') {", click_patch)

with open("src/content/content.ts", "w") as f:
    f.write(content)
