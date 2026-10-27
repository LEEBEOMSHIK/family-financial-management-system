import { expect,test } from '@playwright/test';
import { loginAs } from './accounts';

test('treasurer registers without an account and admin links a later signup',async({page,browser})=>{
  test.setTimeout(90000);
  await loginAs(page,'treasurer');await expect(page).toHaveURL(/dashboard/,{timeout:15000});
  await page.goto('/family');
  await page.locator('.dues-table').waitFor();
  const previousCount=await page.locator('.dues-table tbody tr').count();
  await page.getByRole('link',{name:'구성원 등록',exact:true}).click();
  await page.getByLabel('구성원 이름',{exact:true}).fill('계정 없는 합성 가족');
  await page.getByRole('button',{name:'구성원 등록',exact:true}).click();
  await expect(page).toHaveURL(/family$/);
  const row=page.locator('.dues-table tbody tr').filter({hasText:'계정 없는 합성 가족'});
  await expect(row).toContainText('계정 없음');
  await expect(row.getByRole('button',{name:'계정 초대',exact:true})).toHaveCount(0);
  await page.setViewportSize({width:320,height:900});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'../../var/participants-mobile.png',fullPage:true});
  await page.setViewportSize({width:1440,height:1000});
  await loginAs(page,'super_admin');await expect(page).toHaveURL(/dashboard/,{timeout:15000});
  await page.goto('/family');
  await row.getByRole('button',{name:'계정 초대',exact:true}).click();
  const token=await row.getByLabel('계정 없는 합성 가족 초대 코드',{exact:true}).inputValue();
  await row.getByRole('button',{name:'초대 코드 닫기',exact:true}).click();
  const context=await browser.newContext({baseURL:process.env.E2E_BASE_URL});
  try {
    const user=await context.newPage();await user.goto('/register');
    await user.getByLabel('초대 코드',{exact:true}).fill(token);
    await user.getByLabel('이름',{exact:true}).fill('합성 조회 계정');
    await user.getByLabel('아이디',{exact:true}).fill('offline_viewer');
    await user.getByLabel('비밀번호',{exact:true}).fill('synthetic-signup-password-123');
    await user.getByLabel('비밀번호 확인',{exact:true}).fill('synthetic-signup-password-123');
    await user.getByRole('button',{name:'가입하고 시작하기',exact:true}).click();
    await expect(user).toHaveURL(/dashboard/,{timeout:15000});
    await expect(user.getByTestId('balance')).toBeVisible({timeout:15000});
    await expect(user.getByRole('link',{name:'가족 관리',exact:true})).toHaveCount(0);
  } finally {await context.close();}
  await page.reload();await expect(row).toContainText('계정 연결됨');
  await expect(row).toHaveCount(1);
  await expect(page.locator('.dues-table tbody tr')).toHaveCount(previousCount+1);
});
