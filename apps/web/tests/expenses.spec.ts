import { expect, test, type Page } from '@playwright/test';
import { loginAs } from './accounts';

async function registerBank(page: Page, label: string) {
  await page.goto('/accounts');
  await page.getByRole('button', { name: '계좌 등록', exact: true }).click();
  await page.getByLabel('은행명', { exact: true }).fill('합성 은행');
  await page.getByLabel('예금주', { exact: true }).fill('합성 구성원');
  const digits = Array.from(crypto.getRandomValues(new Uint8Array(12)), value => String(value % 10)).join('');
  await page.getByLabel('계좌번호', { exact: true }).fill(digits);
  await page.getByLabel('계좌 별칭').fill(label);
  await page.getByRole('button', { name: '계좌 저장', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: '계좌를 등록했습니다' })).toBeVisible();
}
const receipt = { name: 'synthetic-receipt.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=', 'base64') };

test('member submits and treasurer approves, then member sees recorded decision', async ({ page, browser }) => {
  test.setTimeout(90_000);
  await loginAs(page, 'member');
  await expect(page).toHaveURL(/dashboard/);
  await registerBank(page, '정산 기본 계좌');
  await page.getByRole('link', { name: '출금 요청', exact: true }).click();
  await page.getByRole('button', { name: '새 출금 요청' }).click();
  await page.getByLabel('요청 금액 (원)').fill('125000');
  await expect(page.getByRole('combobox', { name: '지급받을 계좌' })).toContainText('정산 기본 계좌');
  await page.getByLabel('희망 지급일').fill('2026-11-01');
  await page.getByLabel('사용 목적').fill('합성 가족 행사 준비');
  await page.getByRole('button', { name: '요청 제출' }).click();
  await expect(page.getByRole('alert').filter({ hasText: '영수증을 1개 이상' })).toBeVisible();
  await page.getByLabel('영수증 첨부').setInputFiles(receipt);
  await expect(page.getByText('업로드 완료', { exact: true })).toBeVisible();
  await page.getByLabel('사용 목적').fill('합성 수정 전');
  await page.route('**/api/v1/families/*/expenses', async route => {
    if (route.request().method() === 'POST') await route.fulfill({ status: 422, contentType: 'application/json', body: JSON.stringify({ error: { code: 'VALIDATION_ERROR', message: '합성 입력 검증 오류' } }) });
    else await route.continue();
  });
  await page.getByRole('button', { name: '요청 제출' }).click();
  await expect(page.getByRole('alert').filter({ hasText: '합성 입력 검증 오류' })).toBeVisible();
  await page.unroute('**/api/v1/families/*/expenses');
  await page.getByLabel('사용 목적').fill('합성 가족 행사 준비');
  await page.route('**/api/v1/families/*/expenses', async route => {
    if (route.request().method() === 'POST') {
      const committed = await route.fetch();
      expect(committed.status()).toBe(200);
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'UNKNOWN', message: '합성 응답 유실' } }) });
    } else await route.continue();
  });
  await page.getByRole('button', { name: '요청 제출' }).click();
  await expect(page.getByRole('alert').filter({ hasText: '합성 응답 유실' })).toBeVisible();
  await expect(page.getByRole('button', { name: '영수증 1 제거' })).toBeDisabled();
  await page.unroute('**/api/v1/families/*/expenses');
  await page.getByRole('button', { name: '요청 제출' }).click();
  await expect(page.getByRole('status').filter({ hasText: '출금 요청을 제출했습니다' })).toBeVisible();
  await expect(page.getByText('승인 대기', { exact: true })).toBeVisible();
  await expect(page.getByRole('article').filter({ hasText: '합성 가족 행사 준비' })).toHaveCount(1);
  const other = await browser.newContext({ baseURL: process.env.E2E_BASE_URL });
  const treasurer = await other.newPage();
  try {
    await loginAs(treasurer, 'treasurer');
    await expect(treasurer).toHaveURL(/dashboard/);
    await expect(treasurer.getByRole('button', { name: '대시보드 편집', exact: true })).toBeVisible({ timeout: 15_000 });
    const approvalTasks = treasurer.getByRole('region', { name: '승인 대기', exact: true });
    await expect(approvalTasks.getByRole('link', { name: /합성 가족 행사 준비/ })).toBeVisible();
    await expect(treasurer.getByRole('region', { name: '송금 대기', exact: true })).toBeVisible();
    const adminContext = await browser.newContext({ baseURL: process.env.E2E_BASE_URL });
    try {
      const admin = await adminContext.newPage();
      await loginAs(admin, 'super_admin');
      await expect(admin).toHaveURL(/dashboard/);
      await expect(admin.getByRole('region', { name: '승인 대기', exact: true }).getByRole('link', { name: /합성 가족 행사 준비/ })).toBeVisible();
      await expect(admin.getByRole('region', { name: '송금 대기', exact: true })).toHaveCount(0);
    } finally { await adminContext.close(); }
    await approvalTasks.getByRole('link', { name: /합성 가족 행사 준비/ }).click();
    await expect(treasurer.getByRole('region', { name: '출금 요청 검토' })).toBeFocused();
    await expect(treasurer.getByRole('region', { name: '출금 요청 검토' }).getByRole('img', { name: '영수증 1 미리보기' })).toBeVisible();
    await treasurer.getByLabel('처리 사유').fill('사용 목적과 금액 확인');
    await treasurer.getByRole('button', { name: '처리 확정' }).click();
    await expect(treasurer.getByRole('status').filter({ hasText: '승인을 기록했습니다' })).toBeVisible();
    await treasurer.goto('/dashboard');
    const tasks = treasurer.locator('.dashboard-workspace');
    await expect(tasks.getByRole('region', { name: '승인 대기', exact: true })).not.toContainText('합성 가족 행사 준비');
    await expect(tasks.getByRole('region', { name: '송금 대기', exact: true })).toContainText('합성 가족 행사 준비');
    await tasks.getByRole('link', { name: /합성 가족 행사 준비/ }).click();
    await expect(treasurer.getByRole('heading', { name: '출금 요청 상세', exact: true })).toBeVisible();
    await expect(treasurer.getByText('총무가 직접 승인하여 별도 카카오톡 알림은 생략했습니다.')).toBeVisible();
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    await treasurer.getByLabel('실제 송금일').fill(today);
    await treasurer.getByLabel('송금 메모').fill('합성 송금 완료 기록');
    await treasurer.getByRole('checkbox', { name: '요청 금액 전액을 지정 계좌로 송금했음을 확인합니다.' }).check();
    await treasurer.getByRole('button', { name: '송금 완료 기록', exact: true }).click();
    await expect(treasurer.getByRole('heading', { name: '송금 완료', exact: true })).toBeVisible();
    await treasurer.goto('/dashboard');
    await expect(tasks).toContainText('현재 처리할 송금이 없습니다.');
    await expect(tasks.getByRole('link', { name: /합성 가족 행사 준비/ })).toHaveCount(0);
    await page.getByRole('button', { name: '목록 새로고침' }).click();
    await page.getByRole('article').filter({ hasText: '합성 가족 행사 준비' }).getByRole('button', { name: /상세 보기/ }).click();
    await expect(page.getByText('사용 목적과 금액 확인')).toBeVisible();
    await expect(page.getByText('합성 송금 완료 기록')).toBeVisible();
    await page.setViewportSize({ width: 390, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: '../../var/expense-mobile.png', fullPage: true });
  } finally { if (browser.isConnected()) await other.close(); }
});

