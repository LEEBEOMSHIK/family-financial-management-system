import { expect, test } from '@playwright/test';
import { loginAs } from './accounts';

for (const role of ['member', 'treasurer', 'super_admin'] as const) {
  test(`accessible navigation and reflow for ${role}`, async ({ page }) => {
    test.setTimeout(180000);
    await loginAs(page, role);
    await expect(page).toHaveURL(/dashboard/);
    const routes = ['/dashboard', '/transactions', '/expenses', '/accounts', '/support'];
    if (role !== 'member') routes.push('/family', '/family/register', '/management', '/documents/bank', '/documents/family/upload');
    if (role === 'super_admin') routes.push('/roles');
    for (const route of routes) {
      await page.goto(route);
      await expect(page.locator('#main h1')).toBeVisible();
      await expect(page.locator('#main [role="status"]').filter({hasText:'자료를 불러오고 있습니다.'})).toHaveCount(0);
      await expect(page.locator('#main [role="alert"]')).toHaveCount(0);
      for (const mode of [{ width: 1440, font: '200%', theme: 'light' }, { width: 1440, font: '200%', theme: 'dark' }, { width: 320, font: '100%', theme: 'light' }, { width: 320, font: '100%', theme: 'dark' }]) {
        await page.setViewportSize({ width: mode.width, height: 900 });
        await page.evaluate(({font,theme}) => {document.documentElement.style.fontSize=font;document.documentElement.dataset.theme=theme;}, mode);
        await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), { message: `${role} ${route} ${mode.width} ${mode.font} reflow` }).toBe(true);
        const unnamed = await page.locator('button:visible').evaluateAll(elements => elements.filter(element => !element.textContent?.trim() && !element.getAttribute('aria-label') && !element.getAttribute('aria-labelledby') && !element.getAttribute('title')).length);
        expect(unnamed, `${route} unnamed buttons`).toBe(0);
        const unlabeled = await page.locator('input:visible,select:visible,textarea:visible').evaluateAll(elements => elements.filter(element => {
          const field=element as HTMLInputElement;
          const name = field.getAttribute('aria-label')?.trim() || field.getAttribute('aria-labelledby')?.split(/\s+/).map(id=>document.getElementById(id)?.textContent?.trim() || '').join('').trim() || Array.from(field.labels || []).map(label=>label.textContent?.trim() || '').join('').trim();
          return !name && !['submit','button','reset'].includes(field.type);
        }).map(element=>element.outerHTML.slice(0,120)));
        expect(unlabeled, `${route} fields need labels`).toEqual([]);
        if (mode.width > 800) {
          const visibleMenuHeight=await page.locator('.service-navigation').evaluate(element=>element.clientHeight);
          expect(visibleMenuHeight, 'expanded text must retain usable menu space').toBeGreaterThanOrEqual(240);
        }
        if (route === '/dashboard') await page.screenshot({path:`../../var/wb05-${role}-${mode.width}-${mode.theme}.png`});
      }
    }
  });
}

test('skip link moves keyboard focus into the main content; calendar closes back to trigger', async ({page}) => {
  await loginAs(page, 'super_admin');
  await page.goto('/dashboard');
  await expect(page.locator('#main h1')).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', {name:'본문으로 이동'})).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main')).toBeFocused();
  await page.goto('/family/register');
  const trigger=page.getByRole('button',{name:'생일 달력 열기'});
  await trigger.focus();await trigger.press('Enter');
  await expect(page.getByRole('dialog',{name:'생일 달력'})).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
});


test('touch emulation keeps navigation and help operable with reduced motion', async ({browser,baseURL}) => {
  const context=await browser.newContext({baseURL,viewport:{width:390,height:844},hasTouch:true,isMobile:true,reducedMotion:'reduce'});
  const page=await context.newPage();
  try {
    await loginAs(page,'member');
    const help=page.getByRole('button',{name:'대시보드 보는 법과 사용법'});
    await help.tap();
    await expect(page.getByRole('region',{name:'대시보드 안내'})).toBeVisible();
    await help.tap();
    await expect(page.getByRole('region',{name:'대시보드 안내'})).toHaveCount(0);
    const handle=page.getByRole('button',{name:'최근 입출금 크기 조절',exact:true});
    await expect(handle).toHaveCSS('opacity','1');
    const menu=page.getByRole('button',{name:'메뉴',exact:true});
    await menu.tap();
    await page.getByRole('link',{name:'입출금 내역',exact:true}).tap();
    await expect(page).toHaveURL(/transactions$/);
    await expect(menu).toHaveAttribute('aria-expanded','false');
  } finally {await context.close();}
});
