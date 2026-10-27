import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
const paths = /^(session|auth\/(login|register)|families\/[0-9a-f-]{36}\/(issues(?:\/[0-9a-f-]{36}(?:\/(?:events|image))?)?|documents(?:\/evidence(?:\/[0-9a-f-]{36}\/download)?|\/[0-9a-f-]{36}\/(?:versions|download|sync))?|participants(?:\/[0-9a-f-]{36}\/(?:invite|profile))?|dues(?:\/reconcile)?|dashboard-layout|dashboard(?:\/flow)?|transactions|management|roles|invitations|bank-accounts(?:\/[0-9a-f-]{36}\/(?:default|reveal))?|evidence(?:\/[0-9a-f-]{36}\/preview)?|expenses(?:\/[0-9a-f-]{36}(?:\/(?:decisions|evidence|payee-account|payment))?)?))$/;

async function boundedBody(request: NextRequest, limit: number) {
  const reader = request.body?.getReader();
  if (!reader) return undefined;
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw new RangeError('body limit'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const body = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  return body;
}

async function proxy(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  const resource = path.join('/');
  if (!paths.test(resource)) return NextResponse.json({ error: { code: 'NOT_FOUND', message: '요청한 항목을 찾을 수 없습니다.' } }, { status: 404 });
  const base = new URL(process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:8000');
  if (base.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname)) {
    return NextResponse.json({ error: { code: 'CONFIGURATION_ERROR', message: '서버 연결 설정을 확인해 주세요.' } }, { status: 503 });
  }
  const url = new URL(`/api/v1/${resource}`, base);
  url.search = request.nextUrl.search;
  const headers = new Headers({ 'Content-Type': request.headers.get('content-type') ?? 'application/json' });
  for (const key of ['cookie', 'origin', 'x-csrf-token']) {
    const value = request.headers.get(key);
    if (value) headers.set(key, value);
  }
  try {
    const upload = request.method === 'POST' && ((resource.endsWith('/evidence') && !resource.includes('/expenses/')) || resource.endsWith('/documents'));
    const body = request.method === 'GET' ? undefined : await boundedBody(request, upload || /\/issues(?:\/|$)/.test(resource) ? 6 * 1024 * 1024 : 4096);
    const response = await fetch(url, {
      method: request.method, headers, body: body || undefined,
      cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(5000),
    });
    const outgoing = new Headers({ 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
    for (const key of ['content-type', 'content-disposition', 'content-security-policy', 'set-cookie']) {
      const value = response.headers.get(key);
      if (value) outgoing.set(key, value);
    }
    return new NextResponse(response.status === 204 ? null : response.body, { status: response.status, headers: outgoing });
  } catch (error) {
    if (error instanceof RangeError) return NextResponse.json({ error: { code: 'FILE_TOO_LARGE', message: '파일은 6MiB 이하로 선택해 주세요.' } }, { status: 413, headers: { 'Cache-Control': 'private, no-store' } });
    return NextResponse.json({ error: { code: 'API_UNAVAILABLE', message: '서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.' } }, { status: 503, headers: { 'Cache-Control': 'private, no-store' } });
  }
}
export { proxy as GET, proxy as POST, proxy as DELETE };
