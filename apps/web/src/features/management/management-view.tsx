'use client';
import Link from 'next/link';
import type { components } from '../../generated/api';
import { useSession } from '../../components/app-shell';
import { useResource } from '../../lib/use-resource';
import type { Management } from '../../lib/api';
import { Failed, Loading } from '../../components/resource-state';

export function ManagementView() {
  const session = useSession(); const permitted = session?.capabilities.includes('manage');
  const resource = useResource<Management>(permitted && session ? `/families/${session.family_id}/management` : null);
  const expenses = useResource<components['schemas']['ExpenseList']>(permitted && session ? `/families/${session.family_id}/expenses` : null);
  if (!permitted) return <section className="fl-card"><h1>접근 권한이 없습니다</h1><p>현재 계정으로는 관리 메뉴를 사용할 수 없습니다.</p></section>;
  return <><h1>관리할 일</h1><p className="muted">요청과 증빙, 은행 거래 확인이 필요한 항목입니다.</p>{resource.loading ? <Loading/> : resource.error ? <Failed message={resource.error} retry={resource.retry}/> : resource.data && <div className="management-grid">{[
    ['출금 승인 대기', expenses.data ? expenses.data.items.filter(item => item.status === 'submitted').length : '확인 중'], ['증빙 확인 (예시)', resource.data.missing_evidence], ['은행 거래 확인 (예시)', resource.data.unreconciled_payments],
  ].map(([label, count]) => <section className="fl-card" key={label}><h2>{label}</h2><p className="metric">{count}{typeof count === 'number' ? '건' : ''}</p></section>)}</div>}{expenses.error && <Failed message={expenses.error} retry={expenses.retry}/>}<Link className="fl-button" data-variant="primary" href="/expenses">출금 요청 검토하기</Link><div className="development-notice"><strong>업무 처리 안내</strong><p>출금 요청은 DB의 실제 접수 내역입니다. 승인 규칙이 확정되어야 승인·반려할 수 있습니다. 증빙·은행 거래 확인 숫자는 예시입니다. 회비 설정과 납부 현황은 가족 관리에서 확인하며, 투표는 아직 제공하지 않습니다.</p><p>송금은 총무가 은행 앱에서 직접 수행합니다.</p></div></>;
}
