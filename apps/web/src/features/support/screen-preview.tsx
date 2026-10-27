import { useRef, useState, type PointerEvent } from 'react';
import type { Pin } from './shared';
import type { Mask } from './capture';
import { regionStyle } from './regions';

export function ScreenPreview({image,width,height,pins,masks=[],onMask}:{image:string|null;width:number;height:number;pins:Pin[];masks?:Mask[];onMask?:(mask:Mask)=>void}) {
  const start=useRef<{x:number;y:number}|null>(null);
  const [drag,setDrag]=useState<Mask|null>(null);
  function point(event:PointerEvent<HTMLDivElement>) {const rect=event.currentTarget.getBoundingClientRect();return {x:Math.max(0,Math.min(1,(event.clientX-rect.left)/rect.width)),y:Math.max(0,Math.min(1,(event.clientY-rect.top)/rect.height))};}
  function area(end:{x:number;y:number}):Mask {const origin=start.current!;return {x:Math.min(origin.x,end.x),y:Math.min(origin.y,end.y),width:Math.abs(origin.x-end.x),height:Math.abs(origin.y-end.y)};}
  return <div className="support-screen" style={{aspectRatio:`${width}/${height}`,touchAction:onMask?'none':undefined}} aria-label={onMask?'가릴 영역 선택':'신고 화면과 핀'}
    onPointerDown={event=>{if(!onMask)return;start.current=point(event);event.currentTarget.setPointerCapture(event.pointerId);}}
    onPointerMove={event=>{if(start.current)setDrag(area(point(event)));}}
    onPointerUp={event=>{if(start.current&&onMask){const rect=area(point(event));if(rect.width>.005&&rect.height>.005)onMask(rect);}start.current=null;setDrag(null);}}
    onPointerCancel={()=>{start.current=null;setDrag(null);}}>
    {image ? <img src={image} alt="등록 당시 화면"/> : <p className="muted">화면 이미지 없이 위치만 기록했습니다.</p>}
    {[...masks,...(drag?[drag]:[])].map((mask,index)=><span key={index} className="support-mask" style={{left:`${mask.x*100}%`,top:`${mask.y*100}%`,width:`${mask.width*100}%`,height:`${mask.height*100}%`}}/>)}
    {pins.map((pin,index)=>pin.region&&<div key={`area-${index}`} className="support-region support-preview-region" style={regionStyle(pin.region)}></div>)}
    {pins.map((pin,index)=><span key={index} className="support-pin-marker" style={{left:`${pin.x/100}%`,top:`${pin.y/100}%`}} title={pin.note}>{index+1}</span>)}
  </div>;
}
