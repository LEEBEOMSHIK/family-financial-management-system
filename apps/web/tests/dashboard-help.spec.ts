import { test, expect } from '@playwright/test';
import { loginAs } from './accounts';

test('dashboard help replaces management and previously hidden allowed widgets remain available', async ({ page }) => {
  await loginAs(page, 'member');
  const help = page.getByRole('button', { name: '대시보드 보는 법과 사용법', exact: true });
  await expect(help).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('위젯 관리', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /숨기기$/ })).toHaveCount(0);
  const panel = page.getByRole('region', { name: '대시보드 안내', exact: true });
  await expect(panel).toHaveCount(0);
  await help.focus(); await help.press('Enter');
  await expect(panel).toContainText('자동 저장');
  await expect(panel).toContainText('PC와 모바일');
  await expect(help).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Escape'); await expect(panel).toHaveCount(0); await expect(help).toBeFocused();
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await help.click(); await expect(panel).toBeVisible();
    const rect = await panel.boundingBox(); if (!rect) throw new Error('Missing help panel');
    expect(rect.x).toBeGreaterThanOrEqual(0); expect(rect.x + rect.width).toBeLessThanOrEqual(width);
    await page.getByRole('heading', { name: '우리 가족의 돈, 한눈에' }).click(); await expect(panel).toHaveCount(0);
  }
  const gridTop = () => page.locator('.widget-grid').evaluate(el => el.getBoundingClientRect().top + window.scrollY);
  const beforeSave = await gridTop();
  const saved = page.waitForResponse(r => r.url().endsWith('/dashboard-layout') && r.request().method() === 'POST');
  await page.getByRole('button', { name: '장부 잔액 크기 조절', exact: true }).press('ArrowUp');
  expect((await saved).status()).toBe(200);
  await expect(page.getByRole('status')).toContainText('자동 저장');
  expect(await gridTop()).toBe(beforeSave);
  const session = await (await page.request.get('/api/v1/session')).json();
  const path = `/api/v1/families/${session.family_id}/dashboard-layout`;
  const current = await (await page.request.get(path)).json();
  expect((await page.request.post(path, { headers: { Origin: process.env.E2E_BASE_URL!, 'X-CSRF-Token': session.csrf_token }, data: { desktop: current.desktop, mobile: current.mobile.map((item: object) => ({ ...item, visible: false })), revision: current.revision } })).status()).toBe(200);
  await page.reload();
  await expect(page.locator('.widget-grid > [data-widget]')).toHaveCount(current.allowed_widgets.length);
  await help.click();
  await page.screenshot({ path: '../../var/expense-demo/dashboard-help-mobile.png', fullPage: true });
});
