import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';

const browser = process.env.CHROME_PATH ?? (process.platform === 'win32'
  ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : '/usr/bin/google-chrome');
export default defineConfig({
  testDir: './tests', fullyParallel: false, workers: 1, timeout: 30_000,
  outputDir: '../../var/service-e2e',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3000',
    viewport: { width: 1440, height: 1000 },
    launchOptions: existsSync(browser) ? { executablePath: browser } : {},
  },
});
