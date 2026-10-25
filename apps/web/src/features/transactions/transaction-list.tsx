import type { Transaction } from '../../lib/api';
import { Money } from '../../components/ui/Money';
import { StatusBadge } from '../../components/ui/StatusBadge';

export function TransactionList({ items }: { items: Transaction[] }) {
  if (!items.length) return <p className="empty-state">조건에 맞는 거래가 없습니다. 기간이나 입출금 구분을 바꿔보세요.</p>;
  return <div className="transaction-table-wrap"><table className="fl-table transaction-table"><caption className="sr-only">입출금 거래 목록</caption><thead><tr><th scope="col">거래일</th><th scope="col">내용 / 분류</th><th scope="col">구분</th><th scope="col" className="numeric">금액</th><th scope="col">대사 상태</th></tr></thead><tbody>{items.map(item => <tr key={item.id} data-testid="transaction-row"><td className="transaction-date"><time dateTime={item.occurred_on}>{item.occurred_on}</time></td><td className="transaction-description"><strong>{item.description}</strong><span className="small muted">{item.category}</span></td><td className="transaction-direction">{BigInt(item.amount_krw) < 0n ? '출금' : '입금'}</td><td className="numeric transaction-amount"><Money amountKrw={item.amount_krw} showPositiveSign/></td><td className="transaction-status"><StatusBadge status={item.reconciliation_status === 'reconciled' ? 'reconciled' : 'reconciliation_pending'}/></td></tr>)}</tbody></table></div>;
}
