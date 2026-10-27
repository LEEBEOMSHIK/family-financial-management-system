import { test, expect } from '@playwright/test';
import { loginAs } from './accounts';

test('dashboard shows current summary and small contextual resize handles', async ({ page, browser }) => {
  await loginAs(page, 'member');
  const card = page.locator('[data-widget="balance"]');
  const handle = page.getByRole('button', { name: '장부 잔액 크기 조절', exact: true });
  await expect(card).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole('combobox', { name: '조회 기간' })).toHaveCount(0);
  await page.mouse.move(0, 0);
  await expect(handle).toHaveCSS('opacity', '0');
  expect((await handle.boundingBox())!.width).toBeLessThanOrEqual(24);
  await card.hover(); await expect(handle).toHaveCSS('opacity', '1');
  await page.mouse.move(0, 0); await handle.focus(); await expect(handle).toHaveCSS('opacity', '1');
  await page.getByRole('link', { name: '상세 입출금 보기', exact: true }).click();
  await expect(page.getByRole('combobox', { name: '조회 기간' })).toBeVisible();
  const context = await browser.newContext({ baseURL: process.env.E2E_BASE_URL, viewport: { width: 390, height: 900 }, isMobile: true, hasTouch: true });
  try {
    const mobile = await context.newPage(); await loginAs(mobile, 'member');
    const touchHandle = mobile.getByRole('button', { name: '장부 잔액 크기 조절', exact: true });
    await expect(touchHandle).toHaveCSS('opacity', '1', { timeout: 15000 });
    expect((await touchHandle.boundingBox())!.width).toBeGreaterThanOrEqual(36);
  } finally { await context.close(); }
});
