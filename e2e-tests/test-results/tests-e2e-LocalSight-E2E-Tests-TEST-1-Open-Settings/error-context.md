# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: tests/e2e.spec.js >> LocalSight E2E Tests >> TEST 1: Open Settings
- Location: tests/e2e.spec.js:78:3

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: "COMPLETED"
Received: "TIMEOUT"
```

# Test source

```ts
  1   | const { test, expect } = require('@playwright/test');
  2   | const path = require('path');
  3   | 
  4   | const extensionPath = path.join(__dirname, '../../extension/dist');
  5   | 
  6   | test.describe('LocalSight E2E Tests', () => {
  7   |   test.setTimeout(120000);
  8   |   let browserContext;
  9   |   let page;
  10  |   let serviceWorker;
  11  | 
  12  |   let extensionId;
  13  | 
  14  |   test.beforeAll(async () => {
  15  |     // Launch Chrome with the extension loaded
  16  |     const { chromium } = require('@playwright/test');
  17  |     browserContext = await chromium.launchPersistentContext('', {
  18  |       headless: false,
  19  |       args: [
  20  |         `--disable-extensions-except=${extensionPath}`,
  21  |         `--load-extension=${extensionPath}`,
  22  |       ],
  23  |     });
  24  | 
  25  |     // Wait for the extension background to load to get ID
  26  |     serviceWorker = browserContext.serviceWorkers()[0];
  27  |     if (!serviceWorker) {
  28  |         serviceWorker = await browserContext.waitForEvent('serviceworker');
  29  |     }
  30  |     extensionId = serviceWorker.url().split('/')[2];
  31  | 
  32  |     page = await browserContext.newPage();
  33  |     await page.goto('http://localhost:5500');
  34  |     await page.waitForTimeout(1000);
  35  |   });
  36  | 
  37  |   test.afterAll(async () => {
  38  |     if (browserContext) {
  39  |       await browserContext.close();
  40  |     }
  41  |   });
  42  | 
  43  |   async function sendAgentCommand(command) {
  44  |       console.log(`\n\n--- SENDING COMMAND: ${command} ---`);
  45  |       
  46  |       const sidePanelPage = await browserContext.newPage();
  47  |       await sidePanelPage.goto(`chrome-extension://${extensionId}/index.html`);
  48  |       
  49  |       // Wait for chat input
  50  |       await sidePanelPage.waitForSelector('textarea', { timeout: 10000 });
  51  |       await sidePanelPage.fill('textarea', command);
  52  |       await sidePanelPage.press('textarea', 'Enter');
  53  | 
  54  |       let finalStatus = 'TIMEOUT';
  55  |       
  56  |       for (let i = 0; i < 40; i++) {
  57  |           await page.waitForTimeout(2000);
  58  |           const historyRes = await sidePanelPage.evaluate(async () => {
  59  |              return new Promise((resolve) => {
  60  |                  chrome.runtime.sendMessage({ action: 'GET_HISTORY' }, resolve);
  61  |              });
  62  |           });
  63  |           const history = historyRes?.history || [];
  64  |           if (history.length > 0) {
  65  |               const lastMsg = history[history.length - 1];
  66  |               if (lastMsg.role === 'assistant') {
  67  |                   finalStatus = 'COMPLETED';
  68  |                   break;
  69  |               }
  70  |           }
  71  |       }
  72  |       
  73  |       await sidePanelPage.close();
  74  |       await page.bringToFront();
  75  |       return { finalStatus };
  76  |   }
  77  | 
  78  |   test('TEST 1: Open Settings', async () => {
  79  |     const { finalStatus } = await sendAgentCommand("Open Settings.");
> 80  |     expect(finalStatus).toBe('COMPLETED');
      |                         ^ Error: expect(received).toBe(expected) // Object.is equality
  81  | 
  82  |     const visible = await page.isVisible('#view-settings');
  83  |     expect(visible).toBeTruthy();
  84  |   });
  85  | 
  86  |   test('TEST 2: Change timezone to Europe/London', async () => {
  87  |     const { finalStatus } = await sendAgentCommand("Change my timezone to London.");
  88  |     expect(finalStatus).toBe('COMPLETED');
  89  |     
  90  |     // Ensure we are in settings
  91  |     const isSettings = await page.isVisible('#view-settings');
  92  |     if (!isSettings) {
  93  |          await sendAgentCommand("Open Settings");
  94  |     }
  95  | 
  96  |     const tzValue = await page.inputValue('#setting-timezone');
  97  |     expect(tzValue).toBe('Europe/London');
  98  |   });
  99  | 
  100 |   test('TEST 3: Change my name from John Doe to Jeedi Joshua', async () => {
  101 |     const { finalStatus } = await sendAgentCommand("Change my name from John Doe to Jeedi Joshua.");
  102 |     expect(finalStatus).toBe('COMPLETED');
  103 | 
  104 |     // Ensure we are in profile
  105 |     const isProfile = await page.isVisible('#view-profile');
  106 |     if (!isProfile) {
  107 |          await sendAgentCommand("Open my Profile");
  108 |     }
  109 | 
  110 |     const nameValue = await page.inputValue('#profile-name');
  111 |     expect(nameValue).toBe('Jeedi Joshua');
  112 |   });
  113 | 
  114 | });
  115 | 
```