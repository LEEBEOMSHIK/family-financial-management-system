'use client';
import { useId, useState, type MouseEvent, type FocusEvent } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '../../components/ui/Button';
import type { Overview } from './dues-shared';

type Member = Overview['members'][number];
export function reminderReason(data: Overview, member: Member, busy: boolean): string | null {
  if (busy) return '요청을 처리 중입니다. 잠시 기다려 주세요.';
  if (member.amount_krw === null) return member.next_fee_month
    ? `${member.next_fee_month}부터 회비가 적용됩니다. 조회 중인 ${data.month}에는 납부 요청 대상이 아닙니다.`
    : '조회 월에 적용되는 회비가 없습니다. 총괄관리자가 구성원 정보에서 월 회비와 시작일을 설정해야 합니다.';
  if (!data.due_day) return '공통 납부마감일이 설정되지 않았습니다. 총괄관리자가 마감일을 설정해야 합니다.';
  if (data.month > data.today.slice(0, 7)) return '미래 월의 회비는 아직 납부 요청할 수 없습니다.';
  if (member.remaining_krw === null || BigInt(member.remaining_krw) === 0n) return '남은 납부 금액이 없어 납부 요청할 수 없습니다.';
  return null;
}

export function ReminderButton({ data, member, busy, onRequest, variant = 'ghost' }: {
  data: Overview; member: Member; busy: boolean; onRequest: () => void; variant?: 'ghost' | 'secondary';
}) {
  const id = useId();
  const reason = reminderReason(data, member, busy);
  const [position, setPosition] = useState<{ left: number; bottom: number } | null>(null);
  function show(event: MouseEvent<HTMLButtonElement> | FocusEvent<HTMLButtonElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    setPosition({ left: Math.max(8, Math.min(rect.right - 300, window.innerWidth - 308)), bottom: window.innerHeight - rect.top + 8 });
  }
  return <>
    <Button variant={variant} aria-disabled={!!reason} aria-describedby={reason ? id : undefined}
      onMouseEnter={show} onMouseLeave={() => setPosition(null)} onFocus={show} onBlur={() => setPosition(null)}
      onKeyDown={event => { if (event.key === 'Escape') setPosition(null); }}
      onClick={event => { if (reason) show(event); else onRequest(); }}>납부 요청</Button>
    {reason && <span id={id} className="sr-only">{reason}</span>}
    {reason && position && createPortal(<div role="tooltip" className="dues-request-tooltip" style={position}>{reason}</div>, document.body)}
  </>;
}
