import { expect, test } from '@playwright/test';
import { loginAs } from './accounts';

test('sidebar focus stays inside scroll area and document navigation keeps its current page', async ({ page }) => {
  await loginAs(page, 'super_admin');
  await expect(page).toHaveURL(/dashboard/);
  for (const width of [1440, 900, 390]) {
    await page.setViewportSize({ width, height: 640 });
    if (width <= 800) await page.getByRole('button', { name: '메뉴', exact: true }).click();
    const toggle = page.getByRole('button', { name: '문서 관리', exact: true });
    await page.keyboard.press("Tab");
    await toggle.focus();
    await expect(toggle).toBeFocused();
    if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.press('Enter');
    const fits = await toggle.evaluate(element => {
      const container = document.querySelector('.service-navigation')!;
      const bounds = container.getBoundingClientRect();
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      const outset = style.outlineStyle === 'none' ? 0 : Math.max(0, parseFloat(style.outlineWidth) + parseFloat(style.outlineOffset));
      return rect.left - outset >= bounds.left && rect.right + outset <= bounds.left + container.clientWidth && container.scrollWidth <= container.clientWidth;
    });
    expect(fits).toBe(true);
    await page.getByRole('link', { name: '가족 문서', exact: true }).click();
    await expect(page).toHaveURL(/documents\/family$/);
    if (width <= 800) await page.getByRole('button', { name: '메뉴', exact: true }).click();
    await expect(page.getByRole('link', { name: '가족 문서', exact: true })).toHaveAttribute('aria-current', 'page');
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await page.screenshot({ path: `../../var/sidebar-${width}.png` });
  }
});
