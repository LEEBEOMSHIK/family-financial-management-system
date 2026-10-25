type Props = { amountKrw: string; showPositiveSign?: boolean; className?: string };

/** API integer strings stay precise beyond Number.MAX_SAFE_INTEGER. */
export function Money({ amountKrw, showPositiveSign = false, className = '' }: Props) {
  if (!/^-?(0|[1-9]\d*)$/.test(amountKrw)) {
    return <span className={className}>금액 확인 필요</span>;
  }
  const amount = BigInt(amountKrw);
  const sign = amount < 0n ? '−' : showPositiveSign && amount > 0n ? '+' : '';
  const magnitude = amount < 0n ? -amount : amount;
  return <span className={`fl-money ${className}`}>
    {sign}{new Intl.NumberFormat('ko-KR').format(magnitude)}원
  </span>;
}
