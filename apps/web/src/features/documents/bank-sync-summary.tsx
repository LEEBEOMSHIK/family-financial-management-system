'use client';
import { useState } from 'react';
import { useSession } from '../../components/app-shell';
import { Button } from '../../components/ui/Button';
import { api } from '../../lib/api';
import type { components } from '../../generated/api';
import { dateLabel } from './document-shared';

type Item = components['schemas']['DocumentItem'];
export function BankSyncSummary({ item, base }: { item: Item; base: string }) {
  const session = useSession();
  const [updated, setUpdated] = useState<Item>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const sync = (updated ?? item).sync;
  async function synchronize() {
    if (!session || busy) return;
    setBusy(true); setError('');
    try { setUpdated(await api<Item>(`${base}/${item.id}/sync`, { method: 'POST', headers: { 'X-CSRF-Token': session.csrf_token } })); }
    catch { setError('동기화 결과를 확인하지 못했습니다. 다시 확인해도 중복 반영되지 않습니다.'); }
    finally { setBusy(false); }
  }
  return <div className="bank-sync-summary" aria-label="문서 동기화 결과">
    <span className="fl-badge" data-tone={sync?.status === 'synced' ? 'success' : 'warning'}>{sync?.status === 'synced' ? '동기화 완료' : sync ? '확인 필요 · 거래 미반영' : '동기화 대기'}</span>
    {sync ? <>
      {sync.period_start && <p>파일 조회기간 · {sync.period_start} ~ {sync.period_end}</p>}
      {sync.status === 'synced' && <>
        <p><strong>{sync.period_start} ~ {sync.period_end} 동기화 완료</strong></p>
        <p>신규 {sync.added}건 · 기존 반영 {sync.duplicates}건{sync.added === 0 && ' · 신규 반영 없음'}</p>
        <p className="small muted">{sync.transaction_start && sync.transaction_end ? `거래 존재 기간 · ${dateLabel(sync.transaction_start)} ~ ${dateLabel(sync.transaction_end)}` : '조회기간 내 거래 없음'}</p>
      </>}
      {sync.error && <p className="inline-error">{sync.error}</p>}
      <p className="small muted">처리 시각 · {dateLabel(sync.completed_at)}</p>
    </> : <><p className="small muted">보관된 원본을 검증하고 입출금 내역에 반영합니다.</p><Button variant="secondary" onClick={synchronize} disabled={busy}>{busy ? '동기화 확인 중…' : '원본 동기화'}</Button></>}
    {error && <p role="alert" className="inline-error">{error}</p>}
  </div>;
}
