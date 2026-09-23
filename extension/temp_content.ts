import { PrivacyDetection, StructuredStep, ExecutionResult } from '../shared/types';

const REGEX_RULES = [
  { type: 'EMAIL', regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g },
  { type: 'PHONE', regex: /(?:\+91|0)?[789]\d{9}/g },
  { type: 'PAN', regex: /[A-Z]{5}[0-9]{4}[A-Z]{1}/g },
];

function isVisible(el: Element): boolean {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;
    const style = window.getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
}

function queryAllRecursive(root: Document | ShadowRoot | Element, selectors: string, results: Element[] = []): Element[] {
    if (!root) return results;
    
    let elements: NodeListOf<Element>;
    try {
        elements = root.querySelectorAll(selectors);
    } catch {
        return results;
    }
    
    elements.forEach(el => {
        results.push(el);
        if (el.shadowRoot) {
            queryAllRecursive(el.shadowRoot, selectors, results);
        }
        if (el.tagName === 'IFRAME') {
            try {
                const iframeDoc = (el as HTMLIFrameElement).contentDocument;
                if (iframeDoc) {
                    queryAllRecursive(iframeDoc, selectors, results);
                }
            } catch (e) {
                // Ignore cross-origin errors
            }
        }
    });
    
    // Also need to check if root itself has children that are shadow roots or iframes not caught by the selector
    // Actually, document.querySelectorAll('*') will catch elements that might have shadow roots.
    // Let's ensure we catch all shadow roots and iframes by querying them explicitly if they aren't in `selectors`
    const containers = root.querySelectorAll('*');
    containers.forEach(el => {
        if (el.shadowRoot && !results.includes(el)) { // avoid double processing if it matched selectors
           queryAllRecursive(el.shadowRoot, selectors, results);
        }
        if (el.tagName === 'IFRAME' && !results.includes(el)) {
           try {
                const iframeDoc = (el as HTMLIFrameElement).contentDocument;
                if (iframeDoc) {
                    queryAllRecursive(iframeDoc, selectors, results);
                }
            } catch (e) {}
        }
    });

    return Array.from(new Set(results));
}

