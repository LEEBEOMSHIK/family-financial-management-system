import { expect, test } from '@playwright/test';
import { loginAs } from './accounts';

test('transaction page size and totals cover filtered results, not the current page',async({page})=>{
  await loginAs(page,'member');await expect(page).toHaveURL(/dashboard/);
  const items=Array.from({length:65},(_,index)=>({id:`synthetic-${index}`,occurred_on:'2026-10-01',description:`합성 거래 ${index+1}`,amount_krw:'100',category:'합성',reconciliation_status:'pending'}));
  await page.route('**/api/v1/families/*/transactions?*',async route=>{
    const query=new URL(route.request().url()).searchParams;const limit=Number(query.get('limit')||50),offset=Number(query.get('offset')||0);
    const filtered=query.get('direction')==='expense'?[]:items;
    await route.fulfill({json:{items:filtered.slice(offset,offset+limit),as_of:'2026-10-01T09:00:00+09:00',data_mode:'bank_import',total:filtered.length,offset,limit,income_krw:String(filtered.length*100),expense_krw:'0',net_krw:String(filtered.length*100)}});
  });
  await page.goto('/transactions');await expect(page.getByTestId('transaction-row')).toHaveCount(50);
  await expect(page.locator('#transaction-totals')).toHaveCount(0);
  await page.getByRole('switch',{name:'합계 표시'}).check();
  await expect(page.locator('#transaction-totals')).toContainText('전체 65건');
  await expect(page.locator('#transaction-totals')).toContainText('6,500');
  await page.getByLabel('페이지당 건수').selectOption('20');await expect(page.getByTestId('transaction-row')).toHaveCount(20);
  await page.getByRole('button',{name:'다음',exact:true}).click();await expect(page.getByTestId('transaction-row').first()).toContainText('합성 거래 21');
  await expect(page.locator('#transaction-totals')).toContainText('6,500');
  await page.getByLabel('페이지당 건수').selectOption('100');await expect(page.getByTestId('transaction-row')).toHaveCount(65);
  await expect(page.getByTestId('transaction-row').first()).toContainText('합성 거래 1');
  await page.reload();await expect(page.getByLabel('페이지당 건수')).toHaveValue('100');await expect(page.getByRole('switch',{name:'합계 표시'})).toBeChecked();
  await page.goto('/dashboard');await page.goto('/transactions');await expect(page.getByLabel('페이지당 건수')).toHaveValue('100');await expect(page.getByRole('switch',{name:'합계 표시'})).toBeChecked();
  await page.getByRole('combobox',{name:'입출금 구분'}).click();await page.getByRole('option',{name:'출금',exact:true}).click();
  await expect(page.locator('#transaction-totals')).toContainText('전체 0건');
  await expect(page.getByTestId('transaction-row')).toHaveCount(0);
  await page.getByRole('switch',{name:'합계 표시'}).uncheck();await expect(page.locator('#transaction-totals')).toHaveCount(0);
  await page.reload();await expect(page.getByRole('switch',{name:'합계 표시'})).not.toBeChecked();await expect(page.getByLabel('페이지당 건수')).toHaveValue('100');
  await loginAs(page,'super_admin');await expect(page).toHaveURL(/dashboard/);await page.goto('/transactions');await expect(page.getByLabel('페이지당 건수')).toHaveValue('50');await expect(page.getByRole('switch',{name:'합계 표시'})).not.toBeChecked();
  await loginAs(page,'member');await expect(page).toHaveURL(/dashboard/);await page.goto('/transactions');await expect(page.getByLabel('페이지당 건수')).toHaveValue('100');
  await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
