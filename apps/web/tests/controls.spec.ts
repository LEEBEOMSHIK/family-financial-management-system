import { test, expect } from '@playwright/test';
import { loginAs } from './accounts';

test('select panel supports keyboard, cancellation and outside dismissal', async ({ page }) => {
  await loginAs(page, 'member');
  await page.getByRole('link', { name: '입출금 내역', exact: true }).click();
  const period = page.getByRole('combobox', { name: '조회 기간' });
  await period.click();
  await expect(page.getByRole('listbox')).toBeVisible();
  await period.press('End');
  await period.press('Escape');
  await expect(period).toContainText('2026년 10월');
  await expect(period).toBeFocused();
  await period.press('ArrowDown');
  await period.press('End');
  await period.press('Enter');
  await expect(period).toContainText('최근 3개월');
  await period.click();
  await page.getByRole('heading', { name: '입출금 내역', exact: true }).click();
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await period.click();
  await period.press('Tab');
  await expect(page.getByRole('listbox')).toHaveCount(0);
});

test('mobile navigation collapses after choosing a destination', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 850 });
  await loginAs(page, 'member');
  const menu = page.getByRole('button', { name: '메뉴' , exact: true });
  await expect(menu).toHaveAttribute('aria-expanded', 'false');
  await menu.click();
  await page.getByRole('link', { name: '입출금 내역' }).click();
  await expect(page).toHaveURL(/transactions$/);
  await expect(menu).toHaveAttribute('aria-expanded', 'false');
});

test('document parent menu toggles with mouse and keyboard on desktop and mobile', async ({ page }) => {
  await loginAs(page, 'treasurer');
  await expect(page).toHaveURL(/dashboard/);
  const toggle = page.getByRole('button', { name: '문서 관리', exact: true });
  const child = page.getByRole('navigation', { name: '문서 관리 메뉴' }).getByRole('link', { name: '가족 문서', exact: true });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(child).toBeHidden();
  await toggle.click();
  await expect(child).toBeVisible();
  await expect(page).toHaveURL(/dashboard/);
  await toggle.press('Space');
  await expect(child).toBeHidden();
  await expect(toggle).toBeFocused();
  await toggle.press('Enter');
  await child.click();
  await expect(page).toHaveURL(/documents\/family$/);
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await toggle.click();
  await expect(child).toBeHidden();
  await page.reload();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await page.setViewportSize({ width: 375, height: 850 });
  const menu = page.getByRole('button', { name: '메뉴', exact: true });
  await menu.click();
  await toggle.click();
  await expect(child).toBeHidden();
  await toggle.click();
  await child.click();
  await expect(menu).toHaveAttribute('aria-expanded', 'false');
});
