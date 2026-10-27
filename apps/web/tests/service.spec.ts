import { test, expect, type Page } from '@playwright/test';
import { loginAs } from './accounts';

async function select(page: Page, label: string, option: string) {
  await page.getByRole('combobox', { name: label }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}

test('member signs in, filters real API transactions and cannot access management', async ({ page, request }) => {
  expect((await request.get('/api/v1/session')).status()).toBe(401);
  await loginAs(page, 'member');
  await expect(page.getByRole('heading', { name: '우리 가족의 돈, 한눈에' })).toBeVisible();
  await expect(page.getByTestId('balance')).toHaveText('2,450,000원');
  await expect(page.getByRole('combobox', { name: '조회 기간' })).toHaveCount(0);
  await expect(page.getByTestId('income')).toHaveText('500,000원');
  await page.getByRole('link', { name: '입출금 내역' }).click();
  await select(page, '입출금 구분', '출금');
  await expect(page.getByTestId('transaction-row')).toHaveCount(2);
  await expect(page.getByText('대사 필요', { exact: true })).toHaveCount(0);
  await expect(page.getByText('송금 기록됨 · 대사 필요', { exact: true })).toHaveCount(0);
  await page.goto('/management');
  await expect(page.getByRole('heading', { name: '접근 권한이 없습니다' })).toBeVisible();
  const denied = await page.request.get('/api/v1/families/00000000-0000-4000-8000-000000000001/management');
  expect(denied.status()).toBe(403);
  await page.getByRole('button', { name: '로그아웃' }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect((await page.request.get('/api/v1/session')).status()).toBe(401);
});

test('expired session returns to login instead of an endless retry', async ({ page }) => {
  await loginAs(page, 'member');
  await expect(page).toHaveURL(/dashboard/);
  await expect(page.getByTestId('balance')).toBeVisible({ timeout: 15000 });
  await page.route('**/api/v1/families/*/dashboard*', route => route.fulfill({
    status: 401, contentType: 'application/json', body: JSON.stringify({error:{code:'AUTH_REQUIRED',message:'다시 로그인해 주세요.'}}),
  }));
  await page.reload();
  await expect(page).toHaveURL(/\/login$/);
});

test('treasurer uses management and themes persist on mobile', async ({ page }) => {
  await loginAs(page, 'treasurer');
  await page.getByRole('link', { name: '관리할 일' }).click();
  await expect(page.getByRole('heading', { name: '관리할 일', exact: true })).toBeVisible();
  await select(page, '화면 모드', '다크');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('link', { name: '대시보드', exact: true }).click();
  for (const width of [1440, 375, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const theme of ['light', 'dark']) {
      await select(page, '화면 모드', theme === 'light' ? '라이트' : '다크');
      await expect(page.getByTestId('balance')).toHaveText('2,450,000원');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      await page.screenshot({ path: `../../var/service-e2e/service-${width}-${theme}.png`, fullPage: true });
      await page.getByRole('combobox', { name: '화면 모드' }).click();
      const panel = page.getByRole('listbox');
      const bounds = await panel.boundingBox();
      expect(bounds).not.toBeNull();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
      await expect(panel).toBeVisible();
      await page.screenshot({ path: `../../var/service-e2e/options-${width}-${theme}.png` });
      await page.getByRole('combobox', { name: '화면 모드' }).press('Escape');
    }
  }
});

test('API outage shows an error without substituting zero or synthetic client totals', async ({ page }) => {
  await loginAs(page, 'member');
  await expect(page).toHaveURL(/dashboard/);
  await expect(page.getByTestId('balance')).toBeVisible({ timeout: 15000 });
  await page.route('**/api/v1/families/*/dashboard*', route => route.fulfill({
    status: 503, contentType: 'application/json', body: JSON.stringify({error:{code:'UNAVAILABLE',message:'자료를 불러오지 못했습니다.'}}),
  }));
  await page.reload();
  await expect(page.getByRole('alert').filter({ hasText: '자료를 불러오지 못했습니다' })).toBeVisible();
  await expect(page.getByTestId('balance')).toHaveCount(0);
  await page.unrouteAll();
  await page.getByRole('button', { name: '다시 시도' }).click();
  await expect(page.getByTestId('balance')).toHaveText('2,450,000원');
});
