'use client';
import Link from 'next/link';
import { Button } from '../../components/ui/Button';
import { dateLabel } from '../documents/document-shared';
import { useSession } from '../../components/app-shell';
import { Money } from '../../components/ui/Money';
import { Failed, Loading } from '../../components/resource-state';
import { useResource } from '../../lib/use-resource';
import type { Dashboard } from '../../lib/api';
import { TransactionList } from '../transactions/transaction-list';
import { DuesSummary } from '../family/dues-summary';
import { SupportWidget } from './support-widget';
import { PaymentTasks } from './payment-tasks';
import { CashFlowWidget } from './cash-flow-widget';
import { DashboardWorkspace } from './dashboard-workspace';

export function DashboardView() {
  const session = useSession();
  const { data, error, loading, retry, refresh } = useResource<Dashboard>(session ? `/families/${session.family_id}/dashboard` : null, true);
  return <>
    <div className="page-title"><div><p className="eyebrow">OVERVIEW</p><h1>우리 가족의 돈, 한눈에</h1><p className="muted">함께 모은 돈과 최근 사용 내역을 확인하세요.</p></div><Link className="section-link" href="/transactions">상세 입출금 보기 <span aria-hidden="true">→</span></Link></div>
    {loading ? <Loading/> : error ? <Failed message={error} retry={retry}/> : data && <>
      <div className="data-notice">{data.data_mode === 'synthetic' ? '개발용 합성 자료 · ' : ''}{data.source} · {data.data_mode === 'bank_import' ? '파일 요청시각' : '기준'} {dateLabel(data.as_of)} (한국 시간){data.data_mode === 'bank_import' && <p className="small">집계 기간 · {data.summary_start} ~ {data.summary_end}<br/>동기화된 자료 범위 · {(data.coverage ?? []).join(' / ')}<br/>등록된 거래만 집계합니다. 범위 밖 자료는 포함되지 않으며 은행 실시간 조회가 아닙니다.</p>}<Button variant="ghost" onClick={refresh}>최신 자료 새로고침</Button></div>
      <DashboardWorkspace widgets={{
        support: <SupportWidget/>,
        tasks: <PaymentTasks/>,
        dues: <DuesSummary/>,
        balance: <section className="fl-card balance-card"><h2>{data.data_mode === 'bank_import' ? '최근 확인 통장 잔액' : '함께 모은 장부 잔액'}</h2><div className="balance-number" data-testid="balance"><MoneyOrUnknown value={data.balance_krw}/></div><p className="muted small">{data.balance_as_of ? `${dateLabel(data.balance_as_of)} 거래 후 잔액` : data.data_mode === 'bank_import' ? '잔액을 확인할 거래가 없습니다.' : '거래 자료 기준 · 은행 실시간 잔액이 아닙니다.'}</p></section>,
        summary: <section className="fl-card"><h2>{data.summary_start ? `${data.summary_start.slice(0, 7)} 수입과 지출` : '최근 기준 월 수입과 지출'}</h2><div className="income-expense"><div><span><i className="legend income"/>수입</span><div data-testid="income"><Money amountKrw={data.income_krw}/></div></div><div><span><i className="legend expense"/>지출</span><div><Money amountKrw={data.expense_krw}/></div></div></div><div className="net-row">순증감 <Money amountKrw={data.net_krw} showPositiveSign/></div></section>,
        flow: <CashFlowWidget/>,
        categories: <section className="fl-card"><h2>어디에 사용했나요?</h2>{data.categories.length ? data.categories.map(category => <div className="category" key={category.label}><div><span>{category.label}</span><Money amountKrw={category.amount_krw}/></div><div className="bar-track"><div className="bar-fill" style={{ width: `${BigInt(data.expense_krw) > 0n ? BigInt(category.amount_krw) * 100n / BigInt(data.expense_krw) : 0n}%` }}/></div></div>) : <p className="muted">최근 기준 월에 지출이 없습니다.</p>}<div className="commitment"><h3>승인된 지급 예정</h3><Money amountKrw={data.approved_commitments_krw}/><p className="small muted">{data.data_mode === 'bank_import' ? '승인 후 송금 완료 기록이 없는 요청 합계입니다. 통장 잔액에서 차감하지 않습니다.' : '아직 출금되지 않은 금액으로, 장부 잔액과 구분합니다.'}</p></div></section>,
        recent: <section className="fl-card"><div className="section-heading"><div><h2>최근 입출금</h2><p className="small muted">공동통장의 최근 움직임을 확인하세요.</p></div><Link className="section-link" href="/transactions">전체 내역 보기 <span aria-hidden="true">→</span></Link></div><TransactionList items={data.recent_transactions}/></section>
      }}/>
    </>}
  </>;
}

function MoneyOrUnknown({ value }: { value: string | null }) { return value === null ? <span>확인할 자료 없음</span> : <Money amountKrw={value}/>; }