test('default account switches without changing submitted advance and owner adds receipts', async ({ page }) => {
  await loginAs(page, 'member'); await expect(page).toHaveURL(/dashboard/);
  const suffix = crypto.randomUUID().slice(0, 8);
  await registerBank(page, `이전 계좌 ${suffix}`);
  await page.goto('/expenses'); await page.getByRole('button', { name: '새 출금 요청' }).click();
  const selected = await page.getByRole('combobox', { name: '지급받을 계좌' }).innerText();
  await page.getByRole('combobox', { name: '요청 유형' }).click(); await page.getByRole('option', { name: '사용 전 선지급' }).click();
  await page.getByLabel('요청 금액 (원)').fill('5000'); await page.getByLabel('희망 지급일').fill('2026-11-02');
  const purpose = `합성 선지급 ${suffix}`; await page.getByLabel('사용 목적').fill(purpose);
  await page.getByRole('button', { name: '요청 제출' }).click();
  await expect(page.getByRole('status').filter({ hasText: '출금 요청을 제출했습니다' })).toBeVisible();
  await registerBank(page, `새 계좌 ${suffix}`);
  const previous = page.getByRole('article').filter({ hasText: `이전 계좌 ${suffix}` });
  await previous.getByRole('button', { name: '기본 계좌로 지정' }).click();
  await expect(previous.getByText('기본 계좌', { exact: true })).toBeVisible();
  const next = page.getByRole('article').filter({ hasText: `새 계좌 ${suffix}` });
  await next.getByRole('button', { name: '기본 계좌로 지정' }).click();
  await expect(next.getByText('기본 계좌', { exact: true })).toBeVisible();
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    const sizes = await page.getByRole('region', { name: '내 계좌 목록' }).getByRole('article').evaluateAll(cards => cards.map(card => card.getBoundingClientRect().height));
    expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThan(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: '../../var/expense-demo/account-cards-light.png', fullPage: true });
  await page.goto('/expenses'); await page.getByRole('button', { name: '새 출금 요청' }).click();
  await expect(page.getByRole('combobox', { name: '지급받을 계좌' })).toContainText(`새 계좌 ${suffix}`);
  await page.getByRole('article').filter({ hasText: purpose }).getByRole('button', { name: /상세 보기/ }).click();
  const card = page.getByRole('region', { name: '출금 요청 검토' });
  const oldMasked = selected.split(' · ')[1]; await expect(card).toContainText(oldMasked);
  await card.getByRole('button', { name: '사후 영수증 추가' }).click();
  await card.getByLabel('영수증 첨부').setInputFiles(receipt);
  await expect(card.getByText('업로드 완료', { exact: true })).toBeVisible();
  await card.getByRole('button', { name: '증빙 추가 접기' }).click();
  await card.getByRole('button', { name: '사후 영수증 추가' }).click();
  await expect(card.getByRole('button', { name: '증빙 제출' })).toBeDisabled();
  await card.getByLabel('영수증 첨부').setInputFiles(receipt);
  await expect(card.getByText('업로드 완료', { exact: true })).toBeVisible();
  await card.getByRole('button', { name: '증빙 제출' }).click();
  await expect(card.getByRole('img', { name: '영수증 1 미리보기' })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 900 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
