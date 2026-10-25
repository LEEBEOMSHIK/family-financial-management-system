'use client';
import Link from 'next/link';
import { useEffect } from 'react';
import { useSession } from '../../components/app-shell';
import { Button } from '../../components/ui/Button';
import { Money } from '../../components/ui/Money';
import { Failed, Loading } from '../../components/resource-state';
import { useResource } from '../../lib/use-resource';
import type { components } from '../../generated/api';

type Expense = components['schemas']['ExpenseItem'];

function TaskGroup({ kind, items, configured = true }: { kind: 'approval' | 'payment'; items: Expense[]; configured?: boolean }) {
  const title = kind === 'approval' ? '승인 대기' : '송금 대기';
  const total = items.reduce((sum, item) => sum + BigInt(item.amount_krw), 0n).toString();
  return <section className="dashboard-task-group" aria-label={title}>
    <div className="payment-task-summary"><h3>{title} <span className="payment-task-count">{items.length}건</span></h3><div><span className="small muted">대기 금액</span><Money amountKrw={total}/></div></div>
    {kind === 'approval' && !configured && <p className="development-notice">승인 규칙 설정 대기 중입니다. 요청 상세는 검토할 수 있습니다.</p>}
    {items.length ? <ul className="payment-task-list">{items.map(item => <li key={item.id}>
      <Link href={`/expenses?request=${encodeURIComponent(item.id)}`} className="payment-task-link" data-task-kind={kind}>
        <span className="payment-task-icon" aria-hidden="true">{kind === 'approval' ? <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M8 5H5v16h14V5h-3M8 3h8v4H8zM8 14l3 3 5-6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg> : <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M4 7h15m-4-4 4 4-4 4M20 17H5m4-4-4 4 4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>}</span>
        <div className="payment-task-description"><strong>{item.purpose}</strong><div className="payment-task-meta"><span>{item.requester_name}</span><span>희망 지급일 <time dateTime={item.requested_on}>{item.requested_on}</time></span></div></div>
        <div className="payment-task-action"><Money amountKrw={item.amount_krw}/><span className="payment-task-cta">{kind === 'approval' ? '요청 검토' : '송금 처리'} <span aria-hidden="true">→</span></span></div>
      </Link>
    </li>)}</ul> : <p className="payment-task-empty muted">{kind === 'approval' ? '현재 검토할 승인 요청이 없습니다.' : '현재 처리할 송금이 없습니다.'}</p>}
  </section>;
}

export function PaymentTasks({ kind }: { kind: 'approval' | 'payment' }) {
  const session = useSession();
  const resource = useResource<components['schemas']['ExpenseList']>(session ? `/families/${session.family_id}/expenses` : null);
  const { retry } = resource;
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === 'visible') retry(); };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => { window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, [retry]);
  if (!session?.capabilities.includes('manage')) return null;
  const pending = resource.data?.items.filter(item => item.status === 'approved' && !item.payment && item.can_record_payment)
    .sort((a, b) => a.requested_on.localeCompare(b.requested_on) || a.created_at.localeCompare(b.created_at)) ?? [];
  const superAdmin = session.capabilities.includes('manage_roles');
  const approvals = resource.data?.items.filter(item => item.status === 'submitted'
    && item.requester_id !== session.user.id && (!item.requires_super_admin || superAdmin))
    .sort((a, b) => a.requested_on.localeCompare(b.requested_on) || a.created_at.localeCompare(b.created_at)) ?? [];
  const title = kind === 'approval' ? '승인 대기' : '송금 대기';
  return <section className="fl-card payment-tasks task-widget">
    <div className="payment-task-heading"><h2>{title}</h2><Button variant="ghost" className="payment-task-refresh" onClick={retry} aria-label={`${title} 새로고침`}>새로고침</Button></div>
    {resource.loading ? <Loading/> : resource.error ? <Failed message={resource.error} retry={retry}/> : <TaskGroup kind={kind} items={kind === 'approval' ? approvals : pending} configured={resource.data?.approval_configured}/>}
  </section>;
}
