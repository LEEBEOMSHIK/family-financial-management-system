import { expect, test } from '@playwright/test';
import { loginAs } from './accounts';

test('administrator rejection remains visible and cannot be overwritten', async ({ page, browser }) => {
  test.setTimeout(60_000);
  await loginAs(page, 'member');
  await expect(page).toHaveURL(/dashboard/);
  await expect(page.getByTestId('balance')).toBeVisible({ timeout: 15_000 });
  const member = await (await page.request.get('/api/v1/session')).json();
  const base = `/api/v1/families/${member.family_id}`;
  const headers = { Origin: process.env.E2E_BASE_URL!, 'X-CSRF-Token': member.csrf_token };
  const account = await page.request.post(`${base}/bank-accounts`, { headers, data: {
    bank_name: '합성 은행', account_holder: '합성 사용자', label: '반려 테스트', make_default: true,
    account_number: Array.from(crypto.getRandomValues(new Uint8Array(12)), n => String(n % 10)).join(''),
  } });
  expect(account.status()).toBe(200);
  const request = await page.request.post(`${base}/expenses`, { headers, data: {
    amount_krw: '80000', purpose: '합성 반려 이력 확인', request_type: 'advance',
    bank_account_id: (await account.json()).id, evidence_ids: [], requested_on: '2026-11-01', operation_id: crypto.randomUUID(),
  } });
  expect(request.status()).toBe(200);
  const item = await request.json();
  const context = await browser.newContext({ baseURL: process.env.E2E_BASE_URL });
  try {
    const admin = await context.newPage(); await loginAs(admin, 'super_admin');
    await expect(admin).toHaveURL(/dashboard/);
    await expect(admin.getByTestId('balance')).toBeVisible({ timeout: 15_000 }); await admin.goto('/expenses');
    await admin.getByRole('article').filter({ hasText: item.purpose }).getByRole('button', { name: /상세 보기/ }).click();
    await admin.getByRole('combobox', { name: '처리 결과' }).click();
    await admin.getByRole('option', { name: '반려', exact: true }).click();
    await admin.getByLabel('처리 사유').fill('합성 테스트: 사용 목적 보완 필요');
    await admin.getByRole('button', { name: '처리 확정' }).click();
    await expect(admin.getByRole('status').filter({ hasText: '반려 사유를 기록했습니다' })).toBeVisible();
    const actor = await (await admin.request.get('/api/v1/session')).json();
    const repeated = await admin.request.post(`${base}/expenses/${item.id}/decisions`, { headers: {
      Origin: process.env.E2E_BASE_URL!, 'X-CSRF-Token': actor.csrf_token,
    }, data: { decision: 'approved', comment: '합성 덮어쓰기 시도' } });
    expect(repeated.status()).toBe(409);
    await page.goto('/expenses');
    await page.getByRole('article').filter({ hasText: item.purpose }).getByRole('button', { name: /상세 보기/ }).click();
    const card = page.getByRole('region', { name: '출금 요청 검토' });
    await expect(card).toContainText('반려');
    await expect(card).toContainText('합성 테스트: 사용 목적 보완 필요');
    const stored = await (await page.request.get(`${base}/expenses/${item.id}`)).json();
    expect(stored.status).toBe('rejected'); expect(stored.actor_name).toBeTruthy();
    expect(stored.decided_at).toBeTruthy(); expect(stored.policy_version).toBeTruthy();
  } finally { await context.close(); }
});