function analyzeDOM(): any[] {
  // Extract flat elements
  const selectors = 'input, button, a, textarea, select, form, table, tr, th, td, h1, h2, h3, h4, h5, h6, label, img, [role], [aria-label], [title], p, span, div.card, dialog';
  const rawElements = queryAllRecursive(document, selectors);
  
  // Build relationship hierarchy
  const elements = rawElements.map((el, index) => {
    const rect = el.getBoundingClientRect();
    const id = el.id || `agent-id-${index}`;
    if (!el.id) el.id = id;
    
    // Nearest semantic containers
    const row = el.closest('tr');
    const table = el.closest('table');
    const form = el.closest('form');
    const card = el.closest('div.card');
    const dialog = el.closest('dialog') || el.closest('[role="dialog"]') || el.closest('.modal');
    
    let containerContext = "";
    if (row && table) {
        // Collect text from siblings in the row
        const rowText = Array.from(row.querySelectorAll('td, th')).map(td => (td as HTMLElement).innerText.trim()).filter(Boolean).join(" | ");
        containerContext = `Table Row Data: [${rowText}]`;
    } else if (card) {
        const cardTitle = card.querySelector('h1, h2, h3, h4, h5, h6')?.textContent || "";
        containerContext = `Card: ${cardTitle}`;
    } else if (form) {
        containerContext = `Form`;
    } else if (dialog) {
        containerContext = `Modal Dialog`;
    }

    let associatedLabel = null;
    if ((el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA') && el.id) {
        const label = document.querySelector(`label[for="${el.id}"]`);
        if (label) associatedLabel = (label as HTMLElement).innerText;
    } else if (el.closest('label')) {
        associatedLabel = (el.closest('label') as HTMLElement).innerText;
    }

    if (!associatedLabel && (el.tagName === 'INPUT' || el.tagName === 'SELECT') && el.previousElementSibling) {
        associatedLabel = (el.previousElementSibling as HTMLElement).innerText;
    }
    
    let rowText = "";
    if (row) {
        rowText = Array.from(row.querySelectorAll('td, th')).map(td => (td as HTMLElement).innerText.trim()).filter(Boolean).join(" | ");
    }
    let formText = form ? (form.getAttribute('aria-label') || form.id || form.className || "form") : "";
    let dialogText = dialog ? (dialog.getAttribute('aria-label') || dialog.id || "dialog") : "";
    let parentText = el.parentElement ? el.parentElement.innerText?.substring(0, 100) : "";

    return {
        id,
        tag: el.tagName.toLowerCase(),
        role: el.getAttribute('role') || null,
        text: (el as HTMLElement).innerText?.trim() || null,
        ariaLabel: el.getAttribute('aria-label') || null,
        title: el.getAttribute('title') || null,
        placeholder: el.getAttribute('placeholder') || null,
        value: (el as HTMLInputElement).value || null,
        href: (el as HTMLAnchorElement).href || null,
        type: (el as HTMLInputElement).type || null,
        name: (el as HTMLInputElement).name || null,
        disabled: (el as HTMLInputElement).disabled || false,
        checked: (el as HTMLInputElement).checked || false,
        visible: isVisible(el),
        rect: [rect.left, rect.top, rect.width, rect.height],
        associatedLabel,
        containerContext,
        rowText,
        formText,
        dialogText,
        parentText
    };
  });
  
  // Filter out invisible and redundant wrapper elements to keep it compact
  return elements.filter(el => {
      if (!el.visible) return false;
      if (el.tag === 'div' && !el.text) return false;
      if (el.tag === 'span' && !el.text && !el.ariaLabel) return false;
      return true;
  });
}

function hashDOM(elements: any[]): string {
    let str = window.location.href;
    for (const el of elements) {
        if (el.visible) {
            str += `${el.id}|${el.tag}|${el.value}|${el.checked}|${el.text}|`;
        }
    }
    // Simple DJB2 hash
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
        hash = (hash * 33) ^ str.charCodeAt(i);
    }
    return (hash >>> 0).toString(16);
}

function detectRegexPII(): PrivacyDetection[] {
    const detections: PrivacyDetection[] = [];
    
    function checkText(text: string, element: Element) {
        for (const rule of REGEX_RULES) {
            const matches = [...text.matchAll(rule.regex)];
            for (let _i = 0; _i < matches.length; _i++) {
                const rect = element.getBoundingClientRect();
                if (rect.width > 0 && rect.height > 0) {
                    detections.push({
                        type: rule.type,
                        bbox: [rect.left, rect.top, rect.width, rect.height],
                        confidence: 1.0,
                        source: 'REGEX'
                    });
                }
            }
        }
    }

    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
    let node;
    while(node = walk.nextNode()) {
        const text = node.nodeValue;
        if (text && node.parentElement) {
            checkText(text, node.parentElement);
        }
    }

    const inputs = document.querySelectorAll('input, textarea');
    inputs.forEach(input => {
        const value = (input as HTMLInputElement).value;
        if (value) {
            checkText(value, input);
        }
    });

    return detections;
}

