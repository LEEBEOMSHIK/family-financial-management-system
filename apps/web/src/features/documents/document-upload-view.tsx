'use client';
import { useRouter } from 'next/navigation';
import { useSession } from '../../components/app-shell';
import { BackButton } from '../../components/ui/BackButton';
import { Failed, Loading } from '../../components/resource-state';
import { useResource } from '../../lib/use-resource';
import type { components } from '../../generated/api';
import { DocumentUpload } from './document-upload';

type Listing = components['schemas']['DocumentList'];
export function DocumentUploadView({ kind, version }: { kind: 'bank' | 'family'; version?: string | string[] }) {
  const session = useSession();
  if (!session?.capabilities.includes('manage')) return <section className="fl-card"><h1>접근 권한이 없습니다</h1><p>문서 관리는 총무·총괄관리자만 사용할 수 있습니다.</p></section>;
  return <UploadContent key={`${kind}:${version || 'new'}`} kind={kind} version={version} familyId={session.family_id}/>;
}
function UploadContent({ kind, version, familyId }: { kind: 'bank' | 'family'; version?: string | string[]; familyId: string }) {
  const router = useRouter(); const listPath = `/documents/${kind}`;
  const validVersion = typeof version === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(version);
  const resource = useResource<Listing>(validVersion ? `/families/${familyId}/documents/${version}/versions` : null);
  const previous = resource.data?.items[0];
  const back = () => router.push(listPath);
  if (version !== undefined && (!validVersion || resource.loading || resource.error || !previous || previous.kind !== kind)) return <><BackButton onClick={back}/><h1>새 버전 등록</h1>{!validVersion ? <p role="alert" className="inline-error">문서를 찾을 수 없습니다.</p> : resource.loading ? <Loading/> : resource.error ? <Failed message={resource.error} retry={resource.retry}/> : <p role="alert" className="inline-error">같은 종류 문서에서 새 버전을 등록해 주세요.</p>}</>;
  return <DocumentUpload kind={kind} previous={previous} onClose={back} onSaved={item => router.replace(`${listPath}?saved=${item.id}`)}/>;
}
