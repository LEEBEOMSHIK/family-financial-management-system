const states = {
  draft: { label: '작성 중', tone: 'neutral' },
  submitted: { label: '승인 대기', tone: 'warning' },
  approved: { label: '승인됨', tone: 'info' },
  reported_paid: { label: '송금 기록됨 · 대사 필요', tone: 'warning' },
  reconciliation_pending: { label: '대사 필요', tone: 'warning' },
  reconciled: { label: '대사 완료', tone: 'success' },
  rejected: { label: '반려됨', tone: 'danger' },
  overdue: { label: '미처리', tone: 'danger' },
  cancelled: { label: '취소됨', tone: 'neutral' },
} as const;

export type Status = keyof typeof states;
export function StatusBadge({ status }: { status: Status }) {
  const item = states[status];
  return <span className="fl-badge" data-tone={item.tone}>{item.label}</span>;
}
