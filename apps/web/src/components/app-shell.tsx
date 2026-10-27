'use client';
import Link from 'next/link';
import { pageTarget } from '../features/support/target-catalog';
import { ReportLauncher } from '../features/support/reporter';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, ApiError, type Session } from '../lib/api';
import { ThemeControl } from './theme-control';
import { Button } from './ui/Button';
import { NavIcon } from './ui/NavIcon';
import { DocumentNavigation } from './document-navigation';
import { documentSections } from '../features/documents/document-shared';

const SessionContext = createContext<Session | null>(null);
export const useSession = () => useContext(SessionContext);

export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter(); const pathname = usePathname();
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    api<Session>('/session', { signal: controller.signal }).then(setSession).catch((failure: unknown) => {
      if (controller.signal.aborted) return;
      if (failure instanceof ApiError && failure.status === 401) router.replace('/login');
      else setError(failure instanceof Error ? failure.message : '로그인 상태를 확인하지 못했습니다.');
    });
    return () => controller.abort();
  }, [router, pathname]);
  async function logout() {
    if (!session) return;
    setBusy(true); setError('');
    try {
      await api<void>('/session', { method: 'DELETE', headers: { 'X-CSRF-Token': session.csrf_token } });
      setSession(null); router.replace('/login'); router.refresh();
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 401) {
        setSession(null); router.replace('/login'); router.refresh();
      } else setError(failure instanceof Error ? failure.message : '로그아웃하지 못했습니다.');
    }
    finally { setBusy(false); }
  }
  if (!session) return <main className="center-state">{error ? <><h1>연결을 확인해 주세요</h1><p role="alert">{error}</p><Button onClick={() => location.reload()}>다시 시도</Button></> : <p role="status">로그인 상태를 확인하고 있습니다.</p>}</main>;
  const links = [{ href: '/dashboard', label: '대시보드' }, { href: '/transactions', label: '입출금 내역' }, { href: '/expenses', label: '출금 요청' }, { href: '/accounts', label: '내 계좌' }, { href: '/support', label: '문의·이슈' }];
  const currentLabel = pathname.startsWith('/support') ? '문의·이슈' : pathname.startsWith('/documents') ? (documentSections.find(item => pathname === `/documents/${item.key}` || pathname.startsWith(`/documents/${item.key}/`))?.label || '문서 관리') : pathname.startsWith('/family') ? '가족 관리' : pathname === '/roles' ? '권한 관리' : links.find(link => link.href === pathname)?.label || '관리할 일';
  const roleLabel = session.capabilities.includes('manage_roles') ? '총괄관리자' : session.capabilities.includes('manage') ? '총무' : '일반사용자';
  return <SessionContext.Provider value={session}><a className="skip-link" href="#main">본문으로 이동</a><div className="service-shell">
    <aside className="service-sidebar" data-report-id="app.navigation" data-report-label="메뉴 탐색" data-report-source="apps/web/src/components/app-shell.tsx"><div className="sidebar-brand-row"><Link className="service-brand" href="/dashboard" onClick={() => setMenuOpen(false)}><span aria-hidden="true">우</span><span className="brand-name">우리 가족<small>FAMILY LEDGER</small></span></Link><button className="mobile-menu" aria-expanded={menuOpen} aria-controls="service-navigation" onClick={() => setMenuOpen(!menuOpen)}><NavIcon name="menu"/>메뉴</button></div><p className="muted small">가족 공동통장 관리</p>
      <div id="service-navigation" className="service-navigation" data-open={menuOpen}><p className="nav-label">우리 가족의 재무</p><nav aria-label="공통 메뉴">{links.map(link => <Link key={link.href} href={link.href} onClick={() => setMenuOpen(false)} aria-current={pathname === link.href ? 'page' : undefined}><NavIcon name={link.href.slice(1)}/>{link.label}</Link>)}</nav>
      {session.capabilities.includes('manage') && <><p className="nav-label">운영 관리</p><nav aria-label="관리 메뉴"><Link href="/family" onClick={() => setMenuOpen(false)} aria-current={pathname === '/family' ? 'page' : undefined}><NavIcon name="family"/>가족 관리</Link><Link href="/management" onClick={() => setMenuOpen(false)} aria-current={pathname === '/management' ? 'page' : undefined}><NavIcon name="management"/>관리할 일</Link></nav></>}
      {session.capabilities.includes('manage') && <DocumentNavigation key={pathname} pathname={pathname} onNavigate={() => setMenuOpen(false)}/>}
      {session.capabilities.includes('manage_roles') && <nav aria-label="권한 관리 메뉴"><Link href="/roles" onClick={() => setMenuOpen(false)} aria-current={pathname === '/roles' ? 'page' : undefined}><NavIcon name="roles"/>권한 관리</Link></nav>}</div>
      <div className="sidebar-note"><span className="workspace-badge">개발 워크스페이스</span><p>자료 출처와 기준시각을 각 화면에서 확인하세요.</p><div className="sidebar-identity"><span className="user-avatar" aria-hidden="true">{session.user.display_name.slice(0,1)}</span><div><strong>{session.user.display_name}</strong><span>{roleLabel}</span></div></div></div>
    </aside><div className="service-workspace"><header className="service-header" data-report-id="app.header" data-report-label="공통 상단 메뉴" data-report-source="apps/web/src/components/app-shell.tsx"><div className="workspace-location"><span>우리 가족</span><span aria-hidden="true">/</span><strong>{currentLabel}</strong></div><div className="header-controls"><ReportLauncher key={pathname} screenName={currentLabel} path={pathname}/><ThemeControl/><span className="user-chip"><span aria-hidden="true" className="user-avatar">{session.user.display_name.slice(0,1)}</span>{session.user.display_name}</span><Button variant="ghost" pending={busy} onClick={logout}>로그아웃</Button></div></header>
      {error && <p className="inline-error" role="alert">{error}</p>}
      <main id="main" className="service-main" data-report-id={pageTarget(pathname).id} data-report-label={currentLabel} data-report-source={pageTarget(pathname).source}>{children}</main>
    </div></div></SessionContext.Provider>;
}
