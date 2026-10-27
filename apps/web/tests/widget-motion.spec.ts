import { test, expect } from '@playwright/test';
import { loginAs } from './accounts';

test('drag preview follows the pointer, neighbours animate and resize is continuous', async ({ page }) => {
  test.setTimeout(90000);
  await loginAs(page, 'member');
  await expect(page.locator('[data-widget="balance"]')).toBeVisible({ timeout: 15000 });
  // Set an explicit test fixture through the authorized API; no product management UI is needed.
  const session = await (await page.request.get('/api/v1/session')).json();
  const path = `/api/v1/families/${session.family_id}/dashboard-layout`;
  const layout = await (await page.request.get(path)).json();
  const defaults = layout.allowed_widgets.map((id: string) => ({ id, visible: true, width: ['balance', 'summary', 'categories'].includes(id) ? 'half' : 'full', height: ['balance', 'summary'].includes(id) ? 'compact' : 'regular' }));
  expect((await page.request.post(path, { headers: { Origin: process.env.E2E_BASE_URL!, 'X-CSRF-Token': session.csrf_token }, data: { desktop: defaults, mobile: defaults, revision: layout.revision } })).status()).toBe(200);
  await page.reload();
  const card = page.locator('[data-widget="balance"]');
  const handle = page.getByRole('button', { name: '장부 잔액 이동 손잡이' });
  await expect(handle).toBeVisible({ timeout: 15000 });
  await handle.scrollIntoViewIfNeeded();
  const start = await card.boundingBox(); const grip = await handle.boundingBox();
  if (!start || !grip) throw new Error('Missing widget');
  await page.mouse.move(grip.x + 20, grip.y + 15); await page.mouse.down();
  const preview = page.locator('.widget-motion-preview');
  await expect(preview).toBeVisible();
  expect(await preview.evaluate(el => Number(getComputedStyle(el).opacity))).toBeLessThan(1);
  await page.mouse.move(grip.x + 57, grip.y + 42);
  await expect.poll(async () => Math.round((await preview.boundingBox())!.x - start.x)).toBe(37);
  await expect.poll(async () => Math.round((await preview.boundingBox())!.y - start.y)).toBe(27);
  // Record actual running Web Animations as neighbours change slots.
  await page.evaluate(() => {
    const state = window as typeof window & { sawWidgetAnimation: boolean; animationProbe?: number };
    state.sawWidgetAnimation = false;
    const probe = () => { state.sawWidgetAnimation ||= [...document.querySelectorAll('.widget-grid > .dashboard-widget')].some(el => el.getAnimations().length > 0); state.animationProbe = requestAnimationFrame(probe); };
    probe();
  });
  const neighbour = await page.locator('[data-widget="summary"]').boundingBox();
  if (!neighbour) throw new Error('Missing neighbour');
  await page.mouse.move(neighbour.x + neighbour.width / 2, neighbour.y + 60, { steps: 5 });
  await expect.poll(() => page.evaluate(() => (window as typeof window & { sawWidgetAnimation: boolean }).sawWidgetAnimation)).toBe(true);
  await page.screenshot({ path: '../../var/expense-demo/widget-motion-drag.png' });
  await page.keyboard.press('Escape'); await page.mouse.up();
  await expect(preview).toHaveCount(0);
  const resize = page.getByRole('button', { name: '장부 잔액 크기 조절' });
  await resize.scrollIntoViewIfNeeded();
  const sizeStart = await card.boundingBox(); const corner = await resize.boundingBox();
  if (!sizeStart || !corner) throw new Error('Missing resize');
  await page.mouse.move(corner.x + 8, corner.y + 8); await page.mouse.down();
  await page.mouse.move(corner.x + 31, corner.y - 23);
  await expect.poll(async () => Math.round((await preview.boundingBox())!.width - sizeStart.width)).toBe(23);
  await expect.poll(async () => Math.round((await preview.boundingBox())!.height - sizeStart.height)).toBe(-31);
  await page.keyboard.press('Escape'); await page.mouse.up();
  await expect(preview).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await handle.scrollIntoViewIfNeeded();
  const reducedGrip = await handle.boundingBox(); if (!reducedGrip) throw new Error('Missing reduced-motion handle');
  await page.mouse.move(reducedGrip.x + 8, reducedGrip.y + 8); await page.mouse.down();
  await expect(preview).toBeVisible(); await page.keyboard.press('Escape'); await page.mouse.up();
  await expect(preview).toHaveCount(0);
});
