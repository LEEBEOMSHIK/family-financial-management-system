import {expect,test} from '@playwright/test';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {loginAs} from './accounts';

test('uploaded deposits automatically settle dues and ambiguous deposits require a member decision',async({page})=>{
  test.setTimeout(90000);
  await loginAs(page,'super_admin');
  await expect(page).toHaveURL(/dashboard/,{timeout:15000});
  const session=await(await page.request.get('/api/v1/session')).json();
  const root=`/api/v1/families/${session.family_id}`;
  const initial=await(await page.request.get(`${root}/dues`)).json();
  const month=initial.today.slice(0,7);
  const headers={'X-CSRF-Token':session.csrf_token,Origin:new URL(page.url()).origin};
  const members=[];
  for(const name of ['합성자동가','합성자동나']) {
    const response=await page.request.post(`${root}/participants`,{headers,data:{name,amount_krw:'1000',fee_month:month,operation_id:crypto.randomUUID()}});
    expect(response.status()).toBe(200);members.push((await response.json()).id);
  }
  expect((await page.request.post(`${root}/dues`,{headers,data:{kind:'deadline',month,due_day:1,operation_id:crypto.randomUUID()}})).status()).toBe(200);
  const python=resolve('../api/.venv-pg',process.platform==='win32'?'Scripts/python.exe':'bin/python');
  const buffer=execFileSync(python,['-X','utf8','-c',"import sys;sys.path[:0]=['../api/src','../api/tests'];from test_dues_matching import statement;sys.stdout.buffer.write(statement(sys.argv[1].replace('-','.'),sys.argv[2].replace('-','.'),[('합성자동가',1000,'이체'),('합성자동나',400,'이체'),('합성불일치',500,'이체')]))",month,initial.today]);
  await page.goto('/documents/bank/upload');
  await page.getByLabel('파일 선택').setInputFiles({name:'synthetic-auto.csv',mimeType:'text/csv',buffer});
  await page.getByLabel('문서 제목',{exact:true}).fill('자동 회비 연결 합성 자료');
  await page.getByRole('button',{name:'문서 저장',exact:true}).click();
  await expect(page.getByRole('article').filter({hasText:'자동 회비 연결 합성 자료'})).toContainText('동기화 완료');
  await page.goto('/dashboard');
  const widget=page.locator('[data-widget="dues"]');
  await expect(widget.getByText('입금 연결 확인 1건 →')).toBeVisible();
  await expect(widget.locator('.dues-metrics')).toContainText('—');
  await page.goto('/family');
  const review=page.getByRole('listitem').filter({hasText:'합성불일치'});
  await review.getByLabel('연결할 구성원').selectOption(members[1]);
  await review.getByRole('button',{name:'회비에 연결',exact:true}).click();
  await expect(page.getByText('조회 월에 연결 확인이 필요한 입금이 없습니다.')).toBeVisible();
  await page.getByRole('button',{name:'입금 자동 확인',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('입금 0건');
  const data=await(await page.request.get(`${root}/dues`)).json();
  expect(data.events.filter((e:{auto_matched:boolean})=>e.auto_matched)).toHaveLength(2);
  expect(data.members.find((m:{id:string})=>m.id===members[1]).paid_krw).toBe('900');
  await page.goto('/dashboard');
  await expect(widget.locator('.dues-metrics')).toContainText(Number(initial.today.slice(8))>1?'100원':'0원');
  await expect(widget.locator('.dues-metrics')).not.toContainText('—');
  await page.getByRole('button',{name:'회비 미납 현황 내용에 맞추기',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('자동 저장');
  await widget.screenshot({path:'../../var/dues-auto-widget.png'});
});
