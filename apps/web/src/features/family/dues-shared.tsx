'use client';
import { useRef, useState } from 'react';
import type { components } from '../../generated/api';
import { useSession } from '../../components/app-shell';
import { api } from '../../lib/api';
import { Money } from '../../components/ui/Money';
export type Overview = components['schemas']['DuesOverview'];
export type Command = components['schemas']['DuesCommand'];
export const statusLabels: Record<string,string> = { unconfigured:'회비 미설정', pending:'납부 대기', partial:'일부 납부', paid:'납부 완료', overdue:'기한 초과', awaiting_data:'자료 확인 필요' };
export const eventLabels = { fee:'회비 설정', deadline:'마감일 설정', payment:'입금 확인', reversal:'입금 연결 취소', reminder:'납부 요청 기록 · 미발송' };
export function Amount({ value }: { value: string | null }) { return value === null ? <span className="muted">미설정</span> : <Money amountKrw={value}/>; }
export function useDuesAction(refresh: () => void) {
  const session = useSession();
  const [busy,setBusy] = useState(false); const [message,setMessage] = useState(''); const [error,setError] = useState('');
  const pending = useRef<{ signature: string; operation: string } | null>(null);
  const locked = useRef(false);
  async function submit(command: Omit<Command,'operation_id'>) {
    if (!session || locked.current) return;
    locked.current=true; setBusy(true); setError(''); setMessage('');
    const signature=JSON.stringify(command);
    if (pending.current?.signature !== signature) pending.current={ signature,operation:crypto.randomUUID() };
    try {
      const result = await api<components['schemas']['DuesResult']>(`/families/${session.family_id}/dues`,{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':session.csrf_token},body:JSON.stringify({...command,operation_id:pending.current.operation})});
      pending.current=null; setMessage(result.message); refresh();
    } catch (failure) { setError(failure instanceof Error ? failure.message : '저장하지 못했습니다. 같은 작업으로 다시 시도해 주세요.'); }
    finally {locked.current=false;setBusy(false);}
  }
  async function reconcile() {
    if (!session || locked.current) return;
    locked.current=true; setBusy(true); setError(''); setMessage('');
    try {
      const result=await api<{message:string}>(`/families/${session.family_id}/dues/reconcile`,{method:'POST',headers:{'X-CSRF-Token':session.csrf_token}});
      setMessage(result.message); refresh();
    } catch(failure) { setError(failure instanceof Error ? failure.message : '입금 확인 결과를 확인하지 못했습니다. 다시 확인해 주세요.'); }
    finally {locked.current=false;setBusy(false);}
  }
  return {submit,reconcile,busy,message,error};
}
export function ActionNotice({ message,error }: {message:string;error:string}) { return <>{message && <p role="status">{message}</p>}{error && <p role="alert" className="inline-error">{error}</p>}</>; }

export function firstFeeMonth(startsOn:string){const year=Number(startsOn.slice(0,4));const month=Number(startsOn.slice(5,7));return `${year+(month===12?1:0)}-${String(month===12?1:month+1).padStart(2,'0')}`;}
