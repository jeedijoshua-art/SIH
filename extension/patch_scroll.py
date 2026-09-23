with open("src/content/content.ts", "r") as f:
    content = f.read()

original_scroll = """          if (step.type === 'scroll') {
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
          }"""

new_scroll = """          if (step.type === 'scroll') {
              // Find the best scrollable container (SPA support like Gmail)
              const getScrollableContainer = () => {
                  // Try to find the largest scrollable div in the viewport
                  const elements = Array.from(document.querySelectorAll('*'));
                  let maxArea = 0;
                  let bestEl = document.documentElement;
                  
                  for (const el of elements) {
                      if (el === document.documentElement || el === document.body) continue;
                      const style = window.getComputedStyle(el);
                      if (style.overflowY === 'auto' || style.overflowY === 'scroll') {
                          const rect = el.getBoundingClientRect();
                          const area = rect.width * rect.height;
                          // Ensure it has actual scrollable content
                          if (el.scrollHeight > el.clientHeight && area > maxArea) {
                              maxArea = area;
                              bestEl = el as HTMLElement;
                          }
                      }
                  }
                  
                  // Fallback to window/document if no specific scroll container is found
                  if (bestEl === document.documentElement && document.documentElement.scrollHeight <= document.documentElement.clientHeight) {
                      if (document.body.scrollHeight > document.body.clientHeight) {
                          bestEl = document.body;
                      }
                  }
                  return bestEl;
              };

              const container = getScrollableContainer();
              const isWindow = container === document.documentElement || container === document.body;
              
              const startScrollTop = isWindow ? window.scrollY : container.scrollTop;

              if (step.value === 'down') {
                  if (isWindow) window.scrollBy({ top: window.innerHeight * 0.8, behavior: 'smooth' });
                  else container.scrollBy({ top: container.clientHeight * 0.8, behavior: 'smooth' });
              }
              else if (step.value === 'up') {
                  if (isWindow) window.scrollBy({ top: -window.innerHeight * 0.8, behavior: 'smooth' });
                  else container.scrollBy({ top: -container.clientHeight * 0.8, behavior: 'smooth' });
              }
              else if (step.value === 'top') {
                  if (isWindow) window.scrollTo({ top: 0, behavior: 'smooth' });
                  else container.scrollTo({ top: 0, behavior: 'smooth' });
              }
              else if (step.value === 'bottom') {
                  if (isWindow) window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
                  else container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
              }
              
              result.executed = true;
              let verified = false;
              
              // Wait up to 1.5s to verify the scroll actually occurred
              for (let i = 0; i < 15; i++) {
                  await new Promise(r => setTimeout(r, 100));
                  const currentScrollTop = isWindow ? window.scrollY : container.scrollTop;
                  if (Math.abs(currentScrollTop - startScrollTop) > 10) {
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
                  result.verification = { passed: true, reason: `Scrolled ${step.value} and verified view changed.` };
              } else {
                  result.success = false;
                  result.verification = { passed: false, reason: `Attempted to scroll ${step.value} but no scroll/DOM change occurred.` };
              }
              
              result.after_url = window.location.href;
              result.state_fingerprint_after = hashDOM(analyzeDOM());
              return result;
          }"""

content = content.replace(original_scroll, new_scroll)

with open("src/content/content.ts", "w") as f:
    f.write(content)
