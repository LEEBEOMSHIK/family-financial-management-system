'use client';
import Link from 'next/link';
import { useSession } from '../../components/app-shell';
import { useResource } from '../../lib/use-resource';
import { ReminderButton } from './reminder-button';
import { Money } from '../../components/ui/Money';
import { Failed, Loading } from '../../components/resource-state';
import { ActionNotice, statusLabels, useDuesAction, type Overview } from './dues-shared';

export function DuesSummary() {
  const session=useSession(); const permitted=session?.capabilities.includes('manage');
  const resource=useResource<Overview>(permitted && session ? `/families/${session.family_id}/dues` : null,true);
  const action=useDuesAction(resource.refresh); const data=resource.data;
  if(!permitted) return null;
  const outstanding=data?.members.filter(m=>m.remaining_krw!==null && BigInt(m.remaining_krw)>0n) ?? [];
  const configured = data?.members.filter(m=>m.amount_krw!==null) ?? [];
  const paid = configured.filter(m=>m.status==='paid').length;
  return <section className="fl-card dues-dashboard" aria-label="당월 회비 미납 현황">
    <div className="section-heading"><h2>당월 회비 미납 현황</h2><Link href="/family" className="section-link">가족 관리 →</Link></div>
    <ActionNotice {...action}/>
    {resource.loading ? <Loading/> : resource.error ? <Failed message={resource.error} retry={resource.retry}/> : data && <>
      <div className="dues-period"><span>{data.month} 회비</span><span className="dues-chip">마감 {data.due_on ? <time dateTime={data.due_on}>{data.due_on.slice(5).replace('-', '/')}</time> : '미설정'}</span></div>
      <div className="dues-metrics">
        <div className="dues-metric"><span>미납 인원</span><strong>{data.overdue_count===null ? <span aria-label="확인 필요">—</span> : <>{data.overdue_count}<small>명</small></>}</strong></div>
        <div className="dues-metric"><span>미납 금액</span><strong>{data.overdue_krw===null ? <span aria-label="확인 필요">—</span> : <Money amountKrw={data.overdue_krw}/>}</strong></div>
      </div>
      <p className="small muted">{data.overdue_count===null ? '회비·자료·미연결 입금·마감일 확인 후 미납을 확정합니다.' : '설정된 회비 중 마감일이 지나도 납부되지 않은 금액입니다.'}</p>
      <p className="small">남은 납부 {data.outstanding_count}명 · <Money amountKrw={data.remaining_krw}/> <span className="muted">(마감 전·확인 필요 포함)</span></p>
      {configured.length>0 && <div className="dues-progress"><div><span>납부 확인</span><strong>{paid} / {configured.length}명</strong></div><progress aria-label="회비 설정 구성원 중 납부 완료 인원" value={paid} max={configured.length}/><p className="small muted">회비가 설정된 구성원 기준</p></div>}
      {(data.unconfigured_count>0 || !data.coverage_complete || data.matching_review_count>0) && <div className="dues-cautions">
        {data.unconfigured_count>0 && <Link href="/family"><span aria-hidden="true">ⓘ</span> 회비 미설정 {data.unconfigured_count}명 <span>설정하기 →</span></Link>}
        {data.matching_review_count>0 && <Link href="/family">입금 연결 확인 {data.matching_review_count}건 →</Link>}
        {!data.coverage_complete && <p><span aria-hidden="true">ⓘ</span> 자료 확인 필요 · 입금 여부를 확인하세요.</p>}
      </div>}
      {outstanding.length>0 ? <ul className="dues-people" aria-label="납부 미확인 구성원">{outstanding.slice(0,5).map(m=><li key={m.id}>
        <span className="dues-avatar" aria-hidden="true">{Array.from(m.name)[0]}</span>
        <div className="dues-person"><strong>{m.name}</strong><span className="dues-chip" data-status={m.status}>{statusLabels[m.status]}</span></div>
        <div className="dues-person-action"><strong><Money amountKrw={m.remaining_krw!}/></strong><ReminderButton variant="secondary" data={data} member={m} busy={action.busy} onRequest={()=>void action.submit({kind:'reminder',month:data.month,member_id:m.id})}/></div>
      </li>)}</ul> : <div className="dues-empty"><span aria-hidden="true">{configured.length ? '✓' : '—'}</span><strong>{configured.length ? '납부 미확인 대상이 없습니다' : '회비 설정이 필요합니다'}</strong><p className="small muted">{configured.length ? '설정된 회비의 납부 기록 기준입니다.' : '가족 관리에서 구성원별 월 회비를 설정하세요.'}</p></div>}
      {outstanding.length>5 && <Link className="dues-see-all" href="/family">전체 {outstanding.length}명 확인 →</Link>}
      <footer className="dues-footnote"><p>자료 조회 종료일 {data.data_through || '없음'}</p><p>납부 요청은 내부 기록만 남으며 외부 알림은 발송되지 않습니다.</p></footer>
    </>}
  </section>;
}
