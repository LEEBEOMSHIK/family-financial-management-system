// Creates only clearly labelled synthetic requests through the running service.
const { chromium, expect } = require('../apps/web/node_modules/@playwright/test');
const { randomInt } = require('node:crypto');
const fs = require('node:fs');

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  try {
    const page = await browser.newPage({ baseURL: 'http://localhost:3000' });
    await page.goto('/login');
    await page.getByRole('button', { name: '일반사용자로 테스트' }).click();
    await expect(page.getByTestId('balance')).toBeVisible();
    const session = await (await page.request.get('/api/v1/session')).json();
    const base = `/api/v1/families/${session.family_id}`;
    const existing = await (await page.request.get(`${base}/expenses`)).json();
    const accounts = await (await page.request.get(`${base}/bank-accounts`)).json();
    if (!accounts.items.some(item => item.label === '화면 확인용 가상 계좌')) {
      await page.goto('/accounts');
      await page.getByRole('button', { name: '계좌 등록', exact: true }).click();
      await page.getByLabel('은행명', { exact: true }).fill('테스트은행 (실제 송금 금지)');
      await page.getByLabel('예금주', { exact: true }).fill('테스트 일반사용자');
      await page.getByLabel('계좌번호', { exact: true }).fill(Array.from({ length: 12 }, () => String(randomInt(10))).join(''));
      await page.getByLabel('계좌 별칭').fill('화면 확인용 가상 계좌');
      await page.getByRole('button', { name: '계좌 저장', exact: true }).click();
      await expect(page.getByRole('status').filter({ hasText: '계좌를 등록했습니다' })).toBeVisible();
    }
    const receiptPage = await browser.newPage({ viewport: { width: 720, height: 800 } });
    await receiptPage.setContent('<html lang="ko"><meta charset="utf-8"><body style="font-family:Arial,sans-serif;padding:48px;color:#243854"><h1>테스트 영수증 · 가상 자료</h1><p>실제 결제 또는 송금 자료가 아닙니다.</p><hr><h2>가족 모임 식비 정산</h2><p>가상 식사비　100,000원</p><p>가상 음료비　25,000원</p><hr><h2>합계　125,000원</h2><p>승인 화면과 이미지 확인을 위한 테스트입니다.</p></body></html>');
    const receipt = await receiptPage.screenshot(); await receiptPage.close();
    const cases = [
      { purpose: '[테스트] 가족 모임 식비 정산 · 영수증 첨부', amount: '125000', advance: false },
      { purpose: '[테스트] 다음 가족 모임 준비비 선지급 · 영수증 추후 제출', amount: '80000', advance: true },
    ];
    for (const item of cases) {
      if (existing.items.some(row => row.purpose === item.purpose)) continue;
      await page.goto('/expenses');
      await page.getByRole('button', { name: '새 출금 요청' }).click();
      await page.getByLabel('요청 금액 (원)').fill(item.amount);
      await page.getByRole('combobox', { name: '지급받을 계좌' }).click();
      await page.getByRole('option').filter({ hasText: '화면 확인용 가상 계좌' }).click();
      if (item.advance) {
        await page.getByRole('combobox', { name: '요청 유형' }).click();
        await page.getByRole('option', { name: '사용 전 선지급', exact: true }).click();
      }
      await page.getByLabel('희망 지급일').fill('2026-11-01');
      await page.getByLabel('사용 목적').fill(item.purpose);
      if (!item.advance) {
        await page.getByLabel('영수증 첨부').setInputFiles({ name: 'test-receipt.png', mimeType: 'image/png', buffer: receipt });
        await expect(page.getByText('업로드 완료', { exact: true })).toBeVisible();
      }
      await page.getByRole('button', { name: '요청 제출' }).click();
      await expect(page.getByRole('status').filter({ hasText: '출금 요청을 제출했습니다' })).toBeVisible();
    }
    fs.mkdirSync('var/expense-demo', { recursive: true });
    for (const role of ['일반사용자', '총무', '총괄관리자']) {
      await page.goto('/login');
      await page.getByRole('button', { name: `${role}로 테스트` }).click();
      await expect(page.getByTestId('balance')).toBeVisible();
      await page.goto('/expenses');
      for (const item of cases) {
        const card = page.getByRole('article').filter({ hasText: item.purpose });
        await expect(card).toContainText('승인 대기');
        if (!item.advance) {
          await card.getByRole('button', { name: /상세 보기/ }).click();
          const preview = page.getByRole('img', { name: '영수증 1 미리보기' });
          await expect(preview).toBeVisible();
          await expect.poll(() => preview.evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
          await page.screenshot({ path: `var/expense-demo/${role}-detail.png`, fullPage: true });
          await page.getByRole('button', { name: '목록으로', exact: true }).click();
        }
      }
      await page.screenshot({ path: `var/expense-demo/${role}.png`, fullPage: true });
    }
    console.log('Two synthetic pending requests verified for member, treasurer and super administrator.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
