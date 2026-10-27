'use client';
import Link from 'next/link';
import { ReminderButton } from './reminder-button';
import { DepositReview } from './deposit-review';
import { ParticipantInvite } from './participant-invite';
import { useState, type FormEvent } from 'react';
import { useSession } from '../../components/app-shell';
import { useResource } from '../../lib/use-resource';
import { Button } from '../../components/ui/Button';
import { Failed, Loading } from '../../components/resource-state';
import { Money } from '../../components/ui/Money';
import { dateLabel } from '../documents/document-shared';
import { ActionNotice, Amount, eventLabels, statusLabels, useDuesAction, type Overview } from './dues-shared';

export function FamilyView() {
  const session = useSession(); const permitted=session?.capabilities.includes('manage');
  const [month,setMonth]=useState(''); const [search,setSearch]=useState(''); const [deadlineDate,setDeadlineDate]=useState('');
  const resource=useResource<Overview>(permitted && session ? `/families/${session.family_id}/dues${month ? `?month=${month}` : ''}` : null,true);
  const action=useDuesAction(resource.refresh); const data=resource.data;
  if (!permitted) return <section className="fl-card"><h1>접근 권한이 없습니다</h1><p>가족 회비 관리는 총무와 총괄관리자만 확인할 수 있습니다.</p></section>;
  function saveDeadline(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if(!data || !deadlineDate) return;
    void action.submit({kind:'deadline',month:deadlineDate.slice(0,7),due_day:Number(deadlineDate.slice(8,10))});
  }
  return <><div className="page-title page-title-with-actions"><div><h1>가족 관리</h1><p className="muted">참여 구성원과 월별 회비 납부 현황을 확인하세요.</p></div><Link className="fl-button" data-variant="primary" href="/family/register">구성원 등록</Link></div>
    <div className="filters dues-filters"><label className="fl-field">조회 월<input className="fl-input" type="month" value={month || data?.month || ''} onChange={e=>setMonth(e.target.value)}/></label><label className="fl-field">구성원 검색<input className="fl-input" type="search" placeholder="이름으로 검색" value={search} onChange={e=>setSearch(e.target.value)}/></label></div>
    <ActionNotice {...action}/>
    {resource.loading ? <Loading/> : resource.error ? <Failed message={resource.error} retry={resource.retry}/> : data && <>
      <p className="list-summary">총 {data.members.filter(m=>m.name.includes(search)).length}명 · 현재 참여 구성원 기준</p>
      <div className="dues-summary"><section className="fl-card"><h2>공통 납부 마감</h2><p>{data.due_on || '마감일 미설정'}</p></section><section className="fl-card"><h2>실제 미납</h2><p>{data.overdue_count===null ? '확인 필요' : <>{data.overdue_count}명 · <Money amountKrw={data.overdue_krw!}/></>}</p><p className="small muted">남은 납부 {data.outstanding_count}명 · <Money amountKrw={data.remaining_krw}/></p><p className="small muted">회비 미설정 {data.unconfigured_count}명 제외</p></section></div>
      <p className="data-notice">은행 자료 조회 종료일: {data.data_through || '등록 자료 없음'} · {data.coverage_complete ? '해당 조회 기간 자료 포함' : '조회 기간 자료가 부족합니다. 입금 여부를 먼저 확인하세요.'}<br/>입금 내용과 구성원 이름이 정확히 일치하는 입금은 해당 월 회비에 자동 반영합니다. 동명이인·이름 불일치는 아래 입금 연결 확인에서 처리하세요.</p>
      <section className="fl-card" data-report-id="family.dues" data-report-label="구성원별 납부 현황" data-report-source="apps/web/src/features/family/family-view.tsx"><h2>구성원별 납부 현황</h2><p className="small muted dues-table-note">납부일은 조회 월의 공통 납부마감일입니다.</p><div className="table-scroll"><table className="fl-table dues-table"><caption className="sr-only">{data.month} 구성원별 회비</caption><thead><tr><th>구성원</th><th>월 회비</th><th>납부일</th><th>확인 입금</th><th>남은 금액</th><th>상태</th><th>관리</th></tr></thead><tbody>{data.members.filter(m=>m.name.includes(search)).map(m=><tr key={m.id} data-report-item={m.id}><th scope="row">{m.name}<span className="small muted">{m.has_account ? '계정 연결됨' : '계정 없음'}</span><span className="small muted">{m.birthday ? `${m.birthday.calendar==='lunar' ? '음력' : '양력'} ${m.birthday.year ? `${m.birthday.year}년 ` : '출생연도 미등록 · '}${m.birthday.leap_month ? '윤달 ' : ''}${m.birthday.month}월 ${m.birthday.day}일` : '생일 미등록'}</span>{m.birthday?.year && <span className="small muted">{Number(data.today.slice(0,4))===m.birthday.year ? `${m.birthday.year}년 출생` : `${data.today.slice(0,4)}년 ${Number(data.today.slice(0,4))-m.birthday.year}번째 생일`}</span>}</th><td data-label="월 회비"><Amount value={m.amount_krw}/>{m.next_fee_month && <p className="small muted">{m.next_fee_month}부터 <Amount value={m.next_fee_amount_krw ?? null}/></p>}</td><td data-label="납부일">{data.due_on ? <time dateTime={data.due_on}>{data.due_on}</time> : <span className="muted">미설정</span>}</td><td data-label="확인 입금"><Money amountKrw={m.paid_krw}/>{BigInt(m.excess_krw)>0n && <p className="small">초과 입금 <Money amountKrw={m.excess_krw}/></p>}</td><td data-label="남은 금액"><Amount value={m.remaining_krw}/></td><td data-label="상태"><span className="dues-status" data-status={m.status}>{m.status==='unconfigured' && m.next_fee_month ? '적용 예정' : statusLabels[m.status]}</span>{m.last_requested_at && <p className="small muted">최근 요청 {dateLabel(m.last_requested_at)} · 미발송</p>}</td><td data-label="관리"><div className="dues-actions"><Link className="fl-button" data-variant="ghost" href={`/family/${m.id}/edit`}>정보 수정</Link><ReminderButton data={data} member={m} busy={action.busy} onRequest={()=>void action.submit({kind:'reminder',month:data.month,member_id:m.id})}/>{data.can_configure && !m.has_account && <ParticipantInvite id={m.id} name={m.name}/>}</div></td></tr>)}</tbody></table></div>{!data.members.filter(m=>m.name.includes(search)).length && <p className="muted">해당 구성원이 없습니다.</p>}<p className="small muted">납부 요청은 내부 기록만 남기며 카카오톡·문자는 발송되지 않습니다. 동일 구성원·월은 하루 한 번 기록합니다.</p></section>
      {data.can_configure && <section className="fl-card dues-settings" id="dues-settings"><h2>공통 납부마감일 설정</h2><p className="muted">총괄관리자 전용 · 현재 월 이후부터 적용하며 이전 월은 변경하지 않습니다. 변경 이력을 보관합니다.</p><form onSubmit={saveDeadline} className="dues-form"><label className="fl-field">공통 납부마감일<input name="deadline" type="date" className="fl-input" min={`${data.today.slice(0,7)}-01`} value={deadlineDate} onChange={e=>setDeadlineDate(e.target.value)} required/></label><Button type="submit" pending={action.busy}>마감일 저장</Button><p className="small muted">{deadlineDate ? `${deadlineDate.slice(0,7)}부터 매월 ${Number(deadlineDate.slice(8,10))}일이 납부마감일입니다.` : '달력에서 날짜를 선택하면 해당 월부터 매월 같은 일이 납부마감일이 됩니다.'} 해당 날짜가 없는 달에는 그 달의 마지막 날을 적용합니다.</p></form>
</section>}
      <DepositReview data={data} busy={action.busy} submit={action.submit} reconcile={action.reconcile}/>
      <section className="fl-card"><h2>설정·납부·요청 이력</h2><p className="small muted">설정 이력과 조회 월 처리 이력 · 최근 100건</p><ul className="dues-history">{data.events.map(e=><li key={e.id}><div><strong>{e.auto_matched ? '입금 자동 연결' : eventLabels[e.kind]}{e.superseded ? ' · 변경 전' : e.reversed ? ' · 취소됨' : ''}</strong><p>{e.starts_on ? `${e.starts_on} 시작 → ${e.month}부터` : e.month} · {e.member_name || '전체 구성원'}{e.amount_krw && <> · <Money amountKrw={e.amount_krw}/></>}{e.due_day && ` · 매월 ${e.due_day}일`}</p><p className="small muted">{e.actor_name} · {dateLabel(e.created_at)}</p></div>{e.kind==='payment' && !e.reversed && <Button variant="secondary" disabled={action.busy} onClick={()=>action.submit({kind:'reversal',month:e.month,payment_id:e.id})}>연결 취소</Button>}</li>)}</ul>{!data.events.length && <p className="muted">기록된 이력이 없습니다.</p>}</section>
    </>}
  </>;
}
