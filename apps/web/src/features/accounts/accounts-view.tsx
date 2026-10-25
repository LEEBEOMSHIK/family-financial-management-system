'use client';
import { useState, type FormEvent } from 'react';
import { useSession } from '../../components/app-shell';
import { Button } from '../../components/ui/Button';
import { Failed, Loading } from '../../components/resource-state';
import { api } from '../../lib/api';
import { useResource } from '../../lib/use-resource';
import type { components } from '../../generated/api';
import { AccountReveal } from './account-reveal';

export function AccountsView() {
  const session = useSession(); const path = `/families/${session?.family_id}/bank-accounts`;
  const resource = useResource<components['schemas']['BankAccountList']>(session ? path : null);
  const [writing, setWriting] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [message, setMessage] = useState('');
  async function post(target: string, body: unknown) {
    return api(target, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': session!.csrf_token }, body: JSON.stringify(body) });
  }
  async function register(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy || !session) return;
    const form = event.currentTarget; const fields = new FormData(form); setBusy(true); setError('');
    try {
      await post(path, { bank_name: String(fields.get('bank_name')).trim(), account_number: String(fields.get('account_number')).trim(), account_holder: String(fields.get('account_holder')).trim(), label: String(fields.get('label')).trim(), make_default: fields.get('make_default') === 'on' });
      form.reset(); setWriting(false); setMessage('계좌를 등록했습니다.'); resource.retry();
    } catch { setError('계좌 등록 결과를 확인하지 못했습니다. 목록을 새로고침해 확인한 후 다시 시도해 주세요.'); }
    finally { setBusy(false); }
  }
  async function choose(id: string) {
    setBusy(true); setError('');
    try { await post(`${path}/${id}/default`, {}); resource.retry(); setMessage('기본 계좌를 변경했습니다. 이미 제출한 요청의 계좌는 유지됩니다.'); }
    catch { setError('기본 계좌를 변경하지 못했습니다. 목록을 확인해 주세요.'); }
    finally { setBusy(false); }
  }
  return <><div className="page-title expense-title"><div><p className="eyebrow">MY ACCOUNTS</p><h1>내 계좌</h1><p className="muted">출금 요청에 사용할 본인 계좌와 기본 계좌를 관리하세요.</p></div><Button disabled={busy} onClick={() => setWriting(!writing)}>{writing ? '등록 접기' : '계좌 등록'}</Button></div>
    <p className="data-notice">계좌 등록은 은행의 실명·유효 계좌 검증을 의미하지 않습니다. 은행명, 예금주와 번호를 직접 확인해 주세요.</p>
    {message && <p role="status" className="expense-success">{message}</p>}{error && <p role="alert" className="inline-error">{error}</p>}
    {writing && <section className="fl-card"><h2>새 계좌 등록</h2><form className="expense-form" autoComplete="off" onSubmit={register}>
      <label className="fl-field">은행명<input className="fl-input" name="bank_name" maxLength={80} required disabled={busy}/></label>
      <label className="fl-field">예금주<input className="fl-input" name="account_holder" maxLength={80} required disabled={busy}/></label>
      <label className="fl-field">계좌번호<input className="fl-input" name="account_number" inputMode="numeric" maxLength={40} required disabled={busy} autoComplete="off"/></label>
      <label className="fl-field">계좌 별칭<input className="fl-input" name="label" maxLength={80} disabled={busy}/></label>
      <label className="expense-wide"><input type="checkbox" name="make_default" defaultChecked disabled={busy}/> 기본 계좌로 지정</label><Button type="submit" pending={busy}>계좌 저장</Button>
    </form></section>}
    {resource.loading ? <Loading/> : resource.error ? <Failed message={resource.error} retry={resource.retry}/> : <section className="bank-account-grid" aria-label="내 계좌 목록">{!resource.data?.items.length ? <div className="fl-card empty-state">등록된 계좌가 없습니다. 첫 계좌를 등록해 주세요.</div> : resource.data.items.map(item => {
      const isDefault = resource.data?.default_account_id === item.id;
      return <article className="fl-card bank-account-card" data-default={isDefault} key={item.id}>
        <div className="bank-account-top"><span className="bank-account-icon" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M3 9h18L12 3 3 9Zm2 3v6m5-6v6m4-6v6m5-6v6M3 21h18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg></span><span className="bank-account-kind">{isDefault ? '출금 요청 기본 계좌' : '등록 계좌'}</span></div>
        <h2>{item.label || item.bank_name}</h2>
        <dl className="bank-account-details"><div><dt>은행</dt><dd>{item.bank_name}</dd></div><div><dt>계좌번호</dt><dd className="bank-account-number">{item.masked_number}</dd></div><div><dt>예금주</dt><dd>{item.account_holder}</dd></div></dl>
        <div className="bank-account-footer"><AccountReveal path={`${path}/${item.id}/reveal`}/>{isDefault ? <div className="bank-account-default"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m5 12 4 4L19 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>기본 계좌</div> : <Button variant="secondary" disabled={busy} onClick={() => choose(item.id)}>기본 계좌로 지정</Button>}</div>
      </article>;
    })}</section>}
    <Button variant="ghost" disabled={busy} onClick={resource.retry}>계좌 목록 새로고침</Button>
  </>;
}
