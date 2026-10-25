import { test, expect } from '@playwright/test';
import { loginAs } from './accounts';

test('select panel supports keyboard, cancellation and outside dismissal', async ({ page }) => {
  await loginAs(page, 'member');
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
  await expect(page.getByTestId('income')).toHaveText('1,600,000원');
  await period.click();
  await page.getByRole('heading', { name: '우리 가족의 돈, 한눈에' }).click();
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
