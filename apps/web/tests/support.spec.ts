import { expect, test } from '@playwright/test';
import { loginAs } from './accounts';

test('screen pins and private issue workflow', async ({page}) => {
  test.setTimeout(90000);
  await loginAs(page,'member');
  await expect(page).toHaveURL(/dashboard/);
  await expect(page.getByTestId('balance')).toBeVisible();
  const menuTargets=await page.locator('.service-sidebar nav a').evaluateAll(links=>links.slice(0,5).map(link=>{const r=link.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};}));
  await expect(page.locator('[data-widget="support"]')).toHaveCount(0);
  const originalLayout=await page.getByTestId('balance').boundingBox();
  await page.getByRole('button',{name:'문제 신고',exact:true}).click();
  expect(await page.getByTestId('balance').boundingBox()).toEqual(originalLayout);
  const scrollBefore=await page.evaluate(()=>window.scrollY);await page.mouse.move(700,300);await page.mouse.wheel(0,500);
  expect(await page.evaluate(()=>window.scrollY)).toBe(scrollBefore);
  await expect(page.locator('.support-frozen')).toHaveCount(0);
  await expect(page.getByRole('dialog',{name:'문제 위치 표시'})).toBeVisible();
  const layer=page.getByLabel('문제 위치 선택 영역',{exact:true});
  const balance=originalLayout!;
  await page.mouse.move(balance.x+balance.width/2,balance.y+balance.height/2);
  await expect(page.locator('.support-target-label')).toContainText('잔액');
  await page.mouse.click(balance.x+balance.width/2,balance.y+balance.height/2);
  await expect(page.locator('.support-selected-label')).toContainText('잔액');
  await expect(page.locator('.support-region[data-selected=true]')).toBeVisible();
  await page.getByRole('button',{name:'선택 핀 삭제'}).click();
  for(let i=0;i<5;i++) {
    await layer.click({position:menuTargets[i]!});
    await expect(page.getByLabel('선택한 핀 설명')).toBeFocused();
    await page.keyboard.type(`위치 ${i+1} 확인`);
    await expect(page.getByLabel('선택한 핀 설명')).toHaveValue(`위치 ${i+1} 확인`);
  }
  await layer.click({position:{x:balance.x+balance.width/2,y:balance.y+balance.height/2}});
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('최대 5개');
  await expect(page.locator('.support-pin')).toHaveCount(5);
  await page.getByRole('button',{name:'핀 1',exact:true}).focus();
  await page.keyboard.press('ArrowRight');
  await page.getByRole('button',{name:'핀 1',exact:true}).click();
  await page.getByRole('button',{name:'선택 핀 삭제'}).click();
  await expect(page.locator('.support-pin')).toHaveCount(4);
  await layer.click({position:{x:balance.x+balance.width/2,y:balance.y+balance.height/2}});
  await page.getByLabel('선택한 핀 설명').fill('잔액 확인');
  await page.getByRole('button',{name:'내용 확인'}).click();
  await page.getByLabel('문의 제목').fill('합성 핀 신고');
  await page.getByRole('button',{name:'가릴 영역 표시'}).click();
  const preview=page.getByLabel('가릴 영역 선택');await preview.scrollIntoViewIfNeeded();
  const box=(await preview.boundingBox())!;
  await page.mouse.move(box.x+box.width*.75,box.y+box.height*.2);await page.mouse.down();
  await page.mouse.move(box.x+box.width*.85,box.y+box.height*.3);await page.mouse.up();
  await expect(page.locator('.support-mask')).toHaveCount(1);
  await page.screenshot({path:'../../var/support-review-desktop.png'});
  await page.getByRole('button',{name:'문의 등록',exact:true}).click();
  await expect(page.getByRole('heading',{name:'합성 핀 신고',exact:true})).toBeVisible();
  await expect(page.getByRole('img',{name:'등록 당시 화면'})).toBeVisible();
  const maskedPixel=await page.getByRole('img',{name:'등록 당시 화면'}).evaluate(async (node:HTMLImageElement)=>{await node.decode();const canvas=document.createElement('canvas');canvas.width=node.naturalWidth;canvas.height=node.naturalHeight;const context=canvas.getContext('2d')!;context.drawImage(node,0,0);return Array.from(context.getImageData(Math.floor(canvas.width*.8),Math.floor(canvas.height*.25),1,1).data);});
  expect(maskedPixel).toEqual([32,41,54,255]);
  await page.screenshot({path:'../../var/support-detail-desktop.png',fullPage:true});
  await expect(page.getByLabel('처리 상태')).toHaveCount(0);
  const issueUrl=page.url();
  const session=await (await page.request.get('/api/v1/session')).json();
  const saved=await (await page.request.get(`/api/v1/families/${session.family_id}/issues/${issueUrl.split('/').pop()}`)).json();
  expect(saved.pins[4].context.component_id).toBe('dashboard.widget.balance');
  expect(saved.pins[4].context.source_file).toBe('apps/web/src/features/dashboard/dashboard-view.tsx');
  expect(saved.pins[4].context.locator.replaceAll('\\','')).toContain('dashboard.widget.balance');
  await page.context().grantPermissions(['clipboard-read','clipboard-write']);
  await page.getByRole('button',{name:'핀 5 수정 요청 정보 복사'}).click();
  const reference=JSON.parse(await page.evaluate(()=>navigator.clipboard.readText()));
  expect(reference.issue_id).toBe(saved.id);expect(reference.pin_number).toBe(5);
  expect(reference.context.component_id).toBe('dashboard.widget.balance');
  await page.goto('/dashboard');await expect(page.getByTestId('balance')).toBeVisible();
  await expect(page.locator(saved.pins[4].context.locator)).toHaveCount(1);
  await page.evaluate(()=>{const widget=document.querySelector('[data-widget="balance"]')!;widget.parentElement!.append(widget);});
  await expect(page.locator(saved.pins[4].context.locator)).toHaveCount(1);
  await page.goto(issueUrl);await expect(page.getByRole('heading',{name:'합성 핀 신고',exact:true})).toBeVisible();
  await page.getByLabel('답변 내용').fill('추가 설명');
  await page.route('**/issues/*/events',async route=>{await route.fetch();await route.abort('failed');},{times:1});
  await page.getByRole('button',{name:'답변 등록'}).click();
  await expect(page.locator('.support-detail [role=alert]')).toBeVisible();
  await page.getByRole('button',{name:'새로고침',exact:true}).click();
  await expect(page.getByText('추가 설명',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'답변 등록'}).click();
  await expect(page.locator('.support-detail [role=status]')).toHaveText('저장했습니다.');
  await expect(page.getByText('추가 설명',{exact:true})).toHaveCount(1);
  await loginAs(page,'treasurer');await expect(page).toHaveURL(/dashboard/);await expect(page.getByRole('button',{name:'문제 신고',exact:true})).toBeVisible();
  await page.goto(issueUrl);
  await expect(page.getByText('문의를 찾을 수 없습니다.',{exact:true})).toBeVisible();
  await loginAs(page,'super_admin');await expect(page).toHaveURL(/dashboard/);await expect(page.getByRole('button',{name:'문제 신고',exact:true})).toBeVisible();
  await expect(page.locator('[data-widget="support"]')).toBeVisible();
  await expect(page.locator('[data-widget="support"]')).toContainText('합성 핀 신고');
  await expect(page.locator('[data-widget="support"]')).toContainText('등록자');
  for(const [status,label] of [['received','접수'],['investigating','확인 중'],['needs_info','추가 확인 필요']]){
    await page.locator('[data-widget="support"]').getByRole('link',{name:new RegExp(`^${label} .*문의 보기$`)}).click();
    await expect(page).toHaveURL(new RegExp(`/support\\?status=${status}$`));
    await expect(page.getByLabel('상태 필터')).toHaveValue(status);
    if(status==='received')await expect(page.locator('.support-list')).toContainText('합성 핀 신고');
    else await expect(page.getByRole('heading',{name:'등록된 문의가 없습니다'})).toBeVisible();
    await page.reload();await expect(page.getByLabel('상태 필터')).toHaveValue(status);
    await page.getByLabel('상태 필터').selectOption('');await expect(page).toHaveURL(/\/support$/);
    await page.goto('/dashboard');await expect(page.locator('[data-widget="support"]')).toBeVisible();
  }
  await page.locator('[data-widget="support"]').getByRole('link',{name:/합성 핀 신고/}).click();
  await expect(page).toHaveURL(issueUrl);
  await page.getByLabel('처리 상태').selectOption('resolved');
  await page.getByRole('button',{name:'상태 저장'}).click();
  await expect(page.locator('.support-detail .support-status').first()).toHaveText('해결');
  await page.goto('/dashboard');
  await expect(page.locator('[data-widget="support"]')).toContainText('미해결 문의가 없습니다.');
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});


