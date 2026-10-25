import { expect, test } from '@playwright/test';

test('administrator can open compact request details and configured decision form', async ({ page }) => {
  test.skip(process.env.ENABLE_DEV_LOGIN !== '1', 'Requires local development demo');
  await page.goto('/login');
  await page.getByRole('button', { name: '총괄관리자로 테스트' }).click();
  await expect(page).toHaveURL(/dashboard/);
  await page.goto('/expenses');
  const card = page.getByRole('article').filter({ hasText: '[테스트] 가족 모임 식비 정산' });
  await expect(card).toBeVisible();
  await expect(card.getByRole('img')).toHaveCount(0);
  await card.getByRole('button', { name: /상세 보기/ }).click();
  await expect(page.getByRole('heading', { name: '출금 요청 상세', exact: true })).toBeVisible();
  await expect(page.getByRole('combobox', { name: '처리 결과' })).toBeVisible();
  await page.getByLabel('처리 사유').fill('화면 검증용 입력 · 저장하지 않음');
  await expect(page.getByRole('button', { name: '처리 확정' })).toBeEnabled();
  await expect(page.getByRole('img', { name: '영수증 1 미리보기' })).toBeVisible();
  await expect(page.getByText('테스트은행 (실제 송금 금지)', { exact: false })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 900 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: '목록으로', exact: true }).click();
  await expect(card).toBeVisible();
});
