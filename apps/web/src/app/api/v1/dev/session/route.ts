import { readFile } from 'node:fs/promises';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export async function POST(request: NextRequest) {
  const headers = { 'Cache-Control': 'private, no-store' };
  if (process.env.APP_ENV !== 'development' || process.env.ENABLE_DEV_LOGIN !== '1' || !process.env.DEV_ACCOUNTS_FILE) {
    return new NextResponse(null, { status: 404, headers });
  }
  const origin = request.headers.get('origin');
  const allowedOrigins = new Set<string>();
  try {
    const configured = new URL(process.env.WEB_ORIGIN ?? '');
    if (configured.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(configured.hostname)
      && !configured.username && !configured.password && configured.pathname === '/' && !configured.search && !configured.hash) {
      for (const hostname of ['localhost', '127.0.0.1']) {
        configured.hostname = hostname;
        allowedOrigins.add(configured.origin);
      }
    }
  } catch { /* Invalid configuration fails closed. */ }
  if (!origin || !allowedOrigins.has(origin)) return NextResponse.json(
    { error: { code: 'ORIGIN_DENIED', message: '허용되지 않은 접속 주소입니다. 로컬 서비스 주소로 다시 접속해 주세요.' } },
    { status: 403, headers },
  );
  try {
    const text = await request.text();
    if (text.length > 256) return new NextResponse(null, { status: 413, headers });
    const { profile } = JSON.parse(text);
    if (!['member', 'treasurer', 'super_admin'].includes(profile)) return new NextResponse(null, { status: 422, headers });
    const base = new URL(process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:8000');
    if (base.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(base.hostname)) throw new Error('Invalid local API');
    const accounts = JSON.parse(await readFile(process.env.DEV_ACCOUNTS_FILE, 'utf8'));
    const account = accounts[profile];
    const response = await fetch(new URL('/api/v1/auth/login', base), {
      method: 'POST', headers: { 'Content-Type': 'application/json', origin, cookie: request.headers.get('cookie') ?? '' },
      body: JSON.stringify({ username: account.username, password: account.password }),
      cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(5000),
    });
    const outgoing = new Headers(headers);
    for (const name of ['content-type', 'set-cookie']) {
      const value = response.headers.get(name); if (value) outgoing.set(name, value);
    }
    return new NextResponse(await response.text(), { status: response.status, headers: outgoing });
  } catch {
    return NextResponse.json({ error: { code: 'DEV_LOGIN_UNAVAILABLE', message: '테스트 계정 설정을 확인해 주세요.' } }, { status: 503, headers });
  }
}
