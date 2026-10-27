'use client';
import Link from 'next/link';
import { useState } from 'react';
import { documentSections } from '../features/documents/document-shared';
import { NavIcon } from './ui/NavIcon';

export function DocumentNavigation({ pathname, onNavigate }: { pathname: string; onNavigate: () => void }) {
  const active = pathname === '/documents' || pathname.startsWith('/documents/');
  const [open, setOpen] = useState(active);
  return <nav className="document-navigation" aria-label="문서 관리 메뉴">
    <button className="document-menu-toggle" type="button" aria-expanded={open} aria-controls="document-submenu" data-active={active} onClick={() => setOpen(value => !value)}>
      <NavIcon name="documents"/><span>문서 관리</span><svg className="document-menu-chevron" viewBox="0 0 20 20" aria-hidden="true"><path d="m6 8 4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
    </button>
    <div id="document-submenu" className="document-submenu" hidden={!open}>
      {documentSections.map(item => <Link className="document-subnav" key={item.key} href={`/documents/${item.key}`} onClick={onNavigate} aria-current={pathname === `/documents/${item.key}` || pathname.startsWith(`/documents/${item.key}/`) ? 'page' : undefined}>{item.label}</Link>)}
    </div>
  </nav>;
}
