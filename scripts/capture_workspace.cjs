const { chromium } = require('../apps/web/node_modules/@playwright/test');
const fs = require('node:fs');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1080 } });
  fs.mkdirSync('var/ui-refinement', { recursive: true });
  await page.goto('http://127.0.0.1:3000/login');
  await page.screenshot({ path: 'var/ui-refinement/login.png', fullPage: true });
  await page.getByRole('button', { name: '총괄관리자로 테스트' }).click();
  await page.getByTestId('balance').waitFor();
  await page.screenshot({ path: 'var/ui-refinement/dashboard.png', fullPage: true });
  for (const theme of ['light', 'dark']) {
    await page.evaluate(theme => { document.documentElement.dataset.theme = theme; }, theme);
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.screenshot({ path: `var/ui-refinement/dashboard-${theme}-${width}.png`, fullPage: true });
      if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw Error(`Overflow: ${theme} ${width}`);
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(() => { document.documentElement.dataset.theme = 'light'; });
  await page.getByRole('combobox', { name: '조회 기간' }).click();
  await page.screenshot({ path: 'var/ui-refinement/select.png', fullPage: true });
  await page.keyboard.press('Escape');
  await page.goto('http://127.0.0.1:3000/roles');
  await page.getByRole('table', { name: '구성원 권한', exact: true }).waitFor();
  await page.screenshot({ path: 'var/ui-refinement/roles.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 900 });
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw Error('Roles page overflow');
  await page.screenshot({ path: 'var/ui-refinement/roles-mobile.png', fullPage: true });
  const accountsLoaded = page.waitForResponse(response => response.url().endsWith('/bank-accounts') && response.request().method() === 'GET');
  await page.goto('http://127.0.0.1:3000/accounts');
  if ((await accountsLoaded).status() !== 200) throw Error('Accounts request failed');
  await page.getByRole('heading', { name: '내 계좌', exact: true }).waitFor();
  await page.getByRole('button', { name: '계좌 등록', exact: true }).click();
  await page.screenshot({ path: 'var/ui-refinement/accounts-mobile.png', fullPage: true });
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw Error('Accounts page overflow');
  const expensesLoaded = page.waitForResponse(response => response.url().endsWith('/expenses') && response.request().method() === 'GET');
  await page.goto('http://127.0.0.1:3000/expenses');
  if ((await expensesLoaded).status() !== 200) throw Error('Expenses request failed');
  await page.getByRole('button', { name: '새 출금 요청', exact: true }).click();
  await page.waitForFunction(() => !Array.from(document.querySelectorAll('[role="status"]')).some(element => element.textContent.includes('자료를 불러오고 있습니다.')));
  await page.screenshot({ path: 'var/ui-refinement/expenses-form-mobile.png', fullPage: true });
  await browser.close();
  console.log('Desktop/mobile light/dark captures complete; no page overflow.');
})().catch(error => { console.error(error.message); process.exitCode = 1; });
