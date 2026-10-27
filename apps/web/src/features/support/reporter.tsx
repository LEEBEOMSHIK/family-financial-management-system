'use client';
import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { useRouter } from 'next/navigation';
import { NavIcon } from '../../components/ui/NavIcon';
import { Button } from '../../components/ui/Button';
import { useSession } from '../../components/app-shell';
import { api } from '../../lib/api';
import { captureScreen, maskedImage, type Mask, type Snapshot } from './capture';
import { ScreenPreview } from './screen-preview';
import type { Issue, Pin } from './shared';
import { collectTargets, targetAt, regionStyle, type Target, type Selection } from './regions';

export function ReportLauncher({screenName,path}:{screenName:string;path:string}) {
  const [draft,setDraft]=useState<{snapshot:Snapshot;targets:Target[]}|null>(null);
  function start(){setDraft({snapshot:{image:null,width:innerWidth,height:innerHeight,error:''},targets:collectTargets()});}
  return <><Button variant="secondary" onClick={start} data-report-exclude><NavIcon name="support"/>문제 신고</Button>{draft&&<Reporter initialSnapshot={draft.snapshot} targets={draft.targets} screenName={screenName} path={path} close={()=>setDraft(null)}/>}</>;
}
function Reporter({initialSnapshot,targets,screenName,path,close}:{initialSnapshot:Snapshot;targets:Target[];screenName:string;path:string;close:()=>void}) {
  const [snapshot,setSnapshot]=useState(initialSnapshot);
  const [hover,setHover]=useState<Selection|null>(null);
  const session=useSession();const router=useRouter();const dialog=useRef<HTMLDialogElement>(null);
  const [pins,setPins]=useState<Pin[]>([]);const [selected,setSelected]=useState(-1);const [review,setReview]=useState(false);
  const [title,setTitle]=useState(`${screenName} 문의`);const [description,setDescription]=useState('');
  const [include,setInclude]=useState(true);const [redact,setRedact]=useState(false);const [masks,setMasks]=useState<Mask[]>([]);
  const [toolbarTop,setToolbarTop]=useState(false);
  const [error,setError]=useState(snapshot.error);const [busy,setBusy]=useState(false);const lock=useRef(false);
  const pending=useRef<{signature:string;operation:string}|null>(null);
  const noteInput=useRef<HTMLInputElement>(null);
  const focusNewPin=useRef(false);
  useEffect(()=>{if(focusNewPin.current){noteInput.current?.focus({preventScroll:true});focusNewPin.current=false;}},[pins.length]);
  const drag=useRef<{index:number;x:number;y:number;moved:boolean}|null>(null);
  useEffect(()=>{const modal=dialog.current;modal?.showModal();return()=>modal?.close();},[]);
  useEffect(()=>{
    const modal=dialog.current;if(!modal||review)return;
    const stopScroll=(event:WheelEvent)=>{if(!(event.target instanceof Element&&event.target.closest('.support-pin-toolbar')))event.preventDefault();};
    modal.addEventListener('wheel',stopScroll,{passive:false});
    return()=>modal.removeEventListener('wheel',stopScroll);
  },[review]);
  const changedSize=()=>window.innerWidth!==snapshot.width||window.innerHeight!==snapshot.height;
  function add(x:number,y:number,selection=targetAt(targets,x,y)){
    if(!selection){setError('문제가 있는 위젯이나 버튼 위에서 선택해 주세요.');return;}
    if(changedSize()){setError('화면 크기가 바뀌었습니다. 닫은 뒤 문제 신고를 다시 시작해 주세요.');return;}
    if(pins.length>=5){setError('핀은 최대 5개까지 표시할 수 있습니다.');return;}
    focusNewPin.current=true;
    setPins([...pins,{x:Math.round(x/window.innerWidth*10000),y:Math.round(y/window.innerHeight*10000),note:'',...selection}]);setSelected(pins.length);setHover(null);setError('');
  }
  function hoverAt(event:PointerEvent<HTMLDivElement>){setHover(targetAt(targets,event.clientX,event.clientY));}
  function finishSelection(event:PointerEvent<HTMLDivElement>){add(event.clientX,event.clientY);}
  async function showReview(){
    if(pins.some(pin=>!pin.note.trim())){setError('각 핀의 설명을 입력해 주세요.');return;}
    if(busy)return;setBusy(true);setHover(null);
    const shot=await captureScreen();setSnapshot(shot);setInclude(!!shot.image);setMasks([]);setReview(true);setError(shot.error);setBusy(false);
  }
  function update(index:number,values:Partial<Pin>){setPins(previous=>previous.map((pin,i)=>i===index?{...pin,...values}:pin));}
  function move(event:PointerEvent<HTMLButtonElement>){
    const value=drag.current;if(!value)return;
    if(Math.abs(value.x-event.clientX)+Math.abs(value.y-event.clientY)>3)value.moved=true;
    const selection=targetAt(targets,event.clientX,event.clientY);
    if(value.moved&&selection)update(value.index,{x:Math.round(Math.max(0,Math.min(1,event.clientX/window.innerWidth))*10000),y:Math.round(Math.max(0,Math.min(1,event.clientY/window.innerHeight))*10000),...selection});
  }
  async function submit(){
    if(!session||lock.current)return;
    if(pins.some(pin=>!pin.note.trim())){setError('각 핀의 설명을 입력해 주세요.');return;}
    const text=description.trim()||pins.map((pin,i)=>`${i+1}. ${pin.note}`).join('\n');
    if(!title.trim()||!text){setError('문의 제목과 간단한 설명을 입력해 주세요.');return;}
    lock.current=true;setBusy(true);setError('');
    try{
      const image=include&&snapshot.image?await maskedImage(snapshot.image,masks):null;
      const body={title,description:text,path,screen_name:screenName,viewport_width:snapshot.width,viewport_height:snapshot.height,pins,image_base64:image};
      const signature=JSON.stringify(body);if(pending.current?.signature!==signature)pending.current={signature,operation:crypto.randomUUID()};
      const result=await api<Issue>(`/families/${session.family_id}/issues`,{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':session.csrf_token},body:JSON.stringify({...body,operation_id:pending.current.operation})});
      close();router.push(`/support/${result.id}`);
    }catch(failure){setError(failure instanceof Error?failure.message:'등록하지 못했습니다. 다시 시도해 주세요.');}finally{lock.current=false;setBusy(false);}
  }
  return <dialog ref={dialog} className={`support-reporter ${review?'is-review':''}`} aria-label={review?'문의 등록 확인':'문제 위치 표시'} data-report-exclude onKeyDown={event=>{if(!review&&!(event.target instanceof HTMLInputElement)&&['PageDown','PageUp','Home','End'].includes(event.key))event.preventDefault();}} onCancel={event=>{event.preventDefault();if(!busy)setError('작성 중인 내용을 유지했습니다. 취소하려면 닫기를 눌러 주세요.');}}>
    {!review?<>
      <div className="support-hit-area" role="button" tabIndex={0} aria-label="문제 위치 선택 영역"
        onPointerMove={hoverAt} onPointerLeave={()=>setHover(null)}
        onPointerDown={event=>event.currentTarget.setPointerCapture(event.pointerId)}
        onPointerUp={finishSelection} onPointerCancel={()=>setHover(null)}
        onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();add(window.innerWidth/2,window.innerHeight/3);}}}/>
      {hover&&<div className="support-region support-region-hover" style={regionStyle(hover.region)}></div>}
      {pins.map((pin,index)=>pin.region&&<div key={`region-${index}`} className="support-region" data-selected={index===selected} style={regionStyle(pin.region)}></div>)}
      {pins.map((pin,index)=><button key={index} className="support-pin" aria-label={`핀 ${index+1}`} aria-pressed={index===selected} style={{left:`${pin.x/100}%`,top:`${pin.y/100}%`}}
        onPointerDown={event=>{event.currentTarget.setPointerCapture(event.pointerId);drag.current={index,x:event.clientX,y:event.clientY,moved:false};setSelected(index);}}
        onPointerMove={move} onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}} onClick={()=>setSelected(index)}
        onKeyDown={event=>{const delta=event.shiftKey?500:100;const directions:Record<string,[number,number]>={ArrowLeft:[-delta,0],ArrowRight:[delta,0],ArrowUp:[0,-delta],ArrowDown:[0,delta]};const direction=directions[event.key];if(direction){event.preventDefault();const [dx,dy]=direction;const x=Math.max(0,Math.min(10000,pin.x+dx)),y=Math.max(0,Math.min(10000,pin.y+dy));const destination=targetAt(targets,x/10000*innerWidth,y/10000*innerHeight);if(destination)update(index,{x,y,...destination});}}}>{index+1}</button>)}
      <section className="support-pin-toolbar" data-top={toolbarTop}><div><strong>문제 위치 표시 · {pins.length}/5</strong><p className="small muted">문제가 있는 텍스트·위젯·버튼에 마우스를 올려 확인한 뒤 클릭하세요. 선택한 대상은 핀과 함께 기록됩니다.</p></div>
        <p className="support-target-label"><span>가리키는 대상</span><strong>{hover?.label||'화면의 텍스트나 요소에 마우스를 올려 주세요.'}</strong></p>
        {selected>=0&&pins[selected]&&<div className="support-pin-editor"><label className="fl-field"><strong className="support-selected-label">{selected+1}. {pins[selected].label||'선택 영역'}</strong>선택한 핀 설명<input ref={noteInput} className="fl-input" maxLength={500} value={pins[selected].note} onChange={event=>update(selected,{note:event.target.value})} placeholder={`${selected+1}번 위치에서 어떤 문제가 있나요?`}/></label><Button variant="ghost" onClick={()=>{setPins(pins.filter((_,i)=>i!==selected));setSelected(-1);}}>선택 핀 삭제</Button></div>}
        {error&&<p role="alert" className="inline-error">{error}</p>}
        <div className="support-actions"><Button variant="ghost" onClick={()=>setToolbarTop(!toolbarTop)}>{toolbarTop?'도구 아래로':'도구 위로'}</Button><Button variant="ghost" disabled={busy} onClick={close}>닫기</Button><Button pending={busy} onClick={()=>void showReview()}>내용 확인</Button></div>
      </section>
    </>:<div className="support-review"><h2>문의 등록 확인</h2><p className="muted">{screenName} · {pins.length}개 위치 표시. 총괄관리자가 확인합니다.</p>
      <label className="fl-field">문의 제목<input className="fl-input" value={title} onChange={event=>setTitle(event.target.value)} maxLength={120} disabled={busy}/></label>
      <label className="fl-field">추가 설명{pins.length>0?' (선택)':''}<textarea className="fl-input" value={description} onChange={event=>setDescription(event.target.value)} maxLength={3000} placeholder="어떤 상황에서 문제가 발생했나요?" disabled={busy}/></label>
      <ol className="support-pin-notes">{pins.map((pin,index)=><li key={index}><strong>{pin.label||'선택 영역'}</strong> — {pin.note}</li>)}</ol>
      {snapshot.image&&<><label><input type="checkbox" checked={include} onChange={event=>setInclude(event.target.checked)} disabled={busy}/> 등록 당시 화면 첨부</label>{include&&<><div className="support-actions"><Button variant="secondary" aria-pressed={redact} onClick={()=>setRedact(!redact)} disabled={busy}>가릴 영역 표시</Button><Button variant="ghost" disabled={busy||!masks.length} onClick={()=>setMasks(masks.slice(0,-1))}>가리기 취소</Button></div><p className="small muted">{redact?'아래 화면에서 가릴 영역을 드래그하세요.':'제출할 화면을 확인하세요. 불필요한 정보는 가리거나 화면 첨부를 해제할 수 있습니다.'}</p><ScreenPreview image={snapshot.image} width={snapshot.width} height={snapshot.height} pins={pins} masks={masks} onMask={redact&&!busy?mask=>setMasks([...masks,mask]):undefined}/></>}</>}
      {error&&<p role="alert" className="inline-error">{error}</p>}
      <div className="support-actions"><Button variant="ghost" disabled={busy} onClick={()=>setReview(false)}>핀 다시 수정</Button><Button pending={busy} onClick={()=>void submit()}>문의 등록</Button></div>
    </div>}
  </dialog>;
}
