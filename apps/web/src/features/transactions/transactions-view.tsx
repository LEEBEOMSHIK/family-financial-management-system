'use client';
import { useTransactionPreferences } from './view-preferences';
import { useState } from 'react';
import { useSession } from '../../components/app-shell';
import { useResource } from '../../lib/use-resource';
import type { Transactions } from '../../lib/api';
import { Failed, Loading } from '../../components/resource-state';
import { TransactionList } from './transaction-list';
import { Select } from '../../components/ui/Select';
import { Money } from '../../components/ui/Money';
import { Button } from '../../components/ui/Button';
import { BankDataFreshness } from '../documents/bank-data-freshness';

export function TransactionsView() {
  const session = useSession(); const [period, setPeriod] = useState('month'); const [direction, setDirection] = useState('all');
  const [start, setStart] = useState(''); const [end, setEnd] = useState(''); const [offset, setOffset] = useState(0);
  const preferences=useTransactionPreferences(session?.family_id,session?.user.id);
  const {limit,showTotals}=preferences;
  const query = new URLSearchParams({period, direction, offset: String(offset),limit:String(limit)});
  if (start) query.set('start_on', start); if (end) query.set('end_on', end);
  const resource = useResource<Transactions>(session && preferences.ready ? `/families/${session.family_id}/transactions?${query}` : null);
  const [dataMode, setDataMode] = useState<Transactions['data_mode']>('synthetic');
  if (resource.data && resource.data.data_mode !== dataMode) setDataMode(resource.data.data_mode);
  const real = dataMode === 'bank_import';
  if(!preferences.ready)return <Loading/>;
  return <><h1>입출금 내역</h1><p className="muted">기간과 입출금 구분으로 필요한 기록을 찾아보세요.</p><div className="filters">
    {real ? <><label className="fl-field">시작일<input className="fl-input" type="date" value={start} onChange={e => { setStart(e.target.value); setOffset(0); }}/></label><label className="fl-field">종료일<input className="fl-input" type="date" value={end} onChange={e => { setEnd(e.target.value); setOffset(0); }}/></label><Button variant="ghost" onClick={() => { setStart(''); setEnd(''); setOffset(0); }}>전체 기간</Button></> : <Select label="조회 기간" value={period} onChange={value=>{setPeriod(value);setOffset(0);}} options={[{value:'month',label:'2026년 10월'},{value:'quarter',label:'최근 3개월 (8–10월)'}]}/>}
    <Select label="입출금 구분" value={direction} onChange={value => { setDirection(value); setOffset(0); }} options={[{value:'all',label:'전체'},{value:'income',label:'입금'},{value:'expense',label:'출금'}]}/>
    <label className="fl-field">페이지당 건수<select className="fl-input" value={limit} onChange={event=>{preferences.update({limit:Number(event.target.value)});setOffset(0);}}>{[20,50,100].map(value=><option value={value} key={value}>{value}건씩 보기</option>)}</select></label>
    <label className="transaction-totals-toggle"><input type="checkbox" role="switch" checked={showTotals} onChange={event=>preferences.update({showTotals:event.target.checked})} aria-controls="transaction-totals"/>합계 표시</label></div>
    {preferences.error&&<p role="status" className="muted">{preferences.error}</p>}
    {resource.loading ? <Loading/> : resource.error ? <Failed message={resource.error} retry={resource.retry}/> : resource.data && <section className="fl-card"><p className="small muted">{real ? '카카오뱅크 업로드 자료' : '합성 거래 자료'} · {resource.data.total ?? resource.data.items.length}건</p>
      {real && <BankDataFreshness lastSyncedAt={resource.data.last_synced_at} dataThrough={resource.data.data_through}/>}
      {real && <p className="small muted">자세한 내용이나 증빙이 필요하면 총무·관리자에게 문의해 주세요.</p>}
      {showTotals&&<div id="transaction-totals" className="transaction-totals"><p className="small muted">현재 조회 조건 전체 {resource.data.total ?? 0}건 기준 · 페이지와 무관한 합계</p><dl><div><dt>입금 합계</dt><dd><Money amountKrw={resource.data.income_krw}/></dd></div><div><dt>출금 합계</dt><dd><Money amountKrw={resource.data.expense_krw}/></dd></div><div><dt>입출금 차액</dt><dd><Money amountKrw={resource.data.net_krw} showPositiveSign/></dd></div></dl></div>}
      <TransactionList items={resource.data.items}/>
      {(resource.data.total ?? 0) > limit && <nav className="document-pagination" aria-label="거래 페이지"><Button variant="secondary" disabled={offset === 0} onClick={() => setOffset(value => Math.max(0, value-limit))}>이전</Button><span>{Math.floor(offset/limit)+1} / {Math.ceil((resource.data.total ?? 0)/limit)}</span><Button variant="secondary" disabled={offset+limit >= (resource.data.total ?? 0)} onClick={() => setOffset(value => value+limit)}>다음</Button></nav>}
    </section>}
  </>;
}
