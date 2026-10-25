'use client';
import { useEffect, useRef, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { useSession } from '../../components/app-shell';
import { api } from '../../lib/api';
import type { components } from '../../generated/api';

type Evidence = components['schemas']['EvidenceItem'];
type Upload = { key: string; file: File; preview: string; item?: Evidence; error?: string };
export function EvidenceUploader({ onChange, onBusy, existingCount = 0, disabled = false }: { onChange: (ids: string[]) => void; onBusy: (busy: boolean) => void; existingCount?: number; disabled?: boolean }) {
  const session = useSession(); const [uploads, setUploads] = useState<Upload[]>([]); const [error, setError] = useState('');
  const live = useRef<Upload[]>([]); const controller = useRef<AbortController | null>(null); const [working, setWorking] = useState(false);
  useEffect(() => () => { controller.current?.abort(); live.current.forEach(item => URL.revokeObjectURL(item.preview)); }, []);
  function update(items: Upload[]) { live.current = items; setUploads(items); onChange(items.flatMap(item => item.item ? [item.item.id] : [])); onBusy(items.some(item => !item.item)); }
  async function upload(files: File[]) {
    if (!session || working) return;
    setError('');
    if (files.length + live.current.length + existingCount > 5) { setError('영수증은 요청당 최대 5개까지 첨부할 수 있습니다.'); return; }
    if (files.some(file => !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 6 * 1024 * 1024)) { setError('JPG, PNG, WebP 이미지를 각각 6MiB 이하로 선택해 주세요.'); return; }
    const added = files.map(file => ({ key: crypto.randomUUID(), file, preview: URL.createObjectURL(file) }));
    update([...live.current, ...added]); setWorking(true);
    const abort = new AbortController(); controller.current = abort;
    for (const item of added) {
      try {
        const result = await api<Evidence>(`/families/${session.family_id}/evidence`, { method: 'POST', headers: { 'Content-Type': item.file.type, 'X-CSRF-Token': session.csrf_token }, body: item.file, signal: abort.signal });
        if (!abort.signal.aborted) update(live.current.map(entry => entry.key === item.key ? { ...entry, item: result } : entry));
      } catch { if (!abort.signal.aborted) update(live.current.map(entry => entry.key === item.key ? { ...entry, error: '업로드하지 못했습니다. 이 파일을 제거한 뒤 다시 선택해 주세요.' } : entry)); }
    }
    if (!abort.signal.aborted) setWorking(false);
  }
  return <div className="evidence-uploader"><label className="fl-field">영수증 첨부<input className="fl-input" type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={disabled || working || existingCount + uploads.length >= 5} onChange={event => { const files = Array.from(event.target.files ?? []); event.target.value = ''; void upload(files); }}/></label><p className="small muted">JPG · PNG · WebP, 개당 6MiB 이하 · 최대 5개. 업로드가 끝나야 제출할 수 있습니다.</p>{error && <p role="alert" className="inline-error">{error}</p>}<div className="receipt-grid">{uploads.map((item, index) => <div className="receipt" key={item.key}><img src={item.preview} alt={`선택한 영수증 ${index + 1}`}/><p role={item.error ? 'alert' : 'status'} className={item.error ? 'inline-error' : 'small muted'}>{item.error || (item.item ? '업로드 완료' : '업로드 중…')}</p><Button variant="ghost" disabled={working || disabled} onClick={() => { URL.revokeObjectURL(item.preview); update(live.current.filter(entry => entry.key !== item.key)); }}>영수증 {index + 1} 제거</Button></div>)}</div></div>;
}

export function EvidenceGallery({ evidence, decisionIds = [], decided = false }: { evidence: Evidence[]; decisionIds?: string[]; decided?: boolean }) {
  const session = useSession();
  return <div className="receipt-grid">{evidence.map((item, index) => <figure className="receipt" key={item.id}><a href={`/api/v1/families/${session?.family_id}/evidence/${item.id}/preview`} target="_blank" rel="noopener noreferrer"><img src={`/api/v1/families/${session?.family_id}/evidence/${item.id}/preview`} alt={`영수증 ${index + 1} 미리보기`} loading="lazy"/></a><figcaption className="small">영수증 {index + 1}{decided && !decisionIds.includes(item.id) && <strong className="receipt-added">승인 후 추가 증빙</strong>}</figcaption></figure>)}</div>;
}
