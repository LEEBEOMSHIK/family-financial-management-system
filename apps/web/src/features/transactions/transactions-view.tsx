'use client';
import { useState } from 'react';
import { useSession } from '../../components/app-shell';
import { useResource } from '../../lib/use-resource';
import type { Transactions } from '../../lib/api';
import { Failed, Loading } from '../../components/resource-state';
import { TransactionList } from './transaction-list';
import { Select } from '../../components/ui/Select';

export function TransactionsView() {
  const session = useSession(); const [period, setPeriod] = useState('month'); const [direction, setDirection] = useState('all');
  const resource = useResource<Transactions>(session ? `/families/${session.family_id}/transactions?period=${period}&direction=${direction}` : null);
  return <><h1>입출금 내역</h1><p className="muted">기간과 입출금 구분으로 필요한 기록을 찾아보세요.</p><div className="filters"><Select label="조회 기간" value={period} onChange={setPeriod} options={[{value:'month',label:'2026년 10월'},{value:'quarter',label:'최근 3개월 (8–10월)'}]}/><Select label="입출금 구분" value={direction} onChange={setDirection} options={[{value:'all',label:'전체'},{value:'income',label:'입금'},{value:'expense',label:'출금'}]}/></div>
    {resource.loading ? <Loading/> : resource.error ? <Failed message={resource.error} retry={resource.retry}/> : resource.data && <section className="fl-card"><p className="small muted">합성 거래 자료 · {resource.data.items.length}건</p><TransactionList items={resource.data.items}/></section>}
  </>;
}
