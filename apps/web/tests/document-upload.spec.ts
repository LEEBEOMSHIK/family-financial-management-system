import { expect, test } from '@playwright/test';
import { loginAs } from './accounts';

test('invalid version addresses do not become a new document form', async ({ page }) => {
  await loginAs(page, 'treasurer'); await expect(page).toHaveURL(/dashboard/);
  for (const kind of ['bank', 'family']) {
    for (const query of ['version=', 'version=one&version=two']) {
      await page.goto(`/documents/${kind}/upload?${query}`);
      await expect(page.getByRole('alert').filter({ hasText: '문서를 찾을 수 없습니다' })).toBeVisible();
      await expect(page.getByRole('button', { name: '문서 저장', exact: true })).toHaveCount(0);
      await expect(page.getByRole('button', { name: '파일 찾아보기', exact: true })).toHaveCount(0);
    }
  }
});

test('upload is a separate screen with drag, validation, replace and remove', async ({ page }) => {
  await loginAs(page, 'treasurer'); await expect(page).toHaveURL(/dashboard/);
  await page.goto('/documents/family/upload');
  await expect(page.getByRole('heading', { name: '가족 문서 업로드', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: '문서 목록' })).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: '문서 검색' })).toHaveCount(0);
  const area = page.getByRole('region', { name: '파일 업로드 영역' });
  const transfer = await page.evaluateHandle(() => {
    const data = new DataTransfer();
    data.items.add(new File(['Synthetic rules'], '합성-운영규정.txt', { type: 'text/plain' }));
    return data;
  });
  await area.dispatchEvent('dragenter', { dataTransfer: transfer });
  await expect(area).toHaveAttribute('data-dragging', 'true');
  await area.dispatchEvent('drop', { dataTransfer: transfer });
  await expect(page.getByRole('status').filter({ hasText: '합성-운영규정.txt' })).toBeVisible();
  await expect(page.getByLabel('문서 제목', { exact: true })).toHaveValue('합성-운영규정');
  await expect(page.getByRole('button', { name: '문서 저장', exact: true })).toBeEnabled();
  await page.getByLabel('파일 선택', { exact: true }).setInputFiles({ name: 'blocked.exe', mimeType: 'application/octet-stream', buffer: Buffer.from('bad') });
  await expect(page.getByRole('alert').filter({ hasText: '지원하지 않는 파일 형식' })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: '합성-운영규정.txt' })).toBeVisible();
  const multiple = await page.evaluateHandle(() => {
    const data = new DataTransfer();
    data.items.add(new File(['one'], 'one.txt')); data.items.add(new File(['two'], 'two.txt'));
    return data;
  });
  await area.dispatchEvent('drop', { dataTransfer: multiple });
  await expect(page.getByRole('alert').filter({ hasText: '파일 한 개' })).toBeVisible();
  await page.getByLabel('파일 선택', { exact: true }).setInputFiles({ name: 'large.txt', mimeType: 'text/plain', buffer: Buffer.alloc(6 * 1024 * 1024 + 1) });
  await expect(page.getByRole('alert').filter({ hasText: '6MiB 이하' })).toBeVisible();
  await page.getByRole('button', { name: '파일 제거', exact: true }).click();
  await expect(page.getByRole('button', { name: '문서 저장', exact: true })).toBeDisabled();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '파일 찾아보기', exact: true }).press('Enter');
  await (await chooser).setFiles({ name: 'replacement.txt', mimeType: 'text/plain', buffer: Buffer.from('Replacement rules') });
  await expect(page.getByRole('status').filter({ hasText: 'replacement.txt' })).toBeVisible();
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.screenshot({ path: '../../var/document-upload-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: '../../var/document-upload-desktop.png', fullPage: true });
  await page.getByRole('button', { name: '목록으로', exact: true }).click();
  await expect(page).toHaveURL(/documents\/family$/);
  await expect(page.getByRole('heading', { name: '가족 문서', exact: true })).toBeVisible();
});
