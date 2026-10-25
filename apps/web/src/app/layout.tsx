import type { Metadata } from 'next';
import Script from 'next/script';
import type { ReactNode } from 'react';
import '../styles/globals.css';
import '../styles/service.css';
import '../styles/workspace.css';

export const metadata: Metadata = { title: '우리 가족 · 가족 장부', description: '가족 공동통장의 자금 흐름과 기록을 함께 확인합니다.' };
export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="ko" suppressHydrationWarning><body><Script src="/theme.js" strategy="beforeInteractive"/>{children}</body></html>;
}
