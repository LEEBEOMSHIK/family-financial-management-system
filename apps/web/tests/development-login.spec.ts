import { expect, test } from '@playwright/test';

test('development login is gated and uses server account permissions', async ({ page }) => {
  await page.goto('/login');
  if (process.env.ENABLE_DEV_LOGIN !== '1') {
    await expect(page.getByRole('region', { name: '개발용 테스트 로그인' })).toHaveCount(0);
    expect((await page.request.post('/api/v1/dev/session', { data: { profile: 'super_admin' } })).status()).toBe(404);
    return;
  }
  for (const [label, roleAllowed] of [['일반사용자', false], ['총무', false], ['총괄관리자', true]] as const) {
    await page.goto('/login');
    await page.getByRole('button', { name: `${label}로 테스트` }).click();
    await expect(page).toHaveURL(/dashboard/);
    const session = await (await page.request.get('/api/v1/session')).json();
    expect(session.capabilities.includes('manage_roles')).toBe(roleAllowed);
  }
  expect((await page.request.post('/api/v1/dev/session', { data: { profile: 'super_admin' }, headers: { Origin: 'https://untrusted.invalid' } })).status()).toBe(403);
});

test('both local hostnames support every test role and dashboard data', async ({ page, baseURL }) => {
  test.setTimeout(90_000); // Six complete sign-in/account flows, not a single page load.
  test.skip(process.env.ENABLE_DEV_LOGIN !== '1', 'Development accounts are disabled');
  for (const hostname of ['localhost', '127.0.0.1']) {
    const origin = new URL(baseURL!); origin.hostname = hostname;
    for (const label of ['일반사용자', '총무', '총괄관리자']) {
      await page.goto(new URL('/login', origin).href);
      await page.getByRole('button', { name: `${label}로 테스트` }).click();
      await expect(page).toHaveURL(new URL('/dashboard', origin).href);
      await expect(page.getByTestId('balance')).toBeVisible();
      await page.goto(new URL('/accounts', origin).href);
      await expect(page.getByRole('heading', { name: '내 계좌', exact: true })).toBeVisible();
      const session = await (await page.request.get(new URL('/api/v1/session', origin).href)).json();
      const accounts = await page.request.get(new URL(`/api/v1/families/${session.family_id}/bank-accounts`, origin).href);
      expect(accounts.status()).toBe(200);
    }
    for (const denied of ['http://localhost.evil:3000', 'https://localhost:3000', 'http://localhost:3999']) {
      const response = await page.request.post(new URL('/api/v1/dev/session', origin).href, {
        data: { profile: 'member' }, headers: { Origin: denied },
      });
      expect(response.status()).toBe(403);
      expect((await response.json()).error.code).toBe('ORIGIN_DENIED');
    }
  }
});
