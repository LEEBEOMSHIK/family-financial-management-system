'use client';
import { useRef, useState, type FormEvent } from 'react';
import { useSession } from '../../components/app-shell';
import { Button } from '../../components/ui/Button';
import { api, ApiError } from '../../lib/api';
import type { components } from '../../generated/api';

type Item = components['schemas']['ExpenseItem'];
export function PaymentPanel({ item, path, refresh }: { item: Item; path: string; refresh: () => void }) {
  const session = useSession(); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [uncertain, setUncertain] = useState(false); const saved = useRef<Record<string, unknown> | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!session || busy) return;
    const fields = new FormData(event.currentTarget);
    saved.current ??= { paid_on: String(fields.get('paid_on')), note: String(fields.get('note')).trim(), confirmed: true, operation_id: crypto.randomUUID() };
    setBusy(true); setError('');
    try {
      await api(`${path}/${item.id}/payment`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': session.csrf_token }, body: JSON.stringify(saved.current) });
      setUncertain(false); saved.current = null; refresh();
    } catch (failure) {
      if (failure instanceof ApiError && failure.status >= 400 && failure.status < 500) { saved.current = null; setUncertain(false); }
      else setUncertain(true);
      setError(failure instanceof Error ? failure.message : '기록 결과를 확인하지 못했습니다. 같은 내용으로 다시 시도해 주세요.');
      refresh();
    } finally { setBusy(false); }
  }
  if (item.status !== 'approved') return null;
  return <section className="fl-card"><h2>{item.payment ? '송금 완료' : '송금 대기'}</h2>
    {item.payment ? <><p><strong>{item.payment.actor_name}</strong> · 송금일 {item.payment.paid_on}</p><p className="muted">기록 시각 {new Date(item.payment.recorded_at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}</p>{item.payment.note && <p className="expense-purpose">{item.payment.note}</p>}<p className="small muted">총무가 실제 송금 완료를 기록했습니다. 은행 거래 대사는 별도입니다.</p></> : <>
      <p className="muted">총무가 은행 앱에서 송금한 뒤 완료를 기록해 주세요.</p>
      {item.approval_notice === 'configuration_required' && <p className="development-notice">카카오톡 알림 연동 대기 · 승인 알림은 저장됐지만 아직 발송되지 않았습니다.</p>}
      {item.approval_notice === 'not_required' && <p className="small muted">총무가 직접 승인하여 별도 카카오톡 알림은 생략했습니다.</p>}
      {item.approval_notice === 'not_recorded' && <p className="small muted">알림 기능 적용 전 승인된 요청으로, 발송 이력이 없습니다.</p>}
      {item.can_record_payment ? <form className="account-form" onSubmit={submit}>
        <label className="fl-field">실제 송금일<input className="fl-input" name="paid_on" type="date" required disabled={busy || uncertain}/></label>
        <label className="fl-field">송금 메모<textarea className="fl-input" name="note" rows={2} maxLength={500} disabled={busy || uncertain} placeholder="계좌번호 등 민감한 정보는 적지 마세요."/></label>
        <label className="payment-confirm"><input type="checkbox" required disabled={busy || uncertain}/>요청 금액 전액을 지정 계좌로 송금했음을 확인합니다.</label>
        {error && <p role="alert" className="inline-error">{error}</p>}
        {uncertain && <p className="small muted">결과 확인이 필요합니다. 재시도는 같은 기록으로 전송됩니다.</p>}
        <Button type="submit" pending={busy}>{uncertain ? '같은 내용으로 재시도' : '송금 완료 기록'}</Button>
      </form> : <p className="muted">실제 송금 완료는 현직 총무가 기록합니다.</p>}
    </>}
  </section>;
}
