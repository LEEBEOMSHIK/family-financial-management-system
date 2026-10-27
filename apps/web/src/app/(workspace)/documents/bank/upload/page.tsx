import { DocumentUploadView } from '../../../../../features/documents/document-upload-view';
export default async function Page({ searchParams }: { searchParams: Promise<{ version?: string | string[] }> }) {
  const params = await searchParams;
  return <DocumentUploadView kind="bank" version={params.version}/>;
}
