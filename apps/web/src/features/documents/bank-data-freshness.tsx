import { dateLabel } from './document-shared';

export function BankDataFreshness({ lastSyncedAt, dataThrough }: { lastSyncedAt?: string | null; dataThrough?: string | null }) {
  return <dl className="bank-data-freshness" aria-label="은행 자료 기준">
    <div><dt>마지막 동기화</dt><dd>{lastSyncedAt ? <time dateTime={lastSyncedAt}>{dateLabel(lastSyncedAt)} (한국 시간)</time> : '확인할 자료 없음'}</dd></div>
    <div><dt>거래내역 기준일</dt><dd>{dataThrough ? <time dateTime={dataThrough}>{dataThrough}</time> : '확인할 자료 없음'}</dd></div>
  </dl>;
}