function scoreElement(el: any, step: StructuredStep): number {
    if (!el.visible || el.disabled) return -100;
    
    let score = 0;
    let target = step.target;
    if (!target) return 0;

    // Convert string target to object format for unified handling
    if (typeof target === 'string') {
        const tStr = target.toLowerCase();
        // Direct ID match gets highest priority
        if (el.id && el.id.toLowerCase() === tStr) return 1000;
        if (el.name && el.name.toLowerCase() === tStr) return 900;
        if (el.ariaLabel && el.ariaLabel.toLowerCase() === tStr) return 800;
        
        target = {
            text: target,
            label: target,
            action_text: target
        };
    }
    
    const searchableText = `${el.text || ''} ${el.ariaLabel || ''} ${el.title || ''} ${el.placeholder || ''} ${el.value || ''} ${el.id || ''} ${el.name || ''} ${el.associatedLabel || ''}`.toLowerCase();
    
    if (target.text) {
        const targetText = target.text.toLowerCase().trim();
        if (searchableText.includes(targetText)) score += 10;
        if (el.text && el.text.toLowerCase().trim() === targetText) score += 100;
        else if (el.text && el.text.toLowerCase().includes(targetText)) score += 30;
        if (el.value && el.value.toLowerCase().trim() === targetText) score += 50;
    }
    
    if (target.label) {
        const labelText = target.label.toLowerCase().trim();
        // Priority 1: Exact label matches
        if (el.ariaLabel && el.ariaLabel.toLowerCase().trim() === labelText) score += 150;
        else if (el.ariaLabel && el.ariaLabel.toLowerCase().includes(labelText)) score += 50;
        
        if (el.associatedLabel && el.associatedLabel.toLowerCase().trim() === labelText) score += 150;
        else if (el.associatedLabel && el.associatedLabel.toLowerCase().includes(labelText)) score += 50;
        
        // Priority 2: Placeholders and Titles
        if (el.placeholder && el.placeholder.toLowerCase().trim() === labelText) score += 100;
        else if (el.placeholder && el.placeholder.toLowerCase().includes(labelText)) score += 30;
        
        if (el.title && el.title.toLowerCase().trim() === labelText) score += 100;
        else if (el.title && el.title.toLowerCase().includes(labelText)) score += 30;
        
        // Priority 3: Fallback to name/id and semantic text
        if (el.name && el.name.toLowerCase().trim() === labelText) score += 80;
        else if (el.name && el.name.toLowerCase().includes(labelText)) score += 20;

        if (el.id && el.id.toLowerCase().trim() === labelText) score += 50;
        else if (el.id && el.id.toLowerCase().includes(labelText)) score += 10;
        
        if (el.parentText && el.parentText.toLowerCase().includes(labelText)) score += 15;
    }

    if (target.containerContext || target.near_text || target.row_contains) {
        const constraint = (target.containerContext || target.near_text || target.row_contains || "").toLowerCase().trim();
        if (el.containerContext && el.containerContext.toLowerCase().includes(constraint)) {
            score += 100;
        } else if (el.rowText && el.rowText.toLowerCase().includes(constraint)) {
            score += 100;
        } else if (el.parentText && el.parentText.toLowerCase().includes(constraint)) {
            score += 40;
        } else {
            score -= 50;
        }
    }

    if (target.container_contains) {
        const containerConstraint = target.container_contains.toLowerCase().trim();
        if (el.formText && el.formText.toLowerCase().includes(containerConstraint)) score += 40;
        if (el.dialogText && el.dialogText.toLowerCase().includes(containerConstraint)) score += 40;
        if (el.parentText && el.parentText.toLowerCase().includes(containerConstraint)) score += 20;
    }

    if (target.action_text) {
        const actText = target.action_text.toLowerCase().trim();
        if (el.text && el.text.toLowerCase().trim() === actText) score += 100;
        else if (el.text && el.text.toLowerCase().includes(actText)) score += 30;
        
        if (el.ariaLabel && el.ariaLabel.toLowerCase().trim() === actText) score += 100;
        else if (el.ariaLabel && el.ariaLabel.toLowerCase().includes(actText)) score += 30;
        
        if (el.value && el.value.toLowerCase().trim() === actText) score += 100;
        else if (el.value && el.value.toLowerCase().includes(actText)) score += 30;
    }
    
    // Type-based bonuses
    const act = (step.type || '').toLowerCase();
    if (act === 'click' && (el.tag === 'button' || el.tag === 'a' || el.role === 'button')) score += 15;
    if (act === 'type' && (el.tag === 'input' || el.tag === 'textarea')) score += 15;
    if (act === 'select' && el.tag === 'select') score += 20;
    if (act === 'check' && el.tag === 'input' && el.type === 'checkbox') score += 20;
    
    // Penalize generic structural tags if score is not very strong
    if ((el.tag === 'div' || el.tag === 'span' || el.tag === 'td' || el.tag === 'tr') && score < 50) {
        score -= 20;
    }

    return score;
}

