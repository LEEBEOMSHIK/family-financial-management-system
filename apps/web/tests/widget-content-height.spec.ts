import { test, expect } from '@playwright/test';
import { loginAs } from './accounts';

test('widgets can grow beyond legacy heights to fit content and retain precise heights', async ({ page }) => {
  test.setTimeout(90000);
  await loginAs(page, 'treasurer');
  await page.setViewportSize({ width: 390, height: 900 });
  const recent = page.locator('[data-widget="recent"]');
  await expect(recent).toBeVisible({ timeout: 15000 });
  const session = await (await page.request.get('/api/v1/session')).json();
  const path = `/api/v1/families/${session.family_id}/dashboard-layout`;
  const fit = page.getByRole('button', { name: '최근 입출금 내용에 맞추기', exact: true });
  const post = () => page.waitForResponse(r => r.url().endsWith('/dashboard-layout') && r.request().method() === 'POST');
  const noScroll = async (id: string) => {
    await expect.poll(() => page.locator(`[data-widget="${id}"] .widget-content`).evaluate(el => el.scrollHeight - el.clientHeight)).toBeLessThanOrEqual(1);
  };
  let saved = post(); await fit.click(); expect((await saved).status()).toBe(200);
  await noScroll('recent');
  expect((await recent.boundingBox())!.height).toBeGreaterThan(516);
  const layout = await (await page.request.get(path)).json();
  const height = layout.mobile.find((item: { id: string }) => item.id === 'recent').height_px;
  expect(height).toBeGreaterThan(516);
  await page.reload(); await expect(recent).toBeVisible({ timeout: 15000 });
  await noScroll('recent');
  expect(Math.round((await recent.boundingBox())!.height)).toBe(height);
  const resize = page.getByRole('button', { name: '최근 입출금 크기 조절', exact: true });
  // A drag can restore the full-content height beyond the former mobile cap.
  saved = post(); await resize.press('ArrowUp'); expect((await saved).status()).toBe(200);
  await expect(resize).toBeEnabled();
  await resize.scrollIntoViewIfNeeded();
  const corner = await resize.boundingBox(); if (!corner) throw new Error('Missing resize handle');
  saved = post();
  await page.mouse.move(corner.x + 8, corner.y + 8); await page.mouse.down();
  await page.mouse.move(corner.x + 8, corner.y + 88, { steps: 5 }); await page.mouse.up();
  expect((await saved).status()).toBe(200); await noScroll('recent');
  expect(Math.round((await recent.boundingBox())!.height)).toBe(height);
  // Width changes alter wrapping; measure again at the new width.
  saved = post(); await resize.press('ArrowLeft'); expect((await saved).status()).toBe(200);
  await expect(resize).toBeEnabled();
  saved = post(); await fit.click(); expect((await saved).status()).toBe(200);
  await noScroll('recent');
  expect(Math.round((await recent.boundingBox())!.height)).toBeGreaterThanOrEqual(height);
  // Every visible widget can reveal its current contents, including expanded details.
  await page.locator('[data-widget="flow"] summary').click();
  for (const id of ['tasks', 'balance', 'summary', 'flow', 'categories']) {
    const card = page.locator(`[data-widget="${id}"]`);
    saved = post(); await card.locator('.widget-fit').click(); expect((await saved).status()).toBe(200);
    await noScroll(id);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '../../var/expense-demo/widget-content-fit.png', fullPage: true });
});
