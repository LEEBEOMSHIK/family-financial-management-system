'use client';
import { useEffect, useRef, useState } from 'react';
import { useSession } from '../../components/app-shell';
import { Button } from '../../components/ui/Button';
import { api } from '../../lib/api';

export function AccountReveal({ path }: { path: string }) {
  const session = useSession();
  const [number, setNumber] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => {
    const clear = () => { pending.current?.abort(); setNumber(''); setBusy(false); };
    const hidden = () => { if (document.hidden) clear(); };
    document.addEventListener('visibilitychange', hidden); window.addEventListener('pagehide', clear);
    return () => { pending.current?.abort(); document.removeEventListener('visibilitychange', hidden); window.removeEventListener('pagehide', clear); };
  }, []);
  async function reveal() {
    if (!session) return;
    const controller = new AbortController(); pending.current = controller; setBusy(true); setError('');
    try {
      const result = await api<{ account_number: string }>(path, { method: 'POST', signal: controller.signal, headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': session.csrf_token }, body: '{}' });
      if (!controller.signal.aborted) setNumber(result.account_number);
    } catch { if (!controller.signal.aborted) setError('계좌번호를 확인하지 못했습니다.'); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }
  return <div className="account-reveal">{number ? <><p aria-live="polite">전체 계좌번호: <span>{number}</span></p><Button variant="ghost" onClick={() => setNumber('')}>계좌번호 닫기</Button></> : <Button variant="ghost" pending={busy} onClick={reveal}>계좌번호 확인</Button>}{error && <p role="alert" className="inline-error">{error}</p>}</div>;
}