test('scrolled screen keeps fixed elements and toolbar can move', async ({page})=>{
  await loginAs(page,'member');await expect(page).toHaveURL(/dashboard/);await expect(page.getByRole('button',{name:'문제 신고',exact:true})).toBeVisible();
  await page.evaluate(()=>{document.body.style.minHeight='2400px';const marker=document.createElement('div');marker.id='capture-marker';marker.style.cssText='position:fixed;top:0;left:0;width:100px;height:60px;background:rgb(255,0,0);z-index:99';document.querySelector('.service-shell')!.append(marker);window.scrollTo(0,500);});
  await page.getByRole('button',{name:'문제 신고',exact:true}).evaluate((button:HTMLButtonElement)=>button.click());
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button',{name:'내용 확인'}).click();
  const pixel=await page.getByRole('img',{name:'등록 당시 화면'}).evaluate((node:HTMLImageElement)=>{const canvas=document.createElement('canvas');canvas.width=node.naturalWidth;canvas.height=node.naturalHeight;const context=canvas.getContext('2d')!;context.drawImage(node,0,0);return Array.from(context.getImageData(10,10,1,1).data);});
  expect(pixel).toEqual([255,0,0,255]);
  await page.getByRole('button',{name:'핀 다시 수정'}).click();
  await page.screenshot({path:'../../var/support-scrolled-pins.png'});
  await page.getByRole('button',{name:'도구 위로'}).click();
  await page.getByLabel('문제 위치 선택 영역',{exact:true}).click({position:{x:1430,y:980}});
  await expect(page.locator('.support-pin')).toHaveCount(0);
  await expect(page.getByText('직접 지정한 화면 영역',{exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'닫기',exact:true}).click();
  await page.setViewportSize({width:390,height:844});
  await page.getByTestId('balance').scrollIntoViewIfNeeded();
  const mobileBalance=(await page.getByTestId('balance').boundingBox())!;
  await page.getByRole('button',{name:'문제 신고',exact:true}).evaluate((button:HTMLButtonElement)=>button.click());
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByLabel('문제 위치 선택 영역',{exact:true}).click({position:{x:mobileBalance.x+mobileBalance.width/2,y:mobileBalance.y+mobileBalance.height/2}});
  await page.getByLabel('선택한 핀 설명').fill('모바일 문제 위치');
  await page.screenshot({path:'../../var/support-pins-mobile.png'});
  await page.getByRole('button',{name:'내용 확인'}).click();
  await page.getByLabel('등록 당시 화면 첨부').uncheck();
  await page.getByLabel('문의 제목').fill('모바일 화면 미첨부 문의');
  await page.getByRole('button',{name:'문의 등록',exact:true}).click();
  await expect(page.getByRole('heading',{name:'모바일 화면 미첨부 문의'})).toBeVisible();
  await expect(page.getByText('화면 이미지 없이 위치만 기록했습니다.')).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});


test('field targeting excludes option values and ignores blank space',async({page})=>{
  await loginAs(page,'super_admin');await expect(page.getByTestId('balance')).toBeVisible();
  await page.evaluate(()=>{const label=document.createElement('label');label.style.cssText='position:fixed;left:300px;top:150px;z-index:90;background:white';label.append(document.createTextNode('연결할 구성원'));const select=document.createElement('select');select.name='report-test-member';select.innerHTML='<option>합성 비공개 이름 98765원</option>';label.append(select);document.querySelector('main')!.append(label);});
  const target=(await page.locator('select[name="report-test-member"]').boundingBox())!;
  await page.getByRole('button',{name:'문제 신고',exact:true}).click();
  await page.getByLabel('문제 위치 선택 영역',{exact:true}).click({position:{x:target.x+target.width/2,y:target.y+target.height/2}});
  await expect(page.locator('.support-selected-label')).toHaveText('1. 연결할 구성원 입력 영역');
  await expect(page.locator('.support-selected-label')).not.toContainText('98765');
});


test('plain text is selectable without covering its content',async({page})=>{
  await loginAs(page,'member');await expect(page.getByTestId('balance')).toBeVisible();
  await page.evaluate(()=>{const block=document.createElement('div');block.id='report-text-test';block.style.cssText='position:fixed;left:300px;top:160px;z-index:90;background:white;padding:20px';block.innerHTML='<h2>일반 제목 확인</h2><p>설명 문장 <strong>강조된 내용</strong>도 선택합니다.</p><div>별도 텍스트 내용</div>';document.querySelector('main')!.append(block);});
  const targets=await page.locator('#report-text-test h2,#report-text-test strong,#report-text-test div').evaluateAll(nodes=>nodes.map(node=>{const r=node.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,text:node.textContent!};}));
  await page.getByRole('button',{name:'문제 신고',exact:true}).click();
  for(const target of targets){
    await page.mouse.move(target.x,target.y);
    await expect(page.locator('.support-target-label')).toContainText(target.text);
    await expect(page.locator('.support-region-hover>span')).toHaveCount(0);
    await page.mouse.click(target.x,target.y);
    await expect(page.locator('.support-selected-label')).toContainText(target.text);
    await expect(page.locator('.support-region[data-selected=true]>span')).toHaveCount(0);
    await page.getByRole('button',{name:'선택 핀 삭제'}).click();
  }
});
