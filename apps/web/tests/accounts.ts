import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
type Profile = 'member' | 'treasurer' | 'super_admin';
export function account(profile: Profile): { username: string; password: string; id: string } {
  if (!process.env.E2E_CREDENTIALS) throw new Error('Run scripts/test_service.py with the dedicated test database.');
  return JSON.parse(readFileSync(process.env.E2E_CREDENTIALS, 'utf8'))[profile];
}
export async function loginAs(page: Page, profile: Profile) {
  const credentials = account(profile);
  await page.goto('/login');
  await page.getByLabel('아이디', { exact: true }).fill(credentials.username);
  await page.getByLabel('비밀번호', { exact: true }).fill(credentials.password);
  await page.getByRole('button', { name: '로그인', exact: true }).click();
}
