import { test, expect } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { loginAs } from './accounts';

test('admin invites a separate account and signup cannot choose a privileged role', async ({ page, browser }) => {
  await loginAs(page, 'super_admin');
  await page.getByRole('link', { name: '권한 관리', exact: true }).click();
  await page.getByRole('button', { name: '초대 코드 만들기' }).click();
  const token = await page.getByLabel('초대 코드', { exact: true }).inputValue();
  const context = await browser.newContext({ baseURL: process.env.E2E_BASE_URL });
  const invitee = await context.newPage();
  try {
    await invitee.goto('/register');
    await expect(invitee.getByRole('combobox', { name: '역할' })).toHaveCount(0);
    await invitee.getByLabel('초대 코드', { exact: true }).fill(token);
    await invitee.getByLabel('이름', { exact: true }).fill('별도 가족 계정');
    await invitee.getByLabel('아이디', { exact: true }).fill('invited_' + randomBytes(5).toString('hex'));
    const password = randomBytes(20).toString('hex');
    await invitee.getByLabel('비밀번호', { exact: true }).fill(password);
    await invitee.getByLabel('비밀번호 확인', { exact: true }).fill(password);
    await invitee.getByRole('button', { name: '가입하고 시작하기' }).click();
    await expect(invitee.getByTestId('balance')).toBeVisible();
    await expect(invitee.getByRole('link', { name: '권한 관리', exact: true })).toHaveCount(0);
    expect((await invitee.request.post('/api/v1/dev/session', { data: { profile: 'super_admin' } })).status()).toBe(process.env.ENABLE_DEV_LOGIN === '1' ? 403 : 404);
    await page.getByRole('button', { name: '목록 새로고침' }).click();
    await expect(page.getByRole('table', { name: '구성원 권한' })).toContainText('별도 가족 계정');
  } finally { await context.close(); }
});
