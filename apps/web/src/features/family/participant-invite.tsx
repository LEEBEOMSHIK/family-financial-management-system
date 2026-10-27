'use client';
import { useState } from 'react';
import { useSession } from '../../components/app-shell';
import { Button } from '../../components/ui/Button';
import { api } from '../../lib/api';
import type { components } from '../../generated/api';
import { dateLabel } from '../documents/document-shared';

export function ParticipantInvite({id,name}:{id:string;name:string}) {
  const session=useSession(); const [busy,setBusy]=useState(false); const [error,setError]=useState('');
  const [invitation,setInvitation]=useState<components['schemas']['InvitationResponse'] | null>(null);
  async function invite() {
    if(!session || busy) return;
    setBusy(true);setError('');
    try {setInvitation(await api(`/families/${session.family_id}/participants/${id}/invite`,{method:'POST',headers:{'X-CSRF-Token':session.csrf_token}}));}
    catch(failure) {setError(failure instanceof Error ? failure.message : '초대를 만들지 못했습니다.');}
    finally {setBusy(false);}
  }
  return <div className="participant-invite"><Button variant="secondary" pending={busy} onClick={invite}>계정 초대</Button>{error && <p role="alert" className="inline-error">{error}</p>}{invitation && <div className="participant-invite-code"><p>{name}님의 기존 회비 기록에 연결되는 초대입니다. 아래 코드를 본인에게 전달해 가입 화면에서 입력하도록 안내하세요.</p><label className="fl-field">{name} 초대 코드<input className="fl-input" readOnly value={invitation.invite_token} onFocus={e=>e.currentTarget.select()}/></label><p className="small muted">만료 {dateLabel(invitation.expires_at)} · 가입 주소 /register · 자동 발송하지 않습니다.</p><Button variant="ghost" onClick={()=>setInvitation(null)}>초대 코드 닫기</Button></div>}</div>;
}
