'use client';
import Link from 'next/link';
import { BankSyncSummary } from './bank-sync-summary';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useSession } from '../../components/app-shell';
import { Button } from '../../components/ui/Button';
import { Failed, Loading } from '../../components/resource-state';
import { useResource } from '../../lib/use-resource';
import type { components } from '../../generated/api';
import { dateLabel, documentSections, DownloadButton, fileSize, type DocumentSection } from './document-shared';

type Item = components['schemas']['DocumentItem'];
type Listing = components['schemas']['DocumentList'];
type EvidenceListing = components['schemas']['ManagedEvidenceList'];

function Denied() { return <section className="fl-card"><h1>접근 권한이 없습니다</h1><p>문서 관리는 총무·총괄관리자만 사용할 수 있습니다.</p></section>; }

function Versions({ item, base, close }: { item: Item; base: string; close: () => void }) {
  const resource = useResource<Listing>(`${base}/${item.id}/versions`);
  const panel = useRef<HTMLElement>(null);
  useEffect(() => { panel.current?.focus(); }, []);
  return <section ref={panel} tabIndex={-1} className="fl-card document-versions" aria-label="문서 버전 이력"><div className="section-heading"><h2>{item.title} · 버전 이력</h2><Button variant="ghost" onClick={close}>이력 닫기</Button></div>{resource.loading ? <Loading/> : resource.error ? <Failed message={resource.error} retry={resource.retry}/> : resource.data?.items.map(version => <article className="document-version" key={version.id}><div><strong>v{version.version} · {version.title}</strong><p className="small muted">{version.filename} · {fileSize(version.byte_size)} · {version.actor_name} · {dateLabel(version.created_at)}</p>{version.description && <p className="document-description">{version.description}</p>}{version.kind === 'bank' && <BankSyncSummary item={version} base={base}/>}</div><DownloadButton path={`${base}/${version.id}/download`} filename={version.filename}/></article>)}</section>;
}

export function DocumentsView({ section, savedId }: { section: DocumentSection; savedId?: string }) {
  const session = useSession();
  if (!session?.capabilities.includes('manage')) return <Denied/>;
  return <DocumentContent key={section} section={section} familyId={session.family_id} savedId={savedId}/>;
}

