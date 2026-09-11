const { test, expect } = require('@playwright/test');
const path = require('path');

const extensionPath = path.join(__dirname, '../../extension/dist');

test.describe('LocalSight E2E Tests', () => {
  test.setTimeout(120000);
  let browserContext;
  let page;
  let serviceWorker;

  let extensionId;

  test.beforeAll(async () => {
    // Launch Chrome with the extension loaded
    const { chromium } = require('@playwright/test');
    browserContext = await chromium.launchPersistentContext('', {
      headless: false,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
      ],
    });

    // Wait for the extension background to load to get ID
    serviceWorker = browserContext.serviceWorkers()[0];
    if (!serviceWorker) {
        serviceWorker = await browserContext.waitForEvent('serviceworker');
    }
    extensionId = serviceWorker.url().split('/')[2];

    page = await browserContext.newPage();
    await page.goto('http://localhost:5500');
    await page.waitForTimeout(1000);
  });

  test.afterAll(async () => {
    if (browserContext) {
      await browserContext.close();
    }
  });

  async function sendAgentCommand(command) {
      console.log(`\n\n--- SENDING COMMAND: ${command} ---`);
      
      const sidePanelPage = await browserContext.newPage();
      await sidePanelPage.goto(`chrome-extension://${extensionId}/index.html`);
      
      // Wait for chat input
      await sidePanelPage.waitForSelector('textarea', { timeout: 10000 });
      await sidePanelPage.fill('textarea', command);
      await sidePanelPage.press('textarea', 'Enter');

      let finalStatus = 'TIMEOUT';
      
      for (let i = 0; i < 40; i++) {
          await page.waitForTimeout(2000);
          const historyRes = await sidePanelPage.evaluate(async () => {
             return new Promise((resolve) => {
                 chrome.runtime.sendMessage({ action: 'GET_HISTORY' }, resolve);
             });
          });
          const history = historyRes?.history || [];
          if (history.length > 0) {
              const lastMsg = history[history.length - 1];
              if (lastMsg.role === 'assistant') {
                  finalStatus = 'COMPLETED';
                  break;
              }
          }
      }
      
      await sidePanelPage.close();
      await page.bringToFront();
      return { finalStatus };
  }

  test('TEST 1: Open Settings', async () => {
    const { finalStatus } = await sendAgentCommand("Open Settings.");
    expect(finalStatus).toBe('COMPLETED');

    const visible = await page.isVisible('#view-settings');
    expect(visible).toBeTruthy();
  });

  test('TEST 2: Change timezone to Europe/London', async () => {
    const { finalStatus } = await sendAgentCommand("Change my timezone to London.");
    expect(finalStatus).toBe('COMPLETED');
    
    // Ensure we are in settings
    const isSettings = await page.isVisible('#view-settings');
    if (!isSettings) {
         await sendAgentCommand("Open Settings");
    }

    const tzValue = await page.inputValue('#setting-timezone');
    expect(tzValue).toBe('Europe/London');
  });

  test('TEST 3: Change my name from John Doe to Jeedi Joshua', async () => {
    const { finalStatus } = await sendAgentCommand("Change my name from John Doe to Jeedi Joshua.");
    expect(finalStatus).toBe('COMPLETED');

    // Ensure we are in profile
    const isProfile = await page.isVisible('#view-profile');
    if (!isProfile) {
         await sendAgentCommand("Open my Profile");
    }

    const nameValue = await page.inputValue('#profile-name');
    expect(nameValue).toBe('Jeedi Joshua');
  });

});
