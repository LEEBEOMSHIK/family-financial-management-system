'use client';
import Link from 'next/link';
import { useRef, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from '../../components/app-shell';
import { Button } from '../../components/ui/Button';
import { Failed, Loading } from '../../components/resource-state';
import { useResource } from '../../lib/use-resource';
import { api } from '../../lib/api';
import { statusLabels,dateLabel,type IssueList,type Issue } from './shared';

export function SupportList(){
  const session=useSession();const router=useRouter();const [q,setQ]=useState('');const params=useSearchParams();const requested=params.get('status')||'';const status=Object.hasOwn(statusLabels,requested)?requested:'';
  const [page,setPage]=useState({status,offset:0});const offset=page.status===status?page.offset:0;
  const setOffset=(value:number)=>setPage({status,offset:value});
  function setStatus(value:string){const next=new URLSearchParams(params.toString());if(value)next.set('status',value);else next.delete('status');router.replace(`/support${next.size?'?'+next.toString():''}`,{scroll:false});}
  const [compose,setCompose]=useState(false);const [title,setTitle]=useState('');const [description,setDescription]=useState('');const [busy,setBusy]=useState(false);const [error,setError]=useState('');const locked=useRef(false);const pending=useRef<{signature:string;id:string}|null>(null);
  const resource=useResource<IssueList>(session?`/families/${session.family_id}/issues?q=${encodeURIComponent(q)}&offset=${offset}${status?`&status=${status}`:''}`:null,true);
  async function submit(event:FormEvent){event.preventDefault();if(!session||locked.current)return;locked.current=true;setBusy(true);setError('');const body={title,description,path:'/support',screen_name:'문의·이슈',viewport_width:window.innerWidth,viewport_height:window.innerHeight,pins:[]};const signature=JSON.stringify(body);if(pending.current?.signature!==signature)pending.current={signature,id:crypto.randomUUID()};try{const item=await api<Issue>(`/families/${session.family_id}/issues`,{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':session.csrf_token},body:JSON.stringify({...body,operation_id:pending.current.id})});router.push(`/support/${item.id}`);}catch(failure){setError(failure instanceof Error?failure.message:'등록하지 못했습니다.');}finally{locked.current=false;setBusy(false);}}
  return <><div className="page-title page-title-with-actions"><div><h1>문의·이슈</h1><p className="muted">{session?.capabilities.includes('manage_roles')?'가족의 문의를 확인하고 처리 상황을 안내하세요.':'내 문의와 총괄관리자의 답변을 확인하세요.'}</p></div><Button onClick={()=>setCompose(!compose)}>문의 작성</Button></div>
    <p className="data-notice">화면의 문제는 해당 화면 상단 ‘문제 신고’에서 최대 5곳을 표시해 등록할 수 있습니다.</p>
    {compose&&<form className="fl-card support-compose" onSubmit={submit}><h2>일반 문의</h2><label className="fl-field">문의 제목<input className="fl-input" value={title} onChange={event=>setTitle(event.target.value)} maxLength={120} required disabled={busy}/></label><label className="fl-field">문의 내용<textarea className="fl-input" value={description} onChange={event=>setDescription(event.target.value)} maxLength={3000} required disabled={busy}/></label>{error&&<p role="alert">{error}</p>}<Button type="submit" pending={busy}>문의 등록</Button></form>}
    <div className="filters"><label className="fl-field">문의 검색<input type="search" className="fl-input" maxLength={120} value={q} onChange={event=>{setQ(event.target.value);setOffset(0);}} placeholder="제목 또는 내용"/></label><label className="fl-field">상태 필터<select className="fl-input" value={status} onChange={event=>{setStatus(event.target.value);setOffset(0);}}><option value="">전체 상태</option>{Object.entries(statusLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label></div>
    {resource.loading?<Loading/>:resource.error?<Failed message={resource.error} retry={resource.retry}/>:resource.data&&<><p className="list-summary">총 {resource.data.total}건 · {resource.data.can_manage?'가족 전체 문의':'내가 등록한 문의'}</p><div className="support-list">{resource.data.items.map(item=><Link href={`/support/${item.id}`} className="fl-card support-list-item" key={item.id}><div><span className="support-status" data-status={item.status}>{statusLabels[item.status]}</span><h2>{item.title}</h2><p className="muted">{item.screen_name} · 핀 {item.pins.length}개</p></div><div className="support-author"><p><span className="muted">등록자</span> <strong>{item.author_name}</strong></p><p className="small muted">등록일 <time dateTime={item.created_at}>{dateLabel(item.created_at)}</time></p></div></Link>)}</div>{resource.data.total===0&&<section className="fl-card"><h2>등록된 문의가 없습니다</h2><p className="muted">궁금한 점이나 사용 중 불편한 점을 남겨 주세요.</p></section>}<div className="support-actions"><Button variant="ghost" disabled={!offset} onClick={()=>setOffset(Math.max(0,offset-30))}>이전</Button><Button variant="ghost" disabled={offset+30>=resource.data.total} onClick={()=>setOffset(offset+30)}>다음</Button></div></>}
  </>;
}
