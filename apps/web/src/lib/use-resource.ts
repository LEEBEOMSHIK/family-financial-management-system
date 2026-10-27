'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from './api';

type State<T> = { path: string; data?: T; error?: string; loading: boolean };
export function useResource<T>(path: string | null, revalidateOnFocus = false) {
  const router = useRouter();
  const [state, setState] = useState<State<T>>({ path: '', loading: true });
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!revalidateOnFocus) return;
    const refresh = () => { if (document.visibilityState === 'visible') setRevision(value => value + 1); };
    window.addEventListener('focus', refresh);
    window.addEventListener('family-ledger:refresh', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => { window.removeEventListener('focus', refresh); window.removeEventListener('family-ledger:refresh', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, [revalidateOnFocus]);
  useEffect(() => {
    if (!path) return;
    const controller = new AbortController();
    api<T>(path, { signal: controller.signal }).then(data => {
      if (!controller.signal.aborted) setState({ path, data, loading: false });
    }).catch((error: unknown) => {
      if (!controller.signal.aborted && error instanceof ApiError && error.status === 401) {
        router.replace('/login');
      }
      if (!controller.signal.aborted) setState({ path, error: error instanceof Error ? error.message : '자료를 불러오지 못했습니다.', loading: false });
    });
    return () => controller.abort();
  }, [path, revision, router]);
  const current = state.path === path ? state : { loading: true, data: undefined, error: undefined };
  return { ...current, refresh: () => { if (revalidateOnFocus) window.dispatchEvent(new Event('family-ledger:refresh')); else setRevision(n => n + 1); }, retry: () => { setState({ path: '', loading: true }); setRevision(n => n + 1); } };
}
