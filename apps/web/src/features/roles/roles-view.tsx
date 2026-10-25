'use client';
import { useState } from 'react';
import type { components } from '../../generated/api';
import { useSession } from '../../components/app-shell';
import { Select } from '../../components/ui/Select';
import { Button } from '../../components/ui/Button';
import { Failed, Loading } from '../../components/resource-state';
import { api } from '../../lib/api';
import { useResource } from '../../lib/use-resource';
import { InvitationPanel } from './invitation-panel';

type Roles = components['schemas']['RolesResponse'];
type Role = components['schemas']['RoleMember']['role'];
const labels = { member: '일반사용자', treasurer: '총무', super_admin: '총괄관리자' };
const options = Object.entries(labels).map(([value, label]) => ({ value, label }));
function name(id: string) { return id === 'synthetic-member' ? '개발 구성원' : id === 'synthetic-treasurer' ? '개발 총무 계정' : id === 'synthetic-super_admin' ? '개발 총괄관리자 계정' : id; }

export function RolesView() {
  const session = useSession();
  const allowed = session?.capabilities.includes('manage_roles');
  const path = session ? `/families/${session.family_id}/roles` : '';
  const resource = useResource<Roles>(allowed ? path : null);
  const memberName = (id: string) => resource.data?.members.find(member => member.user_id === id)?.display_name || name(id);
  const [target, setTarget] = useState<Roles['members'][number] | null>(null);
  const [role, setRole] = useState<Role>('member');
  const [reason, setReason] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [failure, setFailure] = useState('');
  async function save() {
    if (!session || !resource.data || !target || busy) return;
    setBusy(true); setFailure('');
    try {
      await api<Roles>(path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': session.csrf_token },
        body: JSON.stringify({ user_id: target.user_id, role, reason: reason.trim(), expected_version: resource.data.version }) });
      if (target.user_id === session.user.id) { location.reload(); return; }
      setTarget(null); setConfirming(false); setMessage('권한을 변경하고 이력을 저장했습니다.'); resource.retry();
    } catch (error) {
      setFailure(`${error instanceof Error ? error.message : '변경 결과를 확인하지 못했습니다.'} 목록을 새로고침해 현재 역할과 이력을 확인하세요.`);
      setTarget(null); setConfirming(false); resource.retry();
    } finally { setBusy(false); }
  }
  if (!allowed) return <section className="fl-card"><h1>접근 권한이 없습니다</h1><p>총괄관리자만 사용자 권한을 관리할 수 있습니다.</p></section>;
  return <><h1>권한 관리</h1><p className="muted">구성원의 역할을 지정하고 변경 이력을 확인합니다.</p>
    <InvitationPanel/>
    <p className="small muted">역할 변경은 다음 요청부터 적용됩니다. 마지막 총괄관리자의 권한은 해제할 수 없습니다.</p>
    {message && <p role="status">{message}</p>}{failure && <p role="alert" className="inline-error">{failure}</p>}
    {resource.loading ? <Loading/> : resource.error ? <Failed message={resource.error} retry={resource.retry}/> : resource.data && <>
      <section className="fl-card"><div className="section-heading"><h2>구성원별 역할</h2><Button variant="secondary" disabled={busy} onClick={() => { setTarget(null); resource.retry(); }}>목록 새로고침</Button></div>
        <div className="table-scroll"><table className="fl-table roles-members"><caption className="sr-only">구성원 권한</caption><thead><tr><th scope="col">구성원</th><th scope="col">현재 역할</th><th scope="col">관리</th></tr></thead><tbody>{resource.data.members.map(member => <tr key={member.user_id}><th scope="row">{memberName(member.user_id)}{member.user_id === session?.user.id ? ' (나)' : ''}</th><td>{labels[member.role]}</td><td><Button variant="secondary" disabled={busy} onClick={() => { setTarget(member); setRole(member.role); setReason(''); setConfirming(false); setFailure(''); setMessage(''); }}>변경<span className="sr-only">: {memberName(member.user_id)}</span></Button></td></tr>)}</tbody></table></div>
      </section>
      {target && <section className="fl-card role-editor" aria-label="역할 변경"><h2>{memberName(target.user_id)} 역할 변경</h2>
        {confirming ? <><p>{labels[target.role]} → <strong>{labels[role]}</strong></p><p>변경 사유: {reason}</p><p>저장하면 기존 로그인 세션에도 다음 요청부터 적용됩니다.</p><Button pending={busy} onClick={save}>변경 확정</Button><Button variant="ghost" disabled={busy} onClick={() => setConfirming(false)}>돌아가기</Button></> : <>
          <Select label="변경할 역할" value={role} options={options} onChange={value => setRole(value as Role)}/>
          <label className="fl-field">변경 사유<input className="fl-input" maxLength={200} value={reason} onChange={event => setReason(event.target.value)} placeholder="역할을 변경하는 이유를 입력하세요"/></label>
          <Button disabled={!reason.trim() || role === target.role} onClick={() => setConfirming(true)}>변경 내용 확인</Button><Button variant="ghost" onClick={() => setTarget(null)}>취소</Button></>}
      </section>}
      <section className="fl-card"><h2>권한 변경 이력</h2>{!resource.data.history.length ? <p className="muted">변경 이력이 없습니다.</p> : <div className="table-scroll"><table className="fl-table"><caption className="sr-only">역할 변경 이력</caption><thead><tr><th>시각 (한국 시간)</th><th>대상</th><th>변경</th><th>수행자 / 사유</th></tr></thead><tbody>{[...resource.data.history].reverse().map((event, i) => <tr key={i}><td>{new Date(event.occurred_at).toLocaleString('ko-KR', {timeZone:'Asia/Seoul'})}</td><td>{memberName(event.user_id)}</td><td>{labels[event.before]} → {labels[event.after]}</td><td>{memberName(event.actor_id)}<br/>{event.reason}</td></tr>)}</tbody></table></div>}</section>
    </>}
  </>;
}
