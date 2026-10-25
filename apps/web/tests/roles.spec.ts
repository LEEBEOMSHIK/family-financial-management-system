import { test, expect } from '@playwright/test';
import { loginAs } from './accounts';

test('super admin changes a role, restores it, and sees preserved audit history', async ({ page }) => {
  await loginAs(page, 'super_admin');
  await page.getByRole('link', { name: '권한 관리', exact: true }).click();
  await expect(page.getByRole('heading', { name: '권한 관리', exact: true })).toBeVisible();
  for (const role of ['총무', '일반사용자']) {
    const row = page.getByRole('table', { name: '구성원 권한' }).getByRole('row').filter({ hasText: '테스트 구성원' });
    if ((await row.getByRole('cell').first().textContent()) === role) continue;
    await row.getByRole('button').click();
    await page.getByRole('combobox', { name: '변경할 역할' }).click();
    await page.getByRole('option', { name: role, exact: true }).click();
    await page.getByLabel('변경 사유').fill(`브라우저 검증: ${role}`);
    await page.getByRole('button', { name: '변경 내용 확인' }).click();
    await page.getByRole('button', { name: '변경 확정' }).click();
    await expect(page.getByRole('status').filter({ hasText: '권한을 변경하고 이력을 저장했습니다.' })).toBeVisible();
    await expect(page.getByRole('table', { name: '구성원 권한' }).getByRole('row').filter({ hasText: '테스트 구성원' })).toContainText(role);
  }
  await page.reload();
  await expect(page.getByRole('table', { name: '역할 변경 이력' })).toContainText('브라우저 검증: 일반사용자');
  await page.setViewportSize({ width: 375, height: 900 });
  await expect(page.getByRole('link', { name: '권한 관리', exact: true })).toBeHidden();
  await page.screenshot({ path: '../../var/service-e2e/roles-mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('treasurer cannot open role management', async ({ page }) => {
  await loginAs(page, 'treasurer');
  await expect(page.getByTestId('balance')).toBeVisible();
  await expect(page.getByRole('link', { name: '권한 관리', exact: true })).toHaveCount(0);
  await page.goto('/roles');
  await expect(page.getByRole('heading', { name: '접근 권한이 없습니다' })).toBeVisible();
});
