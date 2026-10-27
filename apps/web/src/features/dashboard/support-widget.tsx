'use client';
import Link from 'next/link';
import { useSession } from '../../components/app-shell';
import { Button } from '../../components/ui/Button';
import { Failed, Loading } from '../../components/resource-state';
import { useResource } from '../../lib/use-resource';
import { statusLabels, dateLabel, type IssueList } from '../support/shared';

export function SupportWidget(){
  const session=useSession();
  const allowed=session?.capabilities.includes('manage_roles');
  const base=allowed&&session?`/families/${session.family_id}/issues`:null;
  const received=useResource<IssueList>(base?`${base}?status=received`:null,true);
  const investigating=useResource<IssueList>(base?`${base}?status=investigating`:null,true);
  const needsInfo=useResource<IssueList>(base?`${base}?status=needs_info`:null,true);
  if(!allowed)return null;
  const resources=[received,investigating,needsInfo];
  const refresh=()=>resources.forEach(resource=>resource.refresh());
  const error=resources.find(resource=>resource.error)?.error;
  if(error)return <Failed message={error} retry={refresh}/>;
  if(resources.some(resource=>resource.loading||!resource.data))return <Loading/>;
  if(resources.some(resource=>!resource.data?.can_manage))return null;
  const groups=[{status:'received',data:received.data!},{status:'investigating',data:investigating.data!},{status:'needs_info',data:needsInfo.data!}] as const;
  const total=groups.reduce((count,group)=>count+group.data.total,0);
  const recent=groups.flatMap(group=>group.data.items).sort((a,b)=>b.created_at.localeCompare(a.created_at)||b.id.localeCompare(a.id)).slice(0,5);
  return <section className="fl-card support-widget" aria-label="문의·이슈 현황">
    <div className="section-heading"><h2>미해결 문의 <strong>{total}건</strong></h2><Button variant="ghost" onClick={refresh}>새로고침</Button></div>
    <div className="support-widget-counts">{groups.map(group=><Link key={group.status} data-status={group.status} href={`/support?status=${group.status}`} aria-label={`${statusLabels[group.status]} ${group.data.total}건 문의 보기`}><span className="support-status" data-status={group.status}>{statusLabels[group.status]}</span><strong>{group.data.total}건</strong></Link>)}</div>
    {recent.length?<><p className="small muted">미해결 문의 중 최근 등록 5건까지 표시합니다.</p><ul className="support-widget-list">{recent.map(item=><li key={item.id}><Link href={`/support/${item.id}`}><span className="support-status" data-status={item.status}>{statusLabels[item.status]}</span><strong>{item.title}</strong><span className="small muted">등록자 {item.author_name} · {dateLabel(item.created_at)}</span></Link></li>)}</ul></>:<p className="muted">미해결 문의가 없습니다.</p>}
    <Link className="section-link" href="/support">전체 문의 보기 →</Link>
  </section>;
}
