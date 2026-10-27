'use client';
import { Suspense, useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { AccountReveal } from '../accounts/account-reveal';
import { EvidenceGallery, EvidenceUploader } from './evidence';
import { PaymentPanel } from './payment-panel';
import { useSession } from '../../components/app-shell';
import { Button } from '../../components/ui/Button';
import { BackButton } from '../../components/ui/BackButton';
import { Money } from '../../components/ui/Money';
import { Select } from '../../components/ui/Select';
import { Failed, Loading } from '../../components/resource-state';
import { api, ApiError } from '../../lib/api';
import { useResource } from '../../lib/use-resource';
import type { components } from '../../generated/api';

type Item = components['schemas']['ExpenseItem'];
type Listing = components['schemas']['ExpenseList'];
const labels = { submitted: '승인 대기', payment_pending: '송금 대기', paid: '송금 완료', rejected: '반려' };
function currentStatus(item: Item): keyof typeof labels {
  return item.status === 'approved' ? (item.payment ? 'paid' : 'payment_pending') : item.status;
}
function statusTone(item: Item) {
  const status = currentStatus(item);
  return status === 'paid' ? 'success' : status === 'rejected' ? 'danger' : status === 'payment_pending' ? 'info' : 'warning';
}

function PosthocEvidence({ item, path, onSaved }: { item: Item; path: string; onSaved: () => void }) {
  const session = useSession(); const [open, setOpen] = useState(false); const [ids, setIds] = useState<string[]>([]);
  const [pending, setPending] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  async function save() {
    if (!session || pending || busy || !ids.length) return;
    setBusy(true); setError('');
    try {
      await api(`${path}/${item.id}/evidence`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': session.csrf_token }, body: JSON.stringify({ evidence_ids: ids }) });
      setIds([]); setOpen(false); onSaved();
    } catch (failure) { setError(failure instanceof Error ? failure.message : '증빙 연결 결과를 확인하지 못했습니다. 목록을 새로고침해 주세요.'); }
    finally { setBusy(false); }
  }
  return <div className="posthoc-evidence"><Button variant="secondary" disabled={busy || pending} onClick={() => { setOpen(!open); setIds([]); setPending(false); }}>{open ? '증빙 추가 접기' : '사후 영수증 추가'}</Button>{open && <><EvidenceUploader onChange={setIds} onBusy={setPending} existingCount={item.evidence.length} disabled={busy}/><Button pending={busy} disabled={pending || !ids.length} onClick={save}>증빙 제출</Button></>}{error && <p className="inline-error" role="alert">{error}</p>}</div>;
}

export function ExpensesView() {
  return <Suspense fallback={<Loading/>}><ExpensesContent/></Suspense>;
}

function ExpensesContent() {
  const router = useRouter();
  const requestedId = useSearchParams().get('request');
  const session = useSession();
  const manager = session?.capabilities.includes('manage');
  const superAdmin = session?.capabilities.includes('manage_roles');
  const path = session ? `/families/${session.family_id}/expenses` : '';
  const resource = useResource<Listing>(session ? path : null);
  const accounts = useResource<components['schemas']['BankAccountList']>(session ? `/families/${session.family_id}/bank-accounts` : null);
  const [accountId, setAccountId] = useState('');
  const [requestType, setRequestType] = useState('reimbursement');
  const [evidenceIds, setEvidenceIds] = useState<string[]>([]);
  const [uploadPending, setUploadPending] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const review = useRef<HTMLElement>(null);
  const [filter, setFilter] = useState('all');
  const [writing, setWriting] = useState(false);
  const [selected, setSelected] = useState<Item | null>(null);
  const [decision, setDecision] = useState('approved');
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const operation = useRef<string | null>(null);
  const savedBody = useRef<Record<string, unknown> | null>(null);
  const detail = selected ? (resource.data?.items.find(item => item.id === selected.id) ?? selected) : resource.data?.items.find(item => item.id === requestedId);
  const detailId = detail?.id;
  useEffect(() => { if (detailId) { review.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }); review.current?.focus({ preventScroll: true }); } }, [detailId]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session || busy) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    const body = { amount_krw: String(fields.get('amount_krw')), purpose: String(fields.get('purpose')).trim(), requested_on: String(fields.get('requested_on')), request_type: requestType, bank_account_id: accountId || accounts.data?.default_account_id || '', evidence_ids: evidenceIds };
    if (!body.bank_account_id) { setError('내 계좌에서 지급받을 계좌를 먼저 등록해 주세요.'); return; }
    if (uploadPending) { setError('업로드하지 못한 영수증을 확인해 주세요.'); return; }
    if (requestType === 'reimbursement' && !evidenceIds.length) { setError('사용 후 정산에는 영수증을 1개 이상 첨부해 주세요.'); return; }
    if (!/^[1-9][0-9]{0,18}$/.test(body.amount_krw) || BigInt(body.amount_krw) > 9223372036854775807n) { setError('금액은 1원 이상의 정수로 입력해 주세요.'); return; }
    // Keep the same operation and payload after an unknown network outcome.
    if (savedBody.current && JSON.stringify(savedBody.current) !== JSON.stringify(body)) { setError('이전 제출 결과를 먼저 목록에서 확인해 주세요. 같은 내용으로 재시도하면 중복 등록되지 않습니다.'); return; }
    operation.current ??= crypto.randomUUID(); savedBody.current = body;
    setBusy(true); setError(''); setMessage('');
    try {
      await api(path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': session.csrf_token }, body: JSON.stringify({ ...body, operation_id: operation.current }) });
      operation.current = null; savedBody.current = null; setUncertain(false); form.reset(); setWriting(false); setEvidenceIds([]); setUploadPending(false); setMessage('출금 요청을 제출했습니다. 승인 결과는 이 화면에서 확인하세요.'); resource.retry();
    } catch (failure) {
      if (failure instanceof ApiError && failure.status >= 400 && failure.status < 500 && failure.status !== 409) {
        operation.current = null; savedBody.current = null; setUncertain(false);
      } else setUncertain(true);
      setError(failure instanceof Error ? failure.message : '제출 결과를 확인하지 못했습니다. 목록을 확인한 뒤 같은 내용으로 재시도하세요.');
    }
    finally { setBusy(false); }
  }
  async function decide(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session || !detail || busy) return;
    setBusy(true); setError(''); setMessage('');
    try {
      await api(`${path}/${detail.id}/decisions`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': session.csrf_token }, body: JSON.stringify({ decision, comment: comment.trim() }) });
      setMessage(decision === 'approved' ? '승인을 기록했습니다. 실제 송금은 총무가 은행 앱에서 진행해야 합니다.' : '반려 사유를 기록했습니다.'); returnToList(); resource.retry();
    } catch (failure) { setError(failure instanceof Error ? `${failure.message} 현재 처리 상태를 다시 확인해 주세요.` : '처리 결과를 확인하지 못했습니다.'); resource.retry(); setSelected(null); }
    finally { setBusy(false); }
  }
  const items = resource.data?.items.filter(item => filter === 'all' || currentStatus(item) === filter) ?? [];
  function returnToList() { setSelected(null); setError(''); if (requestedId) router.replace('/expenses', { scroll: false }); }
  if (requestedId && !selected && !detail) {
    return <><BackButton onClick={returnToList}/>{resource.loading ? <Loading/> : resource.error ? <Failed message={resource.error} retry={resource.retry}/> : <p className="inline-error" role="alert">요청을 찾을 수 없거나 조회 권한이 없습니다.</p>}</>;
  }
  if (detail) {
    const own = detail.requester_id === session?.user.id;
    const incomplete = detail.request_type === 'legacy' || !detail.bank_account;
    const needsAdmin = detail.requires_super_admin && !superAdmin;
    const canDecide = manager && !own && !needsAdmin && detail.status === 'submitted' && resource.data?.approval_configured && !incomplete;
    return <section ref={review} tabIndex={-1} className="expense-detail" aria-label="출금 요청 검토">
      <BackButton disabled={busy} onClick={returnToList}/>
      <div className="page-title"><div><p className="eyebrow">REQUEST DETAILS</p><h1>출금 요청 상세</h1><p className="muted">요청 내용과 증빙을 확인하고 처리 이력을 살펴보세요.</p></div></div>
      {error && <p role="alert" className="inline-error">{error}</p>}
      <div className="expense-detail-grid"><section className="fl-card expense-information">
        <header className="expense-summary"><div><span className="expense-field-label">요청 금액</span><div className="expense-summary-amount"><Money amountKrw={detail.amount_krw}/></div></div><span className="fl-badge" data-tone={statusTone(detail)}>{labels[currentStatus(detail)]}</span></header>
        <section className="expense-info-section" aria-labelledby="expense-request-content"><h2 id="expense-request-content">요청 내용</h2><div className="expense-purpose-box"><span className="expense-field-label">사용 목적 · 요청사항</span><p className="expense-purpose">{detail.purpose}</p></div>
        <dl className="expense-facts"><div><dt>요청자</dt><dd>{detail.requester_name}</dd></div><div><dt>요청 유형</dt><dd>{detail.request_type === 'advance' ? '사용 전 선지급' : detail.request_type === 'reimbursement' ? '사용 후 정산' : '기존 요청'}</dd></div><div><dt>희망 지급일</dt><dd><time dateTime={detail.requested_on}>{detail.requested_on}</time></dd></div><div><dt>요청일</dt><dd>{new Date(detail.created_at).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })}</dd></div></dl></section>
        <section className="expense-info-section" aria-labelledby="expense-payment-account"><h2 id="expense-payment-account">지급 계좌</h2>{detail.bank_account ? <><dl className="expense-facts expense-bank-facts"><div><dt>은행</dt><dd>{detail.bank_account.bank_name}</dd></div><div><dt>예금주</dt><dd>{detail.bank_account.account_holder}</dd></div><div className="expense-fact-wide"><dt>계좌번호</dt><dd>{detail.bank_account.masked_number}</dd></div></dl><AccountReveal key={detail.id} path={`${path}/${detail.id}/payee-account`}/></> : <p className="muted">등록된 지급 계좌가 없습니다.</p>}</section>
        <section className="expense-info-section" aria-labelledby="expense-receipts"><h2 id="expense-receipts">영수증 · 증빙 <span className="expense-section-count">{detail.evidence.length}개</span></h2>
        {detail.evidence.length ? <EvidenceGallery evidence={detail.evidence} decisionIds={detail.decision_evidence_ids} decided={detail.status === 'approved'}/> : <p className="muted">첨부된 증빙이 없습니다.{detail.request_type === 'advance' && ' 사용 후 영수증을 추가할 수 있습니다.'}</p>}
        {detail.request_type === 'advance' && own && detail.status !== 'rejected' && detail.evidence.length < 5 && <PosthocEvidence key={detail.id} item={detail} path={path} onSaved={resource.retry}/>}
        </section>
      </section><div className="expense-detail-side"><section className="fl-card"><h2>처리 이력</h2>
        <div className="expense-history"><strong>요청 제출 · {detail.requester_name}</strong><p className="small muted">{new Date(detail.created_at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}</p></div>
        {detail.comment ? <div className="expense-decision"><strong>{detail.status === 'approved' ? '승인' : '반려'} · {detail.actor_name}</strong><p>{detail.comment}</p><span className="small muted">{detail.decided_at && new Date(detail.decided_at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}</span></div> : <p className="muted">아직 승인·반려 처리 내역이 없습니다.</p>}
      </section><PaymentPanel key={detail.id} item={detail} path={path} refresh={resource.retry}/>{manager && detail.status === 'submitted' && <section className="fl-card"><h2>요청 처리</h2>
        {own ? <p className="muted">{detail.requires_super_admin ? '총무 본인의 요청은 다른 총괄관리자가 처리해야 합니다.' : '본인의 요청은 다른 총무 또는 총괄관리자가 처리해야 합니다.'}</p> : needsAdmin ? <p className="muted">총무가 제출한 요청은 총괄관리자만 승인·반려할 수 있습니다.</p> : incomplete ? <p className="muted">요청 유형과 지급 계좌가 없어 처리할 수 없습니다. 요청자가 새 요청을 제출해야 합니다.</p> : !resource.data?.approval_configured ? <div className="development-notice"><strong>승인 규칙 설정 대기</strong><p>상세 검토는 가능합니다. 가족의 승인 규칙이 설정되면 승인·반려를 처리할 수 있습니다.</p></div> : null}
        {canDecide && <form className="account-form" onSubmit={decide}><Select label="처리 결과" value={decision} onChange={setDecision} options={[{value:'approved',label:'승인'},{value:'rejected',label:'반려'}]}/><label className="fl-field">처리 사유<textarea className="fl-input" value={comment} onChange={event => setComment(event.target.value)} required maxLength={500} rows={3} disabled={busy}/></label><p className="small muted">처리자·시각·사유가 기록됩니다. 승인 후 실제 송금은 총무가 은행 앱에서 진행합니다.</p><Button type="submit" pending={busy} disabled={!comment.trim()}>처리 확정</Button></form>}
      </section>}</div></div>
    </section>;
  }
  return <>
    <div className="page-title expense-title"><div><p className="eyebrow">WITHDRAWAL REQUESTS</p><h1>출금 요청</h1><p className="muted">{manager ? '가족의 출금 요청을 검토하고 승인 결과를 기록하세요.' : '필요한 지출을 요청하고 처리 결과를 확인하세요.'}</p></div><Button disabled={busy || uploadPending || uncertain} onClick={() => { setWriting(!writing); setError(''); setEvidenceIds([]); setAccountId(''); }}>{writing ? '작성 접기' : '새 출금 요청'}</Button></div>
    <p className="data-notice">승인은 송금 완료가 아닙니다. 실제 송금과 은행 거래 확인은 별도로 진행합니다.</p>
    {message && <p className="expense-success" role="status">{message}</p>}{error && <p className="inline-error" role="alert">{error}</p>}
    {writing && <section className="fl-card"><h2>출금 요청 작성</h2><form className="expense-form" onSubmit={submit}>
      <label className="fl-field">요청 금액 (원)<input className="fl-input" name="amount_krw" inputMode="numeric" pattern="[1-9][0-9]*" maxLength={19} placeholder="예: 50000" required disabled={busy}/></label>
      <Select label="요청 유형" value={requestType} onChange={setRequestType} options={[{ value: 'reimbursement', label: '사용 후 정산' }, { value: 'advance', label: '사용 전 선지급' }]}/>
      <div className="expense-wide">{accounts.loading ? <Loading/> : accounts.error ? <Failed message={accounts.error} retry={accounts.retry}/> : accounts.data?.items.length ? <Select label="지급받을 계좌" value={accountId || accounts.data.default_account_id || ''} onChange={setAccountId} options={[{ value: '', label: '계좌를 선택해 주세요' }, ...accounts.data.items.map(item => ({ value: item.id, label: `${item.label || item.bank_name} · ${item.masked_number} · ${item.account_holder}${item.id === accounts.data?.default_account_id ? ' (기본)' : ''}` }))]}/> : <p className="account-link"><Link href="/accounts">내 계좌 등록하기</Link> · 요청 전에 본인 계좌를 등록해 주세요.</p>}</div>
      <label className="fl-field">희망 지급일<input className="fl-input" name="requested_on" type="date" required disabled={busy}/></label>
      <label className="fl-field expense-wide">사용 목적<textarea className="fl-input" name="purpose" maxLength={500} rows={3} required disabled={busy} placeholder="어떤 용도로 사용할 금액인지 설명해 주세요."/></label>
      <div className="expense-wide"><p className="small muted">{requestType === 'reimbursement' ? '사용 후 정산은 영수증 1개 이상이 필요합니다.' : '선지급은 사용 목적을 적고, 사용 후 이 요청에 영수증을 추가해 주세요.'}</p><EvidenceUploader onChange={setEvidenceIds} onBusy={setUploadPending} disabled={busy || uncertain}/></div>
      <p className="small muted expense-wide">제출한 지급 계좌는 기본 계좌를 변경해도 유지됩니다. 사용 목적에는 계좌번호 등 민감한 정보를 입력하지 마세요.</p><Button type="submit" pending={busy} disabled={uploadPending || !accounts.data?.items.length}>요청 제출</Button>
    </form></section>}
    {resource.loading ? <Loading/> : resource.error ? <Failed message={resource.error} retry={resource.retry}/> : resource.data && <>
      {manager && !resource.data?.approval_configured && <div className="development-notice"><strong>승인 규칙 확인이 필요합니다</strong><p>요청은 접수되지만 승인·반려 처리는 승인 규칙 확정 후 활성화됩니다.</p></div>}
      <div className="filters"><Select label="처리 상태" value={filter} onChange={setFilter} options={[{value:'all',label:'전체 요청'},...Object.entries(labels).map(([value,label]) => ({value,label}))]}/><span className="toolbar-note">{manager ? '가족 전체 요청' : '내가 요청한 내역'} · {items.length}건</span><Button variant="secondary" disabled={busy} onClick={resource.retry}>목록 새로고침</Button></div>
      <section data-report-id="expenses.list" data-report-label="출금 요청 목록" data-report-source="apps/web/src/features/expenses/expenses-view.tsx" className="expense-list" aria-label="출금 요청 목록">{items.length === 0 ? <div className="fl-card empty-state">{filter === 'all' ? '아직 출금 요청이 없습니다. 새 요청을 작성해 보세요.' : '해당 상태의 요청이 없습니다.'}</div> : items.map(item => <article data-report-item={item.id} className="fl-card expense-item" data-payment-pending={item.status === 'approved' && !item.payment ? 'true' : undefined} key={item.id}>
        <div className="section-heading"><span className="fl-badge" data-tone={statusTone(item)}>{labels[currentStatus(item)]}</span><span className="small muted">{new Date(item.created_at).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })}</span></div>
        <h2 className="expense-card-purpose">{item.purpose}</h2><div className="expense-card-amount"><Money amountKrw={item.amount_krw}/></div>
        <p className="expense-card-meta"><span>{item.requester_name}</span><span>{item.request_type === 'advance' ? '선지급' : item.request_type === 'reimbursement' ? '정산' : '기존 요청'}</span><span>증빙 {item.evidence.length}개</span></p>
        <div className="expense-card-footer"><span className="small muted">지급 희망 {item.requested_on}</span><Button variant="secondary" disabled={busy} onClick={() => { setSelected(item); setDecision('approved'); setComment(''); setError(''); }}>상세 보기<span className="sr-only">: {item.purpose}</span></Button></div>
      </article>)}</section>
    </>}

  </>;
}
