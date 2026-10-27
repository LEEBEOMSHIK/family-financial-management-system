'use client';
import Link from 'next/link';
import { useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '../../components/app-shell';
import { Button } from '../../components/ui/Button';
import { Failed, Loading } from '../../components/resource-state';
import { api } from '../../lib/api';
import { useResource } from '../../lib/use-resource';
import { Amount, type Overview, firstFeeMonth } from './dues-shared';
import { BirthdayPicker, daysInBirthdayMonth, type BirthdayValue } from './birthday-picker';

type Participant = Overview['members'][number];
export function ParticipantCreate({ participantId }: { participantId?: string }) {
  const session=useSession();
  const permitted=session?.capabilities.includes('manage');
  const resource=useResource<Overview>(permitted && session ? `/families/${session.family_id}/dues` : null);
  if(!permitted) return <section className="fl-card"><h1>접근 권한이 없습니다</h1><p>총무 또는 총괄관리자만 구성원을 관리할 수 있습니다.</p></section>;
  if(resource.loading) return <Loading/>;
  if(resource.error || !resource.data) return <Failed message={resource.error || '정보를 불러오지 못했습니다.'} retry={resource.retry}/>;
  const participant=resource.data.members.find(m=>m.id===participantId);
  if(participantId && !participant) return <Failed message="구성원을 찾을 수 없습니다." retry={resource.retry}/>;
  return <ParticipantForm key={`${participantId || 'new'}-${participant?.profile_version || 0}`} data={resource.data} participant={participant}/>;
}
function ParticipantForm({data,participant}:{data:Overview;participant?:Participant}) {
  const session=useSession();const router=useRouter();
  const [calendar,setCalendar]=useState<string>(participant?.birthday?.calendar || 'solar');
  const [birthday,setBirthday]=useState<BirthdayValue|null>(participant?.birthday || null);
  const initialStartsOn=participant?.next_fee_start_on || data.today;
  const initialAmount=participant?.next_fee_amount_krw ?? participant?.amount_krw ?? '';
  const [startsOn,setStartsOn]=useState(initialStartsOn);
  function changeCalendar(value:string){setCalendar(value);if(birthday && birthday.day>daysInBirthdayMonth(value,birthday.month,birthday.year || 2000))setBirthday(null);}
  const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  const operation=useRef<{signature:string;id:string}|null>(null);const locked=useRef(false);
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();if(!session || locked.current)return;
    if(birthday && !birthday.year){setError('생일 달력에서 출생연도까지 선택해 주세요.');return;}
    const form=new FormData(event.currentTarget);
    const amount=String(form.get('amount') || '').trim();
    const feeChanged=data.can_configure && (participant ? amount!==initialAmount || startsOn!==initialStartsOn : !!amount);
    if(feeChanged && !amount){setError('회비를 변경하려면 1원 이상의 금액을 입력해 주세요.');return;}
    const body={name:String(form.get('name') || '').trim(),birthday:birthday ? {...birthday,calendar,leap_month:calendar==='lunar' && form.get('leap')==='on'} : null,...(participant ? {expected_version:participant.profile_version} : {}),...(feeChanged ? {amount_krw:amount,fee_start_on:startsOn,...(participant?.next_fee_id ? {replaces_fee_id:participant.next_fee_id} : {})} : {})};
    const signature=JSON.stringify(body);
    if(operation.current?.signature!==signature)operation.current={signature,id:crypto.randomUUID()};
    locked.current=true;setBusy(true);setError('');
    try {
      await api(`/families/${session.family_id}/participants${participant ? `/${participant.id}/profile` : ''}`,{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':session.csrf_token},body:JSON.stringify({...body,operation_id:operation.current.id})});
      router.replace('/family');
    }catch(failure){setError(failure instanceof Error ? failure.message : '저장하지 못했습니다.');locked.current=false;setBusy(false);}
  }
  return <><div className="page-title page-title-with-actions"><div><h1>{participant ? '구성원 정보 수정' : '구성원 등록'}</h1><p className="muted">기본 정보와 생일을 관리하고, 필요한 경우 회비를 설정하세요.</p></div><Link className="section-link" href="/family">가족 관리로 돌아가기</Link></div>
    <form className="fl-card participant-form participant-form-compact" onSubmit={submit}>
      <fieldset className="participant-inputs" disabled={busy} aria-label="구성원 정보">
        <label className="fl-field">구성원 이름<input className="fl-input" name="name" autoComplete="off" required maxLength={60} defaultValue={participant?.name || ''}/></label>
        <div className="participant-fields"><label className="fl-field">생일 구분<select aria-label="생일 구분" className="fl-input" value={calendar} onChange={e=>changeCalendar(e.target.value)}><option value="solar">양력</option><option value="lunar">음력</option></select></label><BirthdayPicker today={data.today} calendar={calendar} value={birthday} onChange={setBirthday}/></div>
        {calendar==='lunar' && <label className="participant-check"><input type="checkbox" name="leap" defaultChecked={participant?.birthday?.leap_month}/>윤달 생일</label>}
        <p className="small muted">생년월일은 선택 입력입니다. 양력·음력 구분과 출생연도를 함께 보관합니다.</p>
        {participant && <div className="participant-fee-inline"><p>이번 달 회비: <Amount value={participant.amount_krw}/></p>{participant.next_fee_month && <p className="small muted">{participant.next_fee_month}부터 <Amount value={participant.next_fee_amount_krw ?? null}/>{participant.next_fee_start_on && ` · 시작일 ${participant.next_fee_start_on}`}</p>}</div>}
        {data.can_configure ? <><div className="participant-fields"><label className="fl-field">월 회비 (원)<input className="fl-input" name="amount" inputMode="numeric" pattern="[1-9][0-9]*" defaultValue={initialAmount} placeholder="미입력 시 회비 미설정"/></label><label className="fl-field">회비 시작일<input className="fl-input" name="feeStartOn" type="date" min={`${data.today.slice(0,7)}-01`} value={startsOn} onChange={e=>setStartsOn(e.target.value)} required/></label></div><p className="small muted">{startsOn ? `${participant ? '변경한' : '첫'} 회비는 ${firstFeeMonth(startsOn)}부터 전액 적용됩니다.` : '회비 시작일을 선택해 주세요.'} {participant ? (participant.next_fee_id ? '표시된 적용 예정 회비를 이 설정으로 대체합니다. 값이 같으면 회비는 변경되지 않습니다.' : '기존 회비는 그 전까지 유지됩니다. 금액과 시작일을 그대로 두면 회비는 변경되지 않습니다.') : '시작한 달에는 부과하지 않습니다.'}</p></> : <p className="small muted">월 회비와 시작일은 총괄관리자가 설정합니다.</p>}
        <p className="small muted">공통 납부마감일: {data.due_day ? `매월 ${data.due_day}일 (해당 날짜가 없으면 말일)` : '미설정'}</p>
      </fieldset>
      {error && <p role="alert" className="inline-error">{error}</p>}
      <div className="participant-form-actions"><Button type="submit" pending={busy}>{participant ? '변경사항 저장' : '구성원 등록'}</Button><Link className="fl-button" data-variant="ghost" href="/family">취소</Link></div>
      <p className="small muted">계정 없이 등록되며, 조회 계정은 필요할 때 총괄관리자가 초대합니다.</p>
    </form></>;
}
