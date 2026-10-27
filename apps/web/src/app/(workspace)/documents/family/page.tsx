import { DocumentsView } from '../../../../features/documents/documents-view';
export default async function Page({ searchParams }: { searchParams: Promise<{ saved?: string | string[] }> }) {
  const params = await searchParams;
  return <DocumentsView section="family" savedId={typeof params.saved === 'string' ? params.saved : undefined}/>;
}
