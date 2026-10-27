'use client';
import type { FormEvent } from 'react';
import { Button } from '../../components/ui/Button';
import { Money } from '../../components/ui/Money';
import { dateLabel } from '../documents/document-shared';
import type { Command, Overview } from './dues-shared';
const reasons: Record<string,string>={name_mismatch:'이름 불일치',ambiguous_name:'동명이인',policy_not_configured:'회비 또는 마감일 미설정',reversed:'이전 연결 취소됨',awaiting_match:'자동 확인 대기'};
export function DepositReview({data,busy,submit,reconcile}:{data:Overview;busy:boolean;submit:(command:Omit<Command,'operation_id'>)=>Promise<void>;reconcile:()=>Promise<void>}) {
  function link(event:FormEvent<HTMLFormElement>,transaction:string) {
    event.preventDefault();
    const member=new FormData(event.currentTarget).get('member');
    if(typeof member==='string' && member) void submit({kind:'payment',month:data.month,member_id:member,transaction_id:transaction});
  }
  return <section className="fl-card dues-settings"><div className="section-heading"><h2>입금 연결 확인</h2><Button variant="secondary" pending={busy} onClick={reconcile}>입금 자동 확인</Button></div>
    <p className="muted">입금 내용과 구성원 이름이 정확히 일치하면 입금한 달의 회비로 자동 합산합니다. 초과 입금은 다음 달로 넘기지 않습니다.</p>
    {data.matching_review_count>0 ? <><p>확인 필요 {data.matching_review_count}건 · 미연결 입금이 있으면 실제 미납을 확정하지 않습니다.</p><ul className="dues-history">{data.review_deposits.map(deposit=><li key={deposit.id}><div><strong>{deposit.description}</strong><p><Money amountKrw={deposit.amount_krw}/> · {dateLabel(deposit.occurred_at)}</p><span className="dues-chip">{reasons[deposit.reason]}</span></div><form className="dues-review-form" onSubmit={event=>link(event,deposit.id)}><label className="fl-field">연결할 구성원<select name="member" className="fl-input" required defaultValue="" disabled={busy || !data.due_day}><option value="">구성원 선택</option>{data.members.filter(m=>m.amount_krw!==null).map(m=><option key={m.id} value={m.id}>{m.name} · 월 회비 {m.amount_krw}원</option>)}</select></label><Button type="submit" disabled={busy || !data.due_day}>회비에 연결</Button></form></li>)}</ul>{data.matching_review_count>data.review_deposits.length && <p>최근 목록 중 100건을 표시합니다. 처리 후 다음 내역을 확인할 수 있습니다.</p>}</> : <p className="muted">조회 월에 연결 확인이 필요한 입금이 없습니다.</p>}
  </section>;
}
