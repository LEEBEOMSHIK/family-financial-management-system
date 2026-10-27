import { dateLabel } from '../documents/document-shared';
import type { Transaction } from '../../lib/api';
import { Money } from '../../components/ui/Money';

export function TransactionList({ items }: { items: Transaction[] }) {
  if (!items.length) return <p className="empty-state">조건에 맞는 거래가 없습니다. 기간이나 입출금 구분을 바꿔보세요.</p>;
  return <div className="transaction-table-wrap" data-report-id="transactions.list" data-report-label="입출금 내역 표" data-report-source="apps/web/src/features/transactions/transaction-list.tsx"><table className="fl-table transaction-table"><caption className="sr-only">입출금 거래 목록</caption><thead><tr><th scope="col">거래일</th><th scope="col">내용</th><th scope="col">구분</th><th scope="col" className="numeric">금액</th></tr></thead><tbody>{items.map(item => <tr key={item.id} data-report-item={item.id} data-testid="transaction-row"><td className="transaction-date"><time dateTime={item.occurred_at ?? item.occurred_on}>{item.occurred_at ? dateLabel(item.occurred_at) : item.occurred_on}</time></td><td className="transaction-description"><strong>{item.description || '내용 없음'}</strong></td><td className="transaction-direction">{BigInt(item.amount_krw) < 0n ? '출금' : '입금'}</td><td className="numeric transaction-amount"><Money amountKrw={item.amount_krw} showPositiveSign/></td></tr>)}</tbody></table></div>;
}
