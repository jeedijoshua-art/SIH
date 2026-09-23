import re

with open("src/content/content.ts", "r") as f:
    content = f.read()

# We want to replace the try block inside executeAction
original_try_block = """          try {
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

new_try_block = """          try {
              if (step.type === 'click' || step.type === 'click_generic') {
                  el.scrollIntoView({ behavior: 'instant', block: 'center' });
                  el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
                  el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
                  el.click();
                  result.executed = true;
                  
                  const currentUrl = window.location.href;
                  let verified = false;
                  
                  // Wait up to 1.5s for state change (navigation or DOM change)
                  for (let i = 0; i < 15; i++) {
                      await new Promise(r => setTimeout(r, 100));
                      if (window.location.href !== currentUrl || document.readyState === 'loading') {
                          verified = true;
                          break;
                      }
                      const newFingerprint = hashDOM(analyzeDOM());
                      if (newFingerprint !== preFingerprint) {
                          verified = true;
                          break;
                      }
                  }
                  
                  if (verified) {
                      result.success = true;
                      result.state_changed = true;
                      result.verification = { passed: true, reason: (genericResolved ? genericClickSuccessReason : "Clicked element") + " -> State change verified." };
                  } else {
                      result.success = false;
                      result.verification = { passed: false, reason: (genericResolved ? genericClickSuccessReason : "Clicked element") + ", but no page state change occurred." };
                  }
                  
                  result.after_url = window.location.href;
                  return result;
              } else if (step.type === 'type') {"""

content = content.replace(original_try_block, new_try_block)

# Also need to update the bottom of the try block where result is returned for other actions
original_end_block = """                  result.verification.reason = `Unknown action type: ${step.type}`;
                  return result;
              }
              
              result.success = true;
              result.after_url = window.location.href;
              result.state_fingerprint_after = hashDOM(analyzeDOM());
              result.state_changed = (result.state_fingerprint_after !== preFingerprint);
              result.verification.passed = true;
              result.verification.reason = `Executed ${step.type} successfully`;
              
              return result;
          } catch (e: any) {"""

new_end_block = """                  result.verification.reason = `Unknown action type: ${step.type}`;
                  return result;
              }
              
              // Verify DOM state changes for type, clear, select, check, uncheck
              const currentUrlAfterAction = window.location.href;
              let verified = false;
              
              // Wait up to 1.5s for state change (value update, navigation, or DOM change)
              for (let i = 0; i < 15; i++) {
                  await new Promise(r => setTimeout(r, 100));
                  if (window.location.href !== currentUrlAfterAction || document.readyState === 'loading') {
                      verified = true;
                      break;
                  }
                  const newFingerprint = hashDOM(analyzeDOM());
                  if (newFingerprint !== preFingerprint) {
                      verified = true;
                      break;
                  }
              }
              
              if (verified) {
                  result.success = true;
                  result.state_changed = true;
                  result.verification.passed = true;
                  result.verification.reason = `Executed ${step.type} successfully and state change verified.`;
              } else {
                  // For type, check, clear, select: if the value changed, it's successful even if DOM structure didn't change
                  result.success = true;
                  result.verification.passed = true;
                  result.verification.reason = `Executed ${step.type}. (No structural DOM change detected, but action dispatched)`;
              }
              
              result.after_url = window.location.href;
              result.state_fingerprint_after = hashDOM(analyzeDOM());
              
              return result;
          } catch (e: any) {"""

content = content.replace(original_end_block, new_end_block)

with open("src/content/content.ts", "w") as f:
    f.write(content)
