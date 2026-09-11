const { chromium } = require('@playwright/test');
const path = require('path');

(async () => {
  const extensionPath = path.join(__dirname, '../extension/dist');

  console.log(`Loading extension from: ${extensionPath}`);

  const browser = await chromium.launchPersistentContext('', {
    headless: false, // Chrome extensions only work in headful mode
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
    ],
  });

  const page = await browser.newPage();
  console.log("Navigating to demo site...");
  await page.goto('http://localhost:5500');

  // Let the extension initialize
  await page.waitForTimeout(2000);

  // We can evaluate in the page context to send a message to the extension
  // or we can find the background page and interact with it.
  let backgroundPage = browser.backgroundPages()[0];
  if (!backgroundPage) {
    // try service workers
    let serviceWorker = browser.serviceWorkers()[0];
    if (serviceWorker) {
      console.log("Service worker found.");
      // Send a message directly to the background service worker using chrome.runtime
      const result = await serviceWorker.evaluate(async () => {
         return new Promise((resolve, reject) => {
             chrome.runtime.sendMessage({ action: 'SEND_MESSAGE', text: 'Change my name from John Doe to Jeedi Joshua' }, (res) => {
                 resolve(res);
             });
         });
      });
      console.log("SEND_MESSAGE result:", result);
      
      // Wait and observe history
      for (let i = 0; i < 30; i++) {
          await new Promise(r => setTimeout(r, 2000));
          const historyRes = await serviceWorker.evaluate(async () => {
             return new Promise((resolve) => {
                 chrome.runtime.sendMessage({ action: 'GET_HISTORY' }, resolve);
             });
          });
          const history = historyRes?.history;
          if (history && history.length > 0) {
              const lastMsg = history[history.length - 1];
              if (lastMsg.role === 'assistant') {
                  console.log("Final Assistant Response:", lastMsg.content);
                  break;
              }
              const traces = history.filter(h => h.role === 'trace');
              if (traces.length > 0) {
                  console.log("Latest trace:", traces[traces.length - 1].traces);
              }
          }
      }
    } else {
      console.log("No background service worker found.");
    }
  }

  // verify the name actually changed on the page
  const nameInput = await page.$('#full-name');
  if (nameInput) {
      const name = await nameInput.inputValue();
      console.log(`Current name on profile: ${name}`);
  }

  await browser.close();
})();
