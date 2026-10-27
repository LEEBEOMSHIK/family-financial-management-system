import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { loginAs } from './accounts';

test('all document lists separate search, result count and content on desktop and mobile', async ({ page }) => {
  await loginAs(page, 'treasurer'); await expect(page).toHaveURL(/dashboard/);
  await page.goto('/documents');
  await expect(page).toHaveURL(/documents\/bank$/);
  for (const section of ['bank', 'family', 'evidence']) {
    await page.goto(`/documents/${section}`);
    const summary = page.locator('.list-result-summary');
    await expect(summary).toBeVisible();
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      const gaps = await summary.evaluate(element => {
        const controls = document.querySelector('.document-toolbar')!.getBoundingClientRect();
        const count = element.getBoundingClientRect();
        const list = document.querySelector('.document-grid')!.getBoundingClientRect();
        return [count.top - controls.bottom, list.top - count.bottom];
      });
      for (const gap of gaps) expect(gap).toBeGreaterThanOrEqual(16);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
  }
});

test('managers store documents, preserve versions, download and manage bank originals', async ({ page }) => {
  test.setTimeout(90_000);
  await loginAs(page, 'treasurer');
  await expect(page).toHaveURL(/dashboard/);
  const nav = page.getByRole('navigation', { name: '문서 관리 메뉴' });
  await nav.getByRole('button', { name: '문서 관리', exact: true }).click();
  await expect(nav.getByRole('link', { name: '문서 관리 홈', exact: true })).toHaveCount(0);
  await expect(nav.getByRole('link')).toHaveCount(3);
  await nav.getByRole('link', { name: '가족 문서', exact: true }).click();
  await page.getByRole('link', { name: '문서 업로드', exact: true }).click();
  await page.getByLabel('문서 제목', { exact: true }).fill('합성 가족 운영규정');
  await page.getByLabel('설명', { exact: true }).fill('원본 및 버전 보존 확인');
  await page.getByLabel('파일 선택').setInputFiles({ name: '합성-규정.txt', mimeType: 'text/plain', buffer: Buffer.from('Synthetic family rules v1') });
  // Simulate an unknown outcome after the server has committed; retry must not create a duplicate.
  let once = true;
  await page.route('**/api/v1/families/*/documents?**', async route => {
    if (route.request().method() === 'POST' && once) {
      once = false;
      const response = await route.fetch();
      expect(response.ok()).toBeTruthy();
      await route.fulfill({ status: 503, json: { error: { message: '합성 결과 불명' } } });
    } else await route.continue();
  });
  await page.getByRole('button', { name: '문서 저장', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: '업로드 결과를 확인하지 못했습니다' })).toBeVisible();
  await expect(page.getByLabel('문서 제목')).toBeDisabled();
  await expect(page.getByRole('button', { name: '파일 찾아보기', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: '파일 제거', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '업로드 결과 확인', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: '문서를 저장했습니다' })).toBeVisible();
  await page.unroute('**/api/v1/families/*/documents?**');
  const cards = page.getByRole('region', { name: '문서 목록' }).getByRole('article');
  await expect(cards).toHaveCount(1);
  await cards.getByRole('link', { name: '새 버전', exact: true }).click();
  await page.getByLabel('파일 선택').setInputFiles({ name: '합성-규정-v2.txt', mimeType: 'text/plain', buffer: Buffer.from('Synthetic family rules v2') });
  await page.getByRole('button', { name: '새 버전 저장', exact: true }).click();
  await expect(cards).toHaveCount(1);
  await expect(cards).toContainText('v2');
  await page.reload();
  await expect(cards).toContainText('v2');
  await cards.getByRole('button', { name: '버전 이력' }).click();
  const history = page.getByRole('region', { name: '문서 버전 이력' });
  await expect(history.getByRole('article')).toHaveCount(2);
  await expect(history).toBeFocused();
  const downloaded = page.waitForEvent('download');
  await history.getByRole('article').filter({ hasText: 'v1 ·' }).getByRole('button', { name: '원본 다운로드' }).click();
  const file = await downloaded;
  expect(file.suggestedFilename()).toBe('합성-규정.txt');
  expect(await readFile((await file.path())!, 'utf8')).toBe('Synthetic family rules v1');
  await page.getByRole('button', { name: '이력 닫기' }).click();
  await expect(cards.getByRole('button', { name: '버전 이력' })).toBeFocused();
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: '../../var/documents-family.png', fullPage: true });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.screenshot({ path: '../../var/documents-family-dark.png', fullPage: true });
  await page.emulateMedia({ colorScheme: 'light' });
  await nav.getByRole('link', { name: '통장 내역 문서', exact: true }).click();
  await page.getByRole('link', { name: '문서 업로드', exact: true }).click();
  await page.getByLabel('문서 제목', { exact: true }).fill('합성 모임통장 10월');
  await page.getByLabel('파일 선택').setInputFiles({ name: 'synthetic.csv', mimeType: 'text/csv', buffer: Buffer.from('날짜,입금,출금\n2026-10-26,1000,0') });
  await page.getByRole('button', { name: '문서 저장', exact: true }).click();
  await expect(cards).toHaveCount(1);
  await expect(cards).toContainText('거래 미반영');
  await page.getByRole('textbox', { name: '문서 검색' }).fill('없는문서');
  await page.getByRole('button', { name: '검색', exact: true }).click();
  await expect(page.getByRole('heading', { name: '검색 결과가 없습니다' })).toBeVisible();
});

