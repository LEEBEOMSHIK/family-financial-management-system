'use client';
import { useRef, useState, type FormEvent } from 'react';
import { useSession } from '../../components/app-shell';
import { Button } from '../../components/ui/Button';
import { BackButton } from '../../components/ui/BackButton';
import { DocumentFilePicker } from './document-file-picker';
import { Select } from '../../components/ui/Select';
import { api, ApiError } from '../../lib/api';
import type { components } from '../../generated/api';

type Item = components['schemas']['DocumentItem'];
export function DocumentUpload({ kind, previous, onSaved, onClose }: { kind: 'bank' | 'family'; previous?: Item; onSaved: (item: Item) => void; onClose: () => void }) {
  const session = useSession(); const [title, setTitle] = useState(previous?.title || '');
  const [category, setCategory] = useState(previous?.category || (kind === 'bank' ? '통장 내역' : '정책·규정'));
  const [description, setDescription] = useState(previous?.description || ''); const [file, setFile] = useState<File>();
  const [busy, setBusy] = useState(false); const [uncertain, setUncertain] = useState(false); const [error, setError] = useState('');
  const operation = useRef<string | null>(null);
  async function submit(event: FormEvent) {
    event.preventDefault(); if (!session || !file || busy) return;
    if (file.size > 6 * 1024 * 1024 || !file.size) { setError('비어 있지 않은 6MiB 이하 파일을 선택해 주세요.'); return; }
    setBusy(true); setError(''); operation.current ??= crypto.randomUUID();
    const params = new URLSearchParams({ kind, title, category, description, filename: file.name, operation_id: operation.current });
    if (previous) params.set('root_id', previous.root_id);
    try {
      const result = await api<Item>(`/families/${session.family_id}/documents?${params}`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', 'X-CSRF-Token': session.csrf_token }, body: file });
      onSaved(result);
    } catch (failure) {
      const known = failure instanceof ApiError && failure.status < 500;
      setUncertain(!known);
      if (known) operation.current = null;
      setError(!known ? '업로드 결과를 확인하지 못했습니다. 같은 파일로 결과 확인을 누르면 중복 없이 다시 확인합니다.' : failure.message);
    } finally { setBusy(false); }
  }
  return <div className="document-upload-screen">
    <BackButton onClick={onClose} disabled={busy || uncertain}/>
    <div className="page-title"><p className="eyebrow">DOCUMENT UPLOAD</p><h1>{previous ? '새 버전 등록' : kind === 'bank' ? '통장 내역 문서 업로드' : '가족 문서 업로드'}</h1><p className="muted">{previous ? `‘${previous.title}’의 새 파일을 등록합니다. 이전 버전과 원본은 보관됩니다.` : '파일을 선택하고 문서 정보를 입력해 주세요.'}</p></div>
    <section className="fl-card document-upload" aria-label={previous ? '새 버전 등록' : '문서 업로드'}>
      <form onSubmit={submit} className="document-form">
        <DocumentFilePicker kind={kind} file={file} disabled={busy || uncertain} onChange={selected => { setFile(selected); operation.current = null; setError(''); if (selected && !title.trim()) setTitle(selected.name.replace(/\.[^.]+$/, '').slice(0, 120)); }}/>
        <div className="document-form-heading document-wide"><h2>문서 정보</h2><p className="small muted">목록에서 쉽게 찾을 수 있도록 제목과 설명을 적어 주세요.</p></div>
        <label className="fl-field">문서 제목<input className="fl-input" value={title} onChange={e => setTitle(e.target.value)} required maxLength={120} disabled={busy || uncertain}/></label>
        {kind === 'family' && <fieldset className="document-category" disabled={busy || uncertain}><Select label="분류" value={category} onChange={setCategory} options={['정책·규정', '회의록·의결 자료', '기타'].map(value => ({ value, label: value }))}/></fieldset>}
        <label className="fl-field document-wide"><span>설명 <span className="small muted">선택 사항</span></span><textarea aria-label="설명" className="fl-input" rows={3} value={description} onChange={e => setDescription(e.target.value)} maxLength={1000} disabled={busy || uncertain}/></label>
        <p className="small muted document-wide">{kind === 'bank' ? '카카오뱅크 원본을 검증한 뒤 입출금 내역에 자동 반영합니다. 최대 2,000건이며, 오류가 있으면 원본만 보관하고 확인이 필요한 이유를 표시합니다.' : '총무·총괄관리자만 조회할 수 있는 비공개 문서로 보관됩니다.'} 악성코드 검사는 아직 연동되지 않았습니다.</p>
        {error && <p className="inline-error document-wide" role="alert">{error}</p>}
        <div className="document-actions document-upload-actions document-wide"><Button type="submit" pending={busy} disabled={!file || !title.trim()}>{uncertain ? '업로드 결과 확인' : previous ? '새 버전 저장' : '문서 저장'}</Button><Button variant="ghost" disabled={busy || uncertain} onClick={onClose}>취소</Button></div>
      </form>
    </section>
  </div>;
}
