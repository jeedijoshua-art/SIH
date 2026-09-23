import re

with open("src/content/content.ts", "r") as f:
    content = f.read()

# Make sure we don't duplicate the resolver code
if "function isElementVisible" not in content:
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
    
    let targetIndex = -1;
    if (cmdLower.includes('first') || cmdLower.includes('1st')) targetIndex = 0;
    else if (cmdLower.includes('second') || cmdLower.includes('2nd')) targetIndex = 1;
    else if (cmdLower.includes('third') || cmdLower.includes('3rd')) targetIndex = 2;
    else if (cmdLower.includes('fourth') || cmdLower.includes('4th')) targetIndex = 3;
    else if (cmdLower.includes('fifth') || cmdLower.includes('5th')) targetIndex = 4;
    
    if (targetIndex >= 0 && targetIndex < candidates.length) {
        if (cmdLower.includes('result') || cmdLower.includes('link')) {
            const results = candidates.filter(c => c.role === 'organic_result' || c.role === 'a' || c.role === 'link');
            if (results.length > targetIndex) return results[targetIndex];
        }
        return candidates[targetIndex];
    }
    
    for (const c of candidates) {
        const textLower = c.text.toLowerCase();
        if (textLower && textLower === cmdLower) return c;
        if (c.ariaLabel && c.ariaLabel.toLowerCase() === cmdLower) return c;
        if (c.title && c.title.toLowerCase() === cmdLower) return c;
    }
    
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

# --- We will replace the try block and target resolving block in one pass using regex ---

# Find from `          if (!['go_back',` to `              } else if (step.type === 'type') {`
pattern = r"          if \(\!\['go_back', 'go_forward', 'no_op', 'navigate', 'press_key', 'read_page', 'find_text'\]\.includes\(step\.type\)\) \{.*?\} else if \(step\.type === 'type'\) \{"

new_huge_block = """          let resolvedElement: HTMLElement | null = null;
          let genericResolved = false;
          let genericClickSuccessReason = '';

          if (!['go_back', 'go_forward', 'no_op', 'navigate', 'press_key', 'read_page', 'find_text'].includes(step.type)) {
              let el = document.getElementById(target_id) as HTMLElement;
              
              if (!el && (step.type === 'click' || step.type === 'click_generic')) {
                  const candidates = getClickableCandidates();
                  const resolved = resolveElementTarget(step.value || step.action || target_id, candidates);
                  if (resolved && resolved.element) {
                      el = resolved.element;
                      genericResolved = true;
                      genericClickSuccessReason = `Clicked resolved element: ${resolved.text.substring(0,30)} (${resolved.href || ''})`;
                  }
              }

              if (!el) {
                  result.success = false;
                  result.verification = { passed: false, reason: `Element not found in DOM and could not be resolved for command: ${step.value || target_id}` };
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
              
              resolvedElement = el;
          }

          const el = resolvedElement as HTMLElement;

          try {
              if (step.type === 'click' || step.type === 'click_generic') {
                  el.scrollIntoView({ behavior: 'instant', block: 'center' });
                  el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
                  el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
                  el.click();
                  result.executed = true;
                  
                  if (genericResolved) {
                      result.success = true;
                      const currentUrl = window.location.href;
                      await new Promise(r => setTimeout(r, 600));
                      if (window.location.href !== currentUrl || document.readyState === 'loading') {
                          result.verification = { passed: true, reason: genericClickSuccessReason + " -> Navigation started" };
                      } else {
                          result.verification = { passed: true, reason: genericClickSuccessReason };
                      }
                      return result;
                  }
              } else if (step.type === 'type') {"""

content = re.sub(pattern, new_huge_block, content, flags=re.DOTALL)

with open("src/content/content.ts", "w") as f:
    f.write(content)

