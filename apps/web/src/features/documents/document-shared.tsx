'use client';
import { useState } from 'react';
import { Button } from '../../components/ui/Button';

export const documentSections = [
  { key: 'bank', label: '통장 내역 문서', description: '모임통장에서 받은 엑셀·CSV 원본과 업로드 이력을 보관합니다.' },
  { key: 'family', label: '가족 문서', description: '운영규정·회의록 등 가족의 문서를 버전별로 관리합니다.' },
  { key: 'evidence', label: '영수증·증빙 관리', description: '출금 요청에 첨부된 증빙과 연결된 요청을 확인합니다.' },
] as const;
export type DocumentSection = typeof documentSections[number]['key'];
export function dateLabel(value: string) { return new Date(value).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', dateStyle: 'medium', timeStyle: 'short' }); }
export function fileSize(value: number) { return value < 1024 ? `${value} B` : value < 1024 * 1024 ? `${Math.ceil(value / 1024)} KB` : `${(value / (1024 * 1024)).toFixed(1)} MB`; }

export function DownloadButton({ path, filename }: { path: string; filename: string }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  async function download() {
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/v1${path}`, { cache: 'no-store', credentials: 'same-origin' });
      if (!response.ok) { const body = await response.json().catch(() => null); throw new Error(body?.error?.message || '다운로드하지 못했습니다.'); }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a'); link.href = url; link.download = filename; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (failure) { setError(failure instanceof Error ? failure.message : '다운로드하지 못했습니다.'); }
    finally { setBusy(false); }
  }
  return <div><Button variant="secondary" pending={busy} onClick={download}>원본 다운로드</Button>{error && <p className="inline-error" role="alert">{error}</p>}</div>;
}
