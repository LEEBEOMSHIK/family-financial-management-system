'use client';
import { useState } from 'react';
import { useSession } from '../../components/app-shell';
import { Button } from '../../components/ui/Button';
import { api } from '../../lib/api';
import type { components } from '../../generated/api';

export function InvitationPanel() {
  const session = useSession();
  const [invitation, setInvitation] = useState<components['schemas']['InvitationResponse'] | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function create() {
    if (!session || busy) return;
    setBusy(true); setMessage(''); setInvitation(null);
    try {
      setInvitation(await api(`/families/${session.family_id}/invitations`, { method: 'POST', headers: { 'X-CSRF-Token': session.csrf_token } }));
    } catch (error) { setMessage(error instanceof Error ? error.message : '초대를 만들지 못했습니다.'); }
    finally { setBusy(false); }
  }
  return <section className="fl-card"><h2>가족 초대</h2><p className="muted">가족 한 명에게 초대 코드를 전달하세요. 가입하면 일반사용자로 등록되며, 필요한 역할은 이 화면에서 지정합니다.</p>
    <Button pending={busy} onClick={create}>초대 코드 만들기</Button>
    {invitation && <div className="invitation-result"><label className="fl-field">초대 코드<input className="fl-input" readOnly value={invitation.invite_token} onFocus={e => e.target.select()}/></label><p className="small muted">1회 사용 · {new Date(invitation.expires_at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}까지 (한국 시간)</p><p>가입 화면: <a href="/register">계정 만들기</a></p><Button variant="secondary" onClick={async () => { try { await navigator.clipboard.writeText(invitation.invite_token); setMessage('초대 코드를 복사했습니다.'); } catch { setMessage('코드를 선택해 직접 복사해 주세요.'); } }}>코드 복사</Button></div>}
    {message && <p role="status">{message}</p>}
  </section>;
}
