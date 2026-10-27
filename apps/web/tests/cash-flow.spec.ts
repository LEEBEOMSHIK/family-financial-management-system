import { expect, test } from '@playwright/test';
import { loginAs } from './accounts';

test.use({ hasTouch: true });

test('flow switches calendar weeks and months without changing other widgets', async ({ page }) => {
  await loginAs(page, 'member');
  await expect(page).toHaveURL(/dashboard/);
  await expect(page.getByTestId('balance')).toBeVisible({ timeout: 15000 });
  const balance = await page.getByTestId('balance').innerText();
  const flow = page.locator('[data-widget="flow"]');
  await expect(flow.getByRole('button', { name: '월 단위', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(flow.locator('.cash-flow-labels > span')).toHaveCount(6);
  const today = await page.evaluate(() => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()));
  await expect(flow).toContainText(`${today} 기준`);
  let summaryReads = 0;
  page.on('request', request => { if (request.url().endsWith('/dashboard')) summaryReads++; });
  const week = flow.getByRole('button', { name: '주 단위', exact: true });
  await week.focus(); await week.press('Enter');
  await expect(week).toHaveAttribute('aria-pressed', 'true');
  await expect(flow.locator('.cash-flow-labels > span')).toHaveCount(8);
  await expect(flow).toContainText('월요일 시작');
  await expect(page.getByTestId('balance')).toHaveText(balance);
  expect(summaryReads).toBe(0);
  await flow.getByText('금액을 표로 확인하기', { exact: true }).click();
  await expect(flow.locator('tbody tr')).toHaveCount(8);
  await flow.getByRole('button', { name: '월 단위', exact: true }).click();
  await expect(flow.locator('.cash-flow-labels > span')).toHaveCount(6);
  await flow.getByText('금액을 표로 확인하기', { exact: true }).click();
  await page.getByRole('button', { name: '자금 흐름 내용에 맞추기', exact: true }).click();
  await page.screenshot({ path: '../../var/cash-flow-month-desktop.png', fullPage: true });
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await week.click();
    await expect(flow.locator('.cash-flow-labels > span')).toHaveCount(8);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.getByRole('button', { name: '자금 흐름 내용에 맞추기', exact: true }).click();
  await page.screenshot({ path: '../../var/cash-flow-week-mobile.png', fullPage: true });
});

test('flow errors do not replace the balance and retry preserves the chosen unit', async ({ page }) => {
  await loginAs(page, 'member');
  await expect(page).toHaveURL(/dashboard/);
  await expect(page.getByTestId('balance')).toBeVisible({ timeout: 15000 });
  const balance = await page.getByTestId('balance').innerText();
  const flow = page.locator('[data-widget="flow"]');
  await expect(flow.locator('.cash-flow-labels > span')).toHaveCount(6);
  await page.route('**/dashboard/flow?unit=week', route => route.fulfill({ status: 503, json: { error: { message: '자금 흐름 확인 실패' } } }));
  await flow.getByRole('button', { name: '주 단위', exact: true }).click();
  await expect(flow).toContainText('자금 흐름 확인 실패');
  await expect(page.getByTestId('balance')).toHaveText(balance);
  await page.unroute('**/dashboard/flow?unit=week');
  await flow.getByRole('button', { name: '다시 시도' }).click();
  await expect(flow.locator('.cash-flow-labels > span')).toHaveCount(8);
  await expect(flow.getByRole('button', { name: '주 단위', exact: true })).toHaveAttribute('aria-pressed', 'true');
});


test('chart exposes exact amounts on hover, keyboard and mobile tap', async ({ page }) => {
  const rows = [
    { label: '2026-08', start_on: '2026-08-01', end_on: '2026-08-31', income_krw: '9007199254740993', expense_krw: '1200', balance_krw: '-2300', balance_as_of: null, coverage: 'complete', in_progress: false },
    { label: '2026-09', start_on: '2026-09-01', end_on: '2026-09-30', income_krw: null, expense_krw: null, balance_krw: null, balance_as_of: null, coverage: 'none', in_progress: false },
    { label: '2026-10', start_on: '2026-10-01', end_on: '2026-10-26', income_krw: '0', expense_krw: '0', balance_krw: '0', balance_as_of: null, coverage: 'partial', in_progress: true },
  ];
  await page.route('**/dashboard/flow?unit=*', route => route.fulfill({ json: { unit: 'month', today: '2026-10-26', data_mode: 'synthetic', data_through: '2026-10-26', items: rows } }));
  await loginAs(page, 'member');
  await expect(page).toHaveURL(/dashboard/, { timeout: 15000 });
  const flow = page.locator('[data-widget="flow"]');
  const targets = flow.locator('.cash-flow-targets button');
  await expect(targets).toHaveCount(3);
  await expect(flow.locator('.cash-flow-axis')).toContainText('−2,300');
  await targets.nth(0).hover();
  const tooltip = flow.getByRole('tooltip');
  await expect(tooltip).toContainText('9,007,199,254,740,993원');
  await expect(tooltip).toContainText('1,200원');
  await expect(tooltip).toContainText('−2,300');
  await targets.nth(0).focus();
  await page.keyboard.press('Escape');
  await expect(tooltip).toHaveCount(0);
  await page.keyboard.press('Tab');
  await expect(tooltip).toContainText('자료 없음');
  await expect(tooltip).not.toContainText('0원');
  await page.setViewportSize({ width: 320, height: 900 });
  await page.keyboard.press('Escape');
  await targets.nth(2).tap();
  await expect(tooltip).toContainText('일부 자료');
  await expect(tooltip.locator('.fl-money')).toHaveText(['0원', '0원', '0원']);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '../../var/cash-flow-tooltip-mobile.png', fullPage: true });
});
