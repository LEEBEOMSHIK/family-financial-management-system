'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useSession } from '../../components/app-shell';
import { Money } from '../../components/ui/Money';
import { Failed, Loading } from '../../components/resource-state';
import { useResource } from '../../lib/use-resource';
import type { Dashboard } from '../../lib/api';
import { TransactionList } from '../transactions/transaction-list';
import { Select } from '../../components/ui/Select';
import { PaymentTasks } from './payment-tasks';
import { DashboardWorkspace } from './dashboard-workspace';

export function DashboardView() {
  const session = useSession(); const [period, setPeriod] = useState('month'); const [editing, setEditing] = useState(false);
  const { data, error, loading, retry } = useResource<Dashboard>(session ? `/families/${session.family_id}/dashboard?period=${period}` : null);
  return <>
    <div className="page-title"><div><p className="eyebrow">OVERVIEW</p><h1>우리 가족의 돈, 한눈에</h1><p className="muted">함께 모은 돈과 사용 내역을 확인하세요.</p></div></div>
    <fieldset disabled={editing} className="dashboard-toolbar dashboard-period"><Select label="조회 기간" value={period} onChange={setPeriod} options={[{value:'month',label:'2026년 10월'},{value:'quarter',label:'최근 3개월 (8–10월)'}]}/><span className="toolbar-note">가족 공동통장 · 원화 KRW{editing && ' · 배치 저장 후 조회 기간 변경 가능'}</span></fieldset>
    {loading ? <Loading/> : error ? <Failed message={error} retry={retry}/> : data && <>
      <div className="data-notice">개발용 합성 자료 · {data.source} · 기준 {new Date(data.as_of).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })} (한국 시간)</div>
      <DashboardWorkspace onEditingChange={setEditing} widgets={{
        approval: <PaymentTasks kind="approval"/>,
        payment: <PaymentTasks kind="payment"/>,
        balance: <section className="fl-card balance-card"><h2>함께 모은 장부 잔액</h2><div className="balance-number" data-testid="balance"><Money amountKrw={data.balance_krw}/></div><p className="muted small">거래 자료 기준 · 은행 실시간 잔액이 아닙니다.</p></section>,
        summary: <section className="fl-card"><h2>기간 내 수입과 지출</h2><div className="income-expense"><div><span><i className="legend income"/>수입</span><div data-testid="income"><Money amountKrw={data.income_krw}/></div></div><div><span><i className="legend expense"/>지출</span><div><Money amountKrw={data.expense_krw}/></div></div></div><div className="net-row">순증감 <Money amountKrw={data.net_krw} showPositiveSign/></div></section>,
        flow: <section className="fl-card"><div className="section-heading"><h2>우리 가족 자금 흐름</h2><div className="chart-legend"><span><i className="legend income"/>수입</span><span><i className="legend expense"/>지출</span><span><i className="legend balance"/>잔액</span></div></div><p className="small muted">각 월 마지막 확인 잔액 기준</p><FlowChart rows={data.monthly}/><details><summary>금액을 표로 확인하기</summary><div className="table-scroll"><table className="fl-table"><caption className="sr-only">월별 자금 흐름</caption><thead><tr><th scope="col">월</th><th scope="col">수입</th><th scope="col">지출</th><th scope="col">잔액</th></tr></thead><tbody>{data.monthly.map(row => <tr key={row.month}><th scope="row">{row.month}</th><td><Money amountKrw={row.income_krw}/></td><td><Money amountKrw={row.expense_krw}/></td><td><Money amountKrw={row.balance_krw}/></td></tr>)}</tbody></table></div></details></section>,
        categories: <section className="fl-card"><h2>어디에 사용했나요?</h2>{data.categories.length ? data.categories.map(category => <div className="category" key={category.label}><div><span>{category.label}</span><Money amountKrw={category.amount_krw}/></div><div className="bar-track"><div className="bar-fill" style={{ width: `${BigInt(data.expense_krw) > 0n ? BigInt(category.amount_krw) * 100n / BigInt(data.expense_krw) : 0n}%` }}/></div></div>) : <p className="muted">이 기간에 지출이 없습니다.</p>}<div className="commitment"><h3>승인된 지급 예정</h3><Money amountKrw={data.approved_commitments_krw}/><p className="small muted">아직 출금되지 않은 금액으로, 장부 잔액과 구분합니다.</p></div></section>,
        recent: <section className="fl-card"><div className="section-heading"><div><h2>최근 입출금</h2><p className="small muted">공동통장의 최근 움직임을 확인하세요.</p></div><Link className="section-link" href="/transactions">전체 내역 보기 <span aria-hidden="true">→</span></Link></div><TransactionList items={data.recent_transactions}/></section>
      }}/>
    </>}
  </>;
}

function FlowChart({ rows }: { rows: Dashboard['monthly'] }) {
  const maximum = rows.reduce((max, row) => [row.balance_krw, row.income_krw, row.expense_krw].reduce((m, value) => BigInt(value) > m ? BigInt(value) : m, max), 1n);
  // Convert only bounded pixel ratios; monetary values never become Number.
  const y = (value: string) => 190 - Number(BigInt(value) * 150n / maximum);
  const x = (index: number) => 60 + (index + 0.5) * 420 / Math.max(rows.length, 1);
  return <><svg className="flow-chart" viewBox="0 0 540 205" role="img" aria-label="월별 수입과 지출, 잔액 추이. 정확한 금액은 아래 표에서 확인할 수 있습니다.">
    <line x1="35" x2="520" y1="190" y2="190" stroke="var(--color-border)"/>
    {[40,90,140].map(y => <line key={y} x1="35" x2="520" y1={y} y2={y} stroke="var(--color-border)" strokeDasharray="3 5"/>)}
    <polyline points={rows.map((row, i) => `${x(i)},${y(row.balance_krw)}`).join(' ')} fill="none" stroke="var(--color-text)" strokeWidth="2"/>
    {rows.map((row, i) => <g key={row.month}><rect x={x(i)-30} y={y(row.income_krw)} width="24" height={190-y(row.income_krw)} fill="var(--color-brand-blue)" stroke="var(--color-primary)" rx="4"/><rect x={x(i)+6} y={y(row.expense_krw)} width="24" height={190-y(row.expense_krw)} fill="var(--color-brand-pink)" stroke="var(--color-accent)" rx="4"/><circle cx={x(i)} cy={y(row.balance_krw)} r="4" fill="var(--color-text)"/></g>)}
  </svg><div className="chart-months">{rows.map(row => <span key={row.month}>{row.month}</span>)}</div></>;
}
