import { test, expect } from '@playwright/test';
import { account } from './accounts';

test('measure login and dashboard boundaries without recording private data', async ({ page, request, baseURL }) => {
  test.skip(process.env.E2E_TIMING !== '1', 'Explicit timing probe only');
  test.setTimeout(120000);
  const samples: object[] = [];
  page.on('response', r => { if (r.status() >= 400 && new URL(r.url()).pathname.startsWith('/api/')) samples.push({ label: 'api_error', status: r.status() }); });
  page.on('requestfinished', r => {
    const path = new URL(r.url()).pathname;
    const label = path === '/api/v1/auth/login' ? 'proxy_login' : path === '/api/v1/session' ? 'proxy_session' : path === '/dashboard' ? 'dashboard_navigation' : path.endsWith('/dashboard') ? 'dashboard' : path.endsWith('/dashboard/flow') ? 'flow' : null;
    if (label) { const t = r.timing(); samples.push({ label, ms: Math.round(t.responseEnd), ttfb: Math.round(t.responseStart) }); }
  });
  try {
    for (const role of ['member', 'treasurer', 'super_admin'] as const) {
      await page.context().clearCookies();
      await page.goto('/login');
      const credentials = account(role);
      await page.getByLabel('아이디', { exact: true }).fill(credentials.username);
      await page.getByLabel('비밀번호', { exact: true }).fill(credentials.password);
      const start = Date.now();
      const response = page.waitForResponse(r => r.url().endsWith('/api/v1/auth/login'));
      await page.getByRole('button', { name: '로그인', exact: true }).click();
      samples.push({ label: 'login_status', status: (await response).status() });
      await expect(page).toHaveURL(/dashboard/, { timeout: 15000 });
      samples.push({ label: 'click_to_dashboard', ms: Date.now()-start });
      await expect(page.getByTestId('balance')).toBeVisible({ timeout: 15000 });
      samples.push({ label: 'click_to_balance', ms: Date.now()-start });
      const direct = Date.now();
      const r = await request.post(`${process.env.E2E_API_URL}/api/v1/auth/login`, { data: { username: credentials.username, password: credentials.password }, headers: { Origin: baseURL! } });
      samples.push({ label: 'direct_login', status: r.status(), ms: Date.now()-direct });
      expect(r.status()).toBe(200);
    }
  } finally {
    const start = Date.now();
    try {
      const health = await request.get(`${process.env.E2E_API_URL}/health`, { timeout: 5000 });
      samples.push({ label: 'direct_health', status: health.status(), ms: Date.now()-start });
    } catch { samples.push({ label: 'direct_health', failed: true, ms: Date.now()-start }); }
    console.log(JSON.stringify(samples));
  }
});