test('member cannot access management; managers see attached receipts and source request', async ({ page, browser }) => {
  test.setTimeout(60_000);
  await loginAs(page, 'member'); await expect(page).toHaveURL(/dashboard/);
  await expect(page.getByRole('navigation', { name: '문서 관리 메뉴' })).toHaveCount(0);
  const session = await (await page.request.get('/api/v1/session')).json();
  const base = `/api/v1/families/${session.family_id}`;
  expect((await page.request.get(`${base}/documents`)).status()).toBe(403);
  await page.goto('/documents/family');
  await expect(page.getByRole('heading', { name: '접근 권한이 없습니다' })).toBeVisible();
  await page.goto('/documents/family/upload');
  await expect(page.getByRole('heading', { name: '접근 권한이 없습니다' })).toBeVisible();
  const headers = { 'X-CSRF-Token': session.csrf_token, Origin: new URL(page.url()).origin };
  const account = await (await page.request.post(`${base}/bank-accounts`, { headers, data: { bank_name: '합성 은행', account_holder: '합성 구성원', account_number: Array.from(crypto.getRandomValues(new Uint8Array(12)), n => n % 10).join(''), label: '문서 검증 계좌', make_default: true } })).json();
  const receipt = await (await page.request.post(`${base}/evidence`, { headers: { ...headers, 'Content-Type': 'image/png' }, data: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=', 'base64') })).json();
  const expense = await page.request.post(`${base}/expenses`, { headers, data: { amount_krw: '1000', purpose: '문서 관리 합성 증빙', request_type: 'reimbursement', bank_account_id: account.id, evidence_ids: [receipt.id], requested_on: '2026-11-01', operation_id: crypto.randomUUID() } });
  expect(expense.ok()).toBeTruthy();
  const other = await browser.newContext();
  try {
    const manager = await other.newPage();
    await loginAs(manager, 'super_admin'); await expect(manager).toHaveURL(/dashboard/);
    await manager.goto('/documents/evidence');
    const card = manager.getByRole('article').filter({ hasText: '문서 관리 합성 증빙' });
    await expect(card.getByRole('img')).toBeVisible();
    const download = manager.waitForEvent('download');
    await card.getByRole('button', { name: '원본 다운로드' }).click();
    expect((await download).suggestedFilename()).toContain(receipt.id);
    await card.getByRole('link', { name: '출금 요청 보기 →' }).click();
    await expect(manager.getByRole('heading', { name: '출금 요청 상세', exact: true })).toBeVisible();
  } finally { await other.close(); }
});
