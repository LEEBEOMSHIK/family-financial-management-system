'use client';
import { useEffect, useId, useRef, useState, type DragEvent } from 'react';
import { Button } from '../../components/ui/Button';
import { fileSize } from './document-shared';

export function DocumentFilePicker({ kind, file, disabled, onChange }: {
  kind: 'bank' | 'family'; file?: File; disabled: boolean; onChange: (file?: File) => void;
}) {
  const id = useId(); const input = useRef<HTMLInputElement>(null); const browse = useRef<HTMLButtonElement>(null);
  const depth = useRef(0); const [dragging, setDragging] = useState(false); const [error, setError] = useState('');
  const extensions = kind === 'bank' ? ['xlsx', 'csv'] : ['pdf', 'docx', 'txt', 'png', 'jpg', 'jpeg', 'webp'];
  const formats = kind === 'bank' ? 'XLSX · CSV' : 'PDF · DOCX · TXT · JPG · PNG · WebP';
  useEffect(() => {
    const preventNavigation = (event: globalThis.DragEvent) => {
      if (event.dataTransfer?.types.includes('Files')) event.preventDefault();
    };
    window.addEventListener('dragover', preventNavigation);
    window.addEventListener('drop', preventNavigation);
    return () => { window.removeEventListener('dragover', preventNavigation); window.removeEventListener('drop', preventNavigation); };
  }, []);
  function select(files: File[]) {
    if (disabled) return;
    if (files.length !== 1 || !files[0]) { setError('폴더 대신 파일 한 개를 선택해 주세요.'); return; }
    const selected = files[0];
    if (!extensions.includes(selected.name.split('.').pop()?.toLowerCase() || '')) { setError('지원하지 않는 파일 형식입니다. 아래에 안내된 형식을 선택해 주세요.'); return; }
    if (!selected.size || selected.size > 6 * 1024 * 1024) { setError('비어 있지 않은 6MiB 이하 파일을 선택해 주세요.'); return; }
    if (selected.name.length > 180) { setError('파일 이름은 확장자를 포함해 180자 이내로 변경해 주세요.'); return; }
    setError(''); onChange(selected);
  }
  function enter(event: DragEvent) {
    if (!event.dataTransfer.types.includes('Files')) return;
    event.preventDefault(); depth.current += 1;
    if (!disabled) setDragging(true);
  }
  function leave(event: DragEvent) {
    event.preventDefault(); depth.current = Math.max(0, depth.current - 1);
    if (!depth.current) setDragging(false);
  }
  function drop(event: DragEvent) {
    event.preventDefault(); depth.current = 0; setDragging(false);
    select(Array.from(event.dataTransfer.files));
  }
  return <section className="document-file-picker document-wide" aria-label="파일 업로드 영역" data-dragging={dragging && !disabled} onDragEnter={enter} onDragLeave={leave} onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = disabled ? 'none' : 'copy'; }} onDrop={drop}>
    <input ref={input} type="file" hidden aria-label="파일 선택" accept={extensions.map(extension => `.${extension}`).join(',')} disabled={disabled} onChange={event => { const files = Array.from(event.target.files || []); event.target.value = ''; if (files.length) select(files); }}/>
    <button ref={browse} className="document-dropzone" type="button" aria-label="파일 찾아보기" aria-describedby={`${id}-help${error ? ` ${id}-error` : ''}`} disabled={disabled} onClick={() => input.current?.click()}>
      <span className="document-upload-icon" aria-hidden="true"><svg viewBox="0 0 32 32" fill="none"><path d="M16 21V6m-6 6 6-6 6 6M6 21v5h20v-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg></span>
      <strong>{dragging && !disabled ? '여기에 놓으면 파일이 선택됩니다' : '여기에 파일을 끌어다 놓으세요'}</strong>
      <span className="document-dropzone-choice">또는 클릭하여 파일 선택</span>
      <span id={`${id}-help`} className="small muted">{formats} · 파일 한 개 · 최대 6MiB</span>
    </button>
    {file && <div className="document-selected-file"><div className="document-selected-description" role="status"><span className="fl-badge" data-tone="info">{file.name.split('.').pop()?.toUpperCase()}</span><div><strong>{file.name}</strong><p className="small muted">{fileSize(file.size)} · 선택 완료</p></div></div><div className="document-actions"><Button variant="ghost" disabled={disabled} onClick={() => input.current?.click()}>파일 변경</Button><Button variant="ghost" disabled={disabled} onClick={() => { onChange(undefined); setError(''); browse.current?.focus(); }}>파일 제거</Button></div></div>}
    {error && <p id={`${id}-error`} className="inline-error document-file-error" role="alert">{error}</p>}
  </section>;
}