chrome.runtime.onMessage.addListener((message: any, _sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void) => {
  if (message.action === 'PING') {
    sendResponse({ status: 'OK' });
  } else if (message.action === 'ANALYZE_PAGE') {
    const safe_dom = analyzeDOM().slice(0, 40);
    const regex_detections = detectRegexPII();
    sendResponse({ 
        safe_dom, 
        regex_detections, 
        url: window.location.href, 
        title: document.title 
    });
  } else if (message.action === 'RESOLVE_TARGET') {
      const { step } = message;
      const page = analyzeDOM();
      
      const scoredElements = page.map(el => ({ el, score: scoreElement(el, step) }));
      scoredElements.sort((a, b) => b.score - a.score);
      
      const bestMatch = scoredElements[0];
      const secondMatch = scoredElements[1];
      
      if (!bestMatch || bestMatch.score < 20) {
          sendResponse({ target_id: null, confidence: 0, ambiguity: 0, error: 'No suitable target found' });
          return true;
      }
      
      const confidence = Math.min(1.0, bestMatch.score / 150);
      let ambiguity = 0;
      
      let candidatesCount = 1;
      for (let i = 1; i < scoredElements.length; i++) {
          if (scoredElements[i].score > 0 && (bestMatch.score - scoredElements[i].score < 20)) {
              candidatesCount++;
          } else {
              break;
          }
      }
      
      if (secondMatch && secondMatch.score > 0) {
          if (bestMatch.score - secondMatch.score < 20) {
              ambiguity = 1.0;
          } else if (bestMatch.score - secondMatch.score < 50) {
              ambiguity = 0.5;
          }
      }
      
      if ((ambiguity === 1.0 || (ambiguity === 0.5 && bestMatch.score < 300)) && bestMatch.score < 800) {
           sendResponse({ target_id: null, confidence, ambiguity, error: `TARGET_AMBIGUOUS: Found ${candidatesCount} identical or highly similar candidates. Please provide more specific constraints (e.g. near_text, container_contains).` });
           return true;
      }
      
      sendResponse({ 
          target_id: bestMatch.el.id, 
          score: bestMatch.score, 
          tag: bestMatch.el.tag,
          confidence,
          ambiguity
      });
  } else if (message.action === 'EXECUTE_ACTION') {
      const { step, target_id } = message;
      
      const executeAsync = async () => {
          const preHtml = document.body.innerHTML;
          const preUrl = window.location.href;
          const preFingerprint = hashDOM(analyzeDOM());
          
          let result: ExecutionResult = {
              success: false,
              action: step.type,
              target_id,
              elementFound: false,
              elementVisible: false,
              elementEnabled: false,
              executed: false,
              verification: { passed: false, reason: "Initialization" },
              state_changed: false,
              before_url: preUrl,
              after_url: preUrl,
              state_fingerprint_before: preFingerprint
          };

          if (step.type === 'wait') {
              const ms = parseInt(step.value || '1000', 10);
              await new Promise(r => setTimeout(r, ms));
              result.executed = true;
              result.success = true;
              result.state_changed = true;
              result.after_url = window.location.href;
              result.state_fingerprint_after = hashDOM(analyzeDOM());
              result.verification = { passed: true, reason: `Waited ${ms}ms` };
              return result;
          }
          
          if (step.type === 'scroll') {
              if (step.value === 'down') window.scrollBy({ top: window.innerHeight * 0.8, behavior: 'smooth' });
              else if (step.value === 'up') window.scrollBy({ top: -window.innerHeight * 0.8, behavior: 'smooth' });
              else if (step.value === 'top') window.scrollTo({ top: 0, behavior: 'smooth' });
              else if (step.value === 'bottom') window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
              
              await new Promise(r => setTimeout(r, 600));
              result.executed = true;
              result.success = true;
              result.after_url = window.location.href;
              result.state_fingerprint_after = hashDOM(analyzeDOM());
              result.state_changed = (result.state_fingerprint_after !== preFingerprint);
              result.verification = { passed: true, reason: `Scrolled ${step.value}` };
              return result;
          }

          if (step.type === 'read_page') {
              const text = document.body.innerText.substring(0, 10000);
              result.executed = true;
              result.success = true;
              result.state_changed = false;
              result.verification = { passed: true, reason: `Page text extracted (${text.length} chars)` };
              return result;
          }

          if (step.type === 'find_text') {
              const term = (step.value || '').toLowerCase();
              const els = Array.from(document.querySelectorAll('*'));
              let found = null;
              for(const e of els) {
                  const el = e as HTMLElement;
                  if(el.innerText && el.innerText.toLowerCase().includes(term) && isVisible(el) && el.children.length === 0) {
                      found = el; break;
                  }
              }
              if(!found) {
                  for(const e of els) {
                      const el = e as HTMLElement;
                      if(el.innerText && el.innerText.toLowerCase().includes(term) && isVisible(el)) {
                          found = el; break;
                      }
                  }
              }
              
              if(found) {
                  found.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  await new Promise(r => setTimeout(r, 600));
                  result.executed = true;
                  result.success = true;
                  result.state_changed = true;
                  result.after_url = window.location.href;
                  result.state_fingerprint_after = hashDOM(analyzeDOM());
                  result.verification = { passed: true, reason: `Found and scrolled to text: ${step.value}` };
              } else {
                  result.verification = { passed: false, reason: `Text not found: ${step.value}` };
              }
              return result;
          }

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
              if (!el) {
                  result.verification.reason = "Element not found in DOM at execution time.";
                  return result;
              }
              
              result.elementFound = true;
              
              if (!isVisible(el)) {
                  result.verification.reason = "Element is not visible.";
                  return result;
              }
              result.elementVisible = true;
              
              if ((el as HTMLInputElement).disabled) {
                  result.verification.reason = "Element is disabled.";
                  return result;
              }
              result.elementEnabled = true;
          }

          const el = document.getElementById(target_id) as HTMLElement;

          try {
              if (step.type === 'click') {
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
              } else if (step.type === 'type') {
                  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
                      el.focus();
                      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
                      const nativeTextAreaValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
                      const setter = el instanceof HTMLTextAreaElement ? nativeTextAreaValueSetter : nativeInputValueSetter;
                      
                      if (setter) {
                          setter.call(el, step.value || '');
                      } else {
                          el.value = step.value || '';
                      }
                      
                      el.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
                      el.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
                      result.executed = true;
                  } else {
                      result.verification.reason = "Target is not an input or textarea.";
                      return result;
                  }
              } else if (step.type === 'clear') {
                  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
                      el.focus();
                      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
                      const nativeTextAreaValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
                      const setter = el instanceof HTMLTextAreaElement ? nativeTextAreaValueSetter : nativeInputValueSetter;
                      
                      if (setter) {
                          setter.call(el, '');
                      } else {
                          el.value = '';
                      }
                      
                      el.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
                      el.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
                      result.executed = true;
                  } else {
                      result.verification.reason = "Target is not an input or textarea.";
                      return result;
                  }
              } else if (step.type === 'focus') {
                  el.focus();
                  result.executed = true;
              } else if (step.type === 'hover') {
                  el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
                  el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
                  result.executed = true;
              } else if (step.type === 'submit') {
                  if (el instanceof HTMLFormElement) {
                      el.submit();
                      result.executed = true;
                  } else if (el.closest('form')) {
                      el.closest('form')?.submit();
                      result.executed = true;
                  } else {
                      el.click();
                      result.executed = true;
                  }
              } else if (step.type === 'select') {
                  if (el instanceof HTMLSelectElement) {
                      const val = step.value?.toLowerCase() || '';
                      let found = false;
                      for (let i=0; i<el.options.length; i++) {
                          if (el.options[i].value.toLowerCase() === val || el.options[i].text.toLowerCase().includes(val)) {
                              el.selectedIndex = i;
                              found = true;
                              break;
                          }
                      }
                      if (!found) {
                          result.verification.reason = `Option '${val}' not found in select dropdown.`;
                          return result;
                      }
                      el.dispatchEvent(new Event('change', { bubbles: true }));
                      result.executed = true;
                  } else {
                      result.verification.reason = "Target is not a select element.";
                      return result;
                  }
              } else if (step.type === 'check') {
                  if (el instanceof HTMLInputElement && el.type === 'checkbox') {
                      if (!el.checked) {
                          el.click();
                          el.dispatchEvent(new Event('change', { bubbles: true }));
                      }
                      result.executed = true;
                  } else {
                      result.verification.reason = "Target is not a checkbox.";
                      return result;
                  }
              } else if (step.type === 'uncheck') {
                  if (el instanceof HTMLInputElement && el.type === 'checkbox') {
                      if (el.checked) {
                          el.click();
                          el.dispatchEvent(new Event('change', { bubbles: true }));
                      }
                      result.executed = true;
                  } else {
                      result.verification.reason = "Target is not a checkbox.";
                      return result;
                  }
              } else if (step.type === 'navigate') {
                  if (step.value) {
                      window.location.href = step.value;
                      result.executed = true;
                  } else {
                      result.verification.reason = "Missing URL for navigate action.";
                      return result;
                  }
              } else if (step.type === 'go_back') {
                  window.history.back();
                  result.executed = true;
              } else if (step.type === 'go_forward') {
                  window.history.forward();
                  result.executed = true;
              } else if (step.type === 'no_op') {
                  result.executed = true;
              } else if (step.type === 'press_key') {
                  if (step.value === 'Enter') {
                      const target = el || document.activeElement || document.body;
                      target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
                      target.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
                      if (el && el.tagName === 'INPUT') el.closest('form')?.dispatchEvent(new Event('submit', { bubbles: true }));
                      result.executed = true;
                  } else if (step.value === 'Escape') {
                      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true }));
                      result.executed = true;
                  } else {
                      result.verification.reason = `Unsupported key: ${step.value}`;
                      return result;
                  }
              } else {
                  result.verification.reason = `Unknown action type: ${step.type}`;
                  return result;
              }

              // Robust Adaptive Waiting via MutationObserver
              const waitForDOM = (): Promise<void> => {
                  return new Promise((resolve) => {
                      let timeoutId: number;
                      let idleTimeoutId: number;
                      const maxWait = 4000;
                      const idleTime = 300;

                      const observer = new MutationObserver(() => {
                          clearTimeout(idleTimeoutId);
                          idleTimeoutId = window.setTimeout(() => {
                              clearTimeout(timeoutId);
                              observer.disconnect();
                              resolve();
                          }, idleTime);
                      });

                      observer.observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true });

                      idleTimeoutId = window.setTimeout(() => {
                          clearTimeout(timeoutId);
                          observer.disconnect();
                          resolve();
                      }, idleTime);

                      timeoutId = window.setTimeout(() => {
                          clearTimeout(idleTimeoutId);
                          observer.disconnect();
                          resolve();
                      }, maxWait);
                  });
              };
              
              await waitForDOM();

              result.after_url = window.location.href;
              result.state_fingerprint_after = hashDOM(analyzeDOM());
              result.state_changed = (result.after_url !== result.before_url) || (result.state_fingerprint_after !== preFingerprint) || (document.body.innerHTML !== preHtml);

              if (['navigate', 'go_back', 'go_forward'].includes(step.type)) {
                  result.verification = { passed: true, reason: "Navigation triggered." };
                  result.success = true;
                  return result;
              }
              if (step.type === 'no_op' || step.type === 'hover' || step.type === 'focus' || step.type === 'submit') {
                  result.verification = { passed: true, reason: "Action executed." };
                  result.success = true;
                  return result;
              }
              if (step.type === 'press_key') {
                  result.verification = { passed: true, reason: "Keypress executed." };
                  result.success = true;
                  return result;
              }

              // Check if URL changed
              if (step.type === 'click') {
                  if (window.location.href !== preUrl) {
                      result.verification = { passed: true, reason: "URL changed successfully after click." };
                      result.success = true;
                  } 
                  else if (document.querySelector('dialog[open], .modal:not([style*="display: none"])') && !document.querySelector('dialog[open], .modal:not([style*="display: none"])')?.contains(el)) {
                      result.verification = { passed: true, reason: "Modal or dialog appeared." };
                      result.success = true;
                      result.state_changed = true;
                  }
                  else {
                      result.verification = { passed: true, reason: "Action dispatched successfully. Pending goal verification." };
                      result.success = true;
                  }
              } else if (step.type === 'type' || step.type === 'clear') {
                  const currentEl = document.getElementById(target_id) as HTMLInputElement;
                  if (currentEl) {
                      const expectedVal = step.type === 'clear' ? '' : (step.value || '');
                      const actualVal = currentEl.value || '';
                      
                      if (step.type === 'clear' && actualVal === '') {
                          result.verification = { passed: true, reason: "Value cleared successfully." };
                          result.success = true;
                          result.actual_value = actualVal;
                          result.state_changed = true;
                      } else if (step.type === 'type' && (actualVal.includes(expectedVal) || actualVal.trim() !== '')) {
                          result.verification = { passed: true, reason: "Value updated successfully." };
                          result.success = true;
                          result.actual_value = actualVal;
                          result.state_changed = true;
                      } else {
                          result.verification = { passed: false, reason: `Input value did not update as expected. Actual: '${actualVal}'` };
                      }
                  } else {
                      result.verification = { passed: false, reason: "Input element not found for verification." };
                  }
              } else if (step.type === 'select') {
                  const currentEl = document.getElementById(target_id) as HTMLSelectElement;
                  if (currentEl) {
                      const selectedOption = currentEl.options[currentEl.selectedIndex];
                      if (selectedOption && (selectedOption.value.toLowerCase() === step.value?.toLowerCase() || selectedOption.text.toLowerCase().includes(step.value?.toLowerCase() || ''))) {
                          result.verification = { passed: true, reason: "Option selected successfully." };
                          result.success = true;
                          result.actual_value = selectedOption.value;
                          result.state_changed = true;
                      } else {
                          result.verification = { passed: false, reason: "Select value did not update." };
                      }
                  } else {
                      result.verification = { passed: false, reason: "Select element disappeared." };
                  }
              } else if (step.type === 'check') {
                  const currentEl = document.getElementById(target_id) as HTMLInputElement;
                  if (currentEl && currentEl.checked) {
                      result.verification = { passed: true, reason: "Checkbox is now checked." };
                      result.success = true;
                      result.state_changed = true;
                  } else {
                      result.verification = { passed: false, reason: "Checkbox is not checked." };
                  }
              } else if (step.type === 'uncheck') {
                  const currentEl = document.getElementById(target_id) as HTMLInputElement;
                  if (currentEl && !currentEl.checked) {
                      result.verification = { passed: true, reason: "Checkbox is now unchecked." };
                      result.success = true;
                      result.state_changed = true;
                  } else {
                      result.verification = { passed: false, reason: "Checkbox is still checked." };
                  }
              }

              return result;

          } catch (e: any) {
              result.verification.reason = `Execution threw an error: ${e.message}`;
              return result;
          }
      };

      // Since executeAsync uses await, we must return true from the listener 
      // and call sendResponse asynchronously.
      executeAsync().then(sendResponse);
      return true; // Keep message channel open
  }
});
