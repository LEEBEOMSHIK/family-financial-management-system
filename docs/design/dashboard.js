'use strict';
// Synthetic review data only. Amounts stay integer strings/BigInt.
const rows = [
  {month:'8월',income:'600000',expense:'300000',balance:'2300000'},
  {month:'9월',income:'500000',expense:'650000',balance:'2150000'},
  {month:'10월',income:'500000',expense:'200000',balance:'2450000'}
];
const transactions = [
  {date:'10. 22.',title:'10월 회비',amount:'500000',direction:'입금',note:'합성 회비 입금 합계 · 실제 개인별 납부 정보를 포함하지 않습니다.'},
  {date:'10. 18.',title:'가족 모임 식비',amount:'80000',direction:'출금',note:'합성 거래 · 영수증 연결 예시 · 은행 거래 확인 완료'},
  {date:'10. 12.',title:'행사 준비비',amount:'120000',direction:'출금',note:'합성 거래 · 송금 기록과 은행 거래 연결 확인 필요'},
  {date:'9. 20.',title:'가족 여행 준비',amount:'650000',direction:'출금',note:'합성 거래 · 여행 준비 지출'},
  {date:'9. 10.',title:'9월 회비',amount:'500000',direction:'입금',note:'합성 회비 입금 합계'},
  {date:'8. 20.',title:'가족 모임 식비',amount:'300000',direction:'출금',note:'합성 거래 · 가족 모임 식비'},
  {date:'8. 10.',title:'8월 회비',amount:'600000',direction:'입금',note:'합성 회비 입금 합계'}
];
const money = value => BigInt(value).toLocaleString('ko-KR')+'원';
const total = (data,key) => data.reduce((sum,row)=>sum+BigInt(row[key]),0n);
const el = id => document.getElementById(id);
function render(){
  const quarter = el('period').value === 'quarter';
  const data = quarter ? rows : rows.slice(2);
  const income=total(data,'income'), expense=total(data,'expense'), net=income-expense;
  el('income').textContent=money(income); el('expense').textContent=money(expense);
  el('net').textContent=(net>=0n?'+':'−')+money(net<0n?-net:net);
  document.querySelectorAll('.period-label').forEach(node=>node.textContent=quarter?'8–10월':'10월');
  // Only bounded, rounded pixel coordinates are converted to Number, never money.
  const y = amount => 190-Number(BigInt(amount)*150n/3000000n);
  const xs = data.length===1?[270]:[100,270,440];
  let svg='<svg viewBox="0 0 540 235" role="img" aria-labelledby="chart-title chart-desc"><title id="chart-title">수입·지출과 장부 잔액</title><desc id="chart-desc">단위 만원. 아래 차트 데이터 표에서 정확한 금액을 확인할 수 있습니다. 10월 잔액은 23일 기준입니다.</desc>';
  [0,100,200,300].forEach(v=>{const py=190-v/2;svg+=`<line x1="44" x2="520" y1="${py}" y2="${py}" stroke="var(--color-border)"/><text x="4" y="${py+4}" font-size="12" fill="var(--color-muted)">${v}</text>`;});
  data.forEach((r,i)=>{const x=xs[i];svg+=`<rect x="${x-32}" y="${y(r.income)}" width="25" height="${190-y(r.income)}" rx="4" fill="var(--color-brand-blue)" stroke="var(--color-primary)"/><rect x="${x+7}" y="${y(r.expense)}" width="25" height="${190-y(r.expense)}" rx="4" fill="var(--color-brand-pink)" stroke="var(--color-accent)"/><text x="${x}" y="218" text-anchor="middle" font-size="14" fill="var(--color-text)">${r.month}</text>`;});
  svg+=`<polyline points="${data.map((r,i)=>`${xs[i]},${y(r.balance)}`).join(' ')}" fill="none" stroke="var(--color-text)" stroke-width="2"/>`;
  data.forEach((r,i)=>{svg+=`<circle cx="${xs[i]}" cy="${y(r.balance)}" r="4" fill="var(--color-text)"/><text x="${xs[i]}" y="${y(r.balance)-12}" text-anchor="middle" font-size="13" fill="var(--color-text)">${BigInt(r.balance)/10000n}</text>`;});
  el('flow-chart').innerHTML=svg+'</svg>';
  el('chart-data').innerHTML=data.map(r=>`<tr><th scope="row">${r.month}</th><td>${money(r.income)}</td><td>${money(r.expense)}</td><td>${money(r.balance)}</td></tr>`).join('');
  const categories=quarter?[['가족 여행','650000'],['모임 식비','380000'],['행사 준비','120000']]:[['행사 준비','120000'],['모임 식비','80000']];
  el('categories').innerHTML=categories.map(([label,amount])=>{const percent=BigInt(amount)*100n/expense;return `<div class="category"><div class="category-label"><span>${label}</span><strong>${money(amount)} · ${percent}%</strong></div><div class="bar-track" aria-hidden="true"><div class="bar-fill" style="width:${percent}%"></div></div></div>`;}).join('');
  el('transactions').innerHTML=(quarter?transactions:transactions.slice(0,3)).map(t=>`<details class="transaction"><summary><small>2026. ${t.date}</small><span>${t.title}</span><strong>${t.direction} ${t.direction==='입금'?'+':'−'}${money(t.amount)}</strong></summary><p>${t.note}</p></details>`).join('');
}
el('period').addEventListener('change',render);
el('view-mode').addEventListener('change',()=>{document.querySelectorAll('.admin-only').forEach(node=>node.hidden=el('view-mode').value!=='admin');});
document.querySelectorAll('a[href="#task-dues"],a[href="#task-vote"]').forEach(a=>a.addEventListener('click',()=>{document.querySelector(a.getAttribute('href')).open=true;}));
render();
