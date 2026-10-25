'use client';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { ThemeControl } from '../../components/theme-control';

export function AccountForm({ register = false, developmentLogin = false }: { register?: boolean; developmentLogin?: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  async function testLogin(profile: string) {
    if (pending) return;
    setPending(true); setError('');
    try {
      await api('/dev/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profile }) });
      router.replace('/dashboard'); router.refresh();
    } catch (failure) { setError(failure instanceof Error ? failure.message : '테스트 로그인에 실패했습니다.'); }
    finally { setPending(false); }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const values = new FormData(event.currentTarget);
    const password = String(values.get('password'));
    if (register && password !== values.get('confirmation')) { setError('비밀번호 확인이 일치하지 않습니다.'); return; }
    const body = { username: String(values.get('username')).trim(), password,
      ...(register ? { display_name: String(values.get('display_name')).trim(), invite_token: String(values.get('invite_token')).trim() } : {}) };
    setPending(true); setError('');
    try {
      await api(`/auth/${register ? 'register' : 'login'}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      router.replace('/dashboard'); router.refresh();
    } catch (failure) { setError(failure instanceof Error ? failure.message : '로그인하지 못했습니다. 잠시 후 다시 시도해 주세요.'); }
    finally { setPending(false); }
  }
  return <main className="login-page"><div className="login-top"><ThemeControl/></div><section className="fl-card login-card">
    <div className="login-brand" aria-hidden="true">우<span/></div><p className="eyebrow">우리 가족 · FAMILY LEDGER</p><h1>{register ? '가족 계정 만들기' : '우리 가족 장부 로그인'}</h1>
    <p className="muted">{register ? '총괄관리자에게 받은 초대 코드로 가입하세요.' : '본인의 아이디와 비밀번호로 로그인하세요.'}</p>
    <form className="account-form" onSubmit={submit}>
      {register && <><label className="fl-field">초대 코드<input className="fl-input" name="invite_token" required minLength={32} maxLength={128} autoComplete="off" spellCheck={false}/></label>
        <label className="fl-field">이름<input className="fl-input" name="display_name" required maxLength={60} autoComplete="name"/></label></>}
      <label className="fl-field">아이디<input className="fl-input" name="username" required minLength={3} maxLength={50} pattern="[a-zA-Z0-9_.\-]+" autoComplete="username" autoCapitalize="none" spellCheck={false}/></label>
      {register && <p className="small muted">영문·숫자·밑줄·마침표·하이픈으로 3~50자</p>}
      <label className="fl-field">비밀번호<input className="fl-input" name="password" type="password" required minLength={12} maxLength={128} autoComplete={register ? 'new-password' : 'current-password'}/></label>
      {register && <><p className="small muted">12~128자로 입력하세요. 다른 서비스와 다른 비밀번호를 사용하세요.</p><label className="fl-field">비밀번호 확인<input className="fl-input" name="confirmation" type="password" required minLength={12} maxLength={128} autoComplete="new-password"/></label></>}
      {error && <p role="alert" className="inline-error">{error}</p>}
      <Button type="submit" pending={pending}>{register ? '가입하고 시작하기' : '로그인'}</Button>
    </form>
    <p className="account-link"><Link href={register ? '/login' : '/register'}>{register ? '이미 계정이 있어요 · 로그인' : '초대를 받으셨나요? 계정 만들기'}</Link></p>
    {!register && developmentLogin && <section className="account-form development-login" aria-label="개발용 테스트 로그인">
      <h2>개발용 테스트 로그인</h2><p className="muted">역할별 테스트 계정으로 접속합니다. 변경 사항은 로컬 DB에 저장됩니다.</p>
      {([['member', '일반사용자'], ['treasurer', '총무'], ['super_admin', '총괄관리자']] as const).map(([role, label]) =>
        <Button key={role} variant="secondary" type="button" disabled={pending} onClick={() => testLogin(role)}>{label}로 테스트</Button>)}
    </section>}
  </section></main>;
}