function DocumentContent({ section, familyId, savedId }: { section: DocumentSection; familyId: string; savedId?: string }) {
  const [query, setQuery] = useState(''); const [search, setSearch] = useState(''); const [offset, setOffset] = useState(0);
  const [history, setHistory] = useState<Item>();
  const historyTrigger = useRef<HTMLButtonElement | null>(null);
  const base = `/families/${familyId}/documents`;
  const resource = useResource<Listing>(section === 'evidence' ? null : `${base}?kind=${section}&q=${encodeURIComponent(search)}&offset=${offset}`);
  const evidence = useResource<EvidenceListing>(section === 'evidence' ? `${base}/evidence?q=${encodeURIComponent(search)}&offset=${offset}` : null);
  const current = section === 'evidence' ? evidence : resource;
  const info = documentSections.find(item => item.key === section)!;
  function submitSearch(event: FormEvent) { event.preventDefault(); setSearch(query.trim()); setOffset(0); }
  return <>
    <div className="page-title expense-title"><div><p className="eyebrow">DOCUMENTS</p><h1>{info.label}</h1><p className="muted">{info.description}</p></div>{section !== 'evidence' && <Link className="fl-button" data-variant="primary" href={`/documents/${section}/upload`}>문서 업로드</Link>}</div>
    {section === 'bank' && <div className="development-notice"><strong>카카오뱅크 거래내역 자동 동기화</strong><p>원본 등록 시 날짜·금액·잔액과 중복을 검증하여 입출금 내역에 반영합니다. 문서별 조회기간과 동기화 결과를 확인하세요. 오류가 있으면 원본을 보관하고 거래는 반영하지 않습니다.</p></div>}
    {section !== 'evidence' && <p className="small muted">파일 형식·크기를 검사합니다. 악성코드 검사는 아직 연동되지 않았으므로 신뢰할 수 있는 문서만 등록하고 내려받아 주세요.</p>}
    {savedId && resource.data?.items.some(item => item.id === savedId) && <p className="expense-success" role="status">문서를 저장했습니다.</p>}
    {history && <Versions key={history.id} item={history} base={base} close={() => { setHistory(undefined); historyTrigger.current?.focus(); }}/>}
    <form className="document-toolbar" onSubmit={submitSearch}><label className="fl-field"><span className="sr-only">문서 검색</span><input className="fl-input" placeholder={section === 'evidence' ? '사용 목적·요청자로 검색' : '제목·파일명·분류로 검색'} aria-label="문서 검색" value={query} onChange={e => setQuery(e.target.value)} maxLength={120}/></label><Button type="submit" variant="secondary">검색</Button><Button variant="ghost" onClick={current.retry}>새로고침</Button></form>
    {current.loading ? <Loading/> : current.error ? <Failed message={current.error} retry={current.retry}/> : <>
      <p className="small muted list-result-summary">총 {current.data?.total ?? 0}건 {section !== 'evidence' && '· 최신 버전 기준'}</p>
      <section className="document-grid" aria-label={section === 'evidence' ? '첨부 증빙 목록' : '문서 목록'}>
        {!current.data?.items.length && <div className="fl-card empty-state"><h2>{search ? '검색 결과가 없습니다' : section === 'evidence' ? '첨부된 증빙이 없습니다' : '등록된 문서가 없습니다'}</h2><p className="muted">{search ? '검색어를 바꾸어 다시 확인해 주세요.' : section === 'evidence' ? '출금 요청에 제출된 영수증과 증빙이 여기에 표시됩니다.' : '문서 업로드로 첫 파일을 등록해 주세요.'}</p></div>}
        {section !== 'evidence' && resource.data?.items.map(item => <article className="fl-card document-card" key={item.id}><div className="section-heading"><span className="fl-badge" data-tone="neutral">{item.category}</span><span className="small muted">v{item.version}</span></div><h2>{item.title}</h2>{item.description && <p className="document-description">{item.description}</p>}<p className="document-filename">{item.filename} · {fileSize(item.byte_size)}</p><p className="small muted">{item.actor_name} · {dateLabel(item.created_at)}</p>{item.kind === 'bank' && <BankSyncSummary item={item} base={base}/>}<div className="document-card-footer"><DownloadButton path={`${base}/${item.id}/download`} filename={item.filename}/><div className="document-actions"><Button variant="ghost" onClick={event => { historyTrigger.current = event.currentTarget; setHistory(item); }}>버전 이력</Button><Link className="fl-button" data-variant="ghost" href={`/documents/${section}/upload?version=${item.id}`}>새 버전</Link></div></div></article>)}
        {section === 'evidence' && evidence.data?.items.map(item => <article className="fl-card document-card document-evidence" key={item.id}><img src={`/api/v1/families/${familyId}/evidence/${item.id}/preview`} alt={`${item.purpose} 증빙 미리보기`} loading="lazy"/><h2>{item.purpose}</h2><p className="small muted">{item.requester_name} · {dateLabel(item.created_at)} · {fileSize(item.byte_size)}</p>{item.approved_evidence && <p><span className="fl-badge" data-tone="success">승인 당시 증빙</span></p>}<div className="document-card-footer"><DownloadButton path={`${base}/evidence/${item.id}/download`} filename={`evidence-${item.id}.${item.media_type.split('/')[1]}`}/><Link className="fl-button" data-variant="ghost" href={`/expenses?request=${item.request_id}`}>출금 요청 보기 →</Link></div></article>)}
      </section>
      {!!current.data?.total && <nav className="document-pagination" aria-label="문서 페이지"><Button variant="secondary" disabled={offset === 0} onClick={() => setOffset(value => Math.max(0, value - 30))}>이전</Button><span>{Math.floor(offset / 30) + 1} / {Math.ceil(current.data.total / 30)}</span><Button variant="secondary" disabled={offset + 30 >= current.data.total} onClick={() => setOffset(value => value + 30)}>다음</Button></nav>}
    </>}
  </>;
}
