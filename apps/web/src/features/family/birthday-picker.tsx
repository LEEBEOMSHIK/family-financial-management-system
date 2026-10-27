'use client';
import { useRef, useState, type KeyboardEvent } from 'react';

export type BirthdayValue = {year?:number|null;month:number;day:number};
export function daysInBirthdayMonth(calendar:string,month:number,year=2000){const leap=year%4===0 && (year%100!==0 || year%400===0);return calendar==='lunar' ? 30 : [31,leap?29:28,31,30,31,30,31,31,30,31,30,31][month-1] ?? 31;}
export function BirthdayPicker({calendar,value,onChange,today}:{today:string;calendar:string;value:BirthdayValue|null;onChange:(value:BirthdayValue|null)=>void}){
 const dialog=useRef<HTMLDialogElement>(null);const trigger=useRef<HTMLButtonElement>(null);
 const currentYear=Number(today.slice(0,4));
 const [year,setYear]=useState<number|null>(value?.year || null);
 const validYear=year!==null && Number.isInteger(year) && year>=1 && year<=currentYear;
 const [month,setMonth]=useState(value?.month || 1);
 function open(){setYear(value?.year || null);setMonth(value?.month || 1);dialog.current?.showModal();}
 function close(){dialog.current?.close();trigger.current?.focus();}
 function navigate(event:KeyboardEvent<HTMLDivElement>){
  const target=event.target as HTMLButtonElement;const day=Number(target.dataset.day);if(!day)return;
  const count=daysInBirthdayMonth(calendar,month,year || 2000);
  const destination=event.key==='ArrowRight'?day+1:event.key==='ArrowLeft'?day-1:event.key==='ArrowDown'?day+6:event.key==='ArrowUp'?day-6:event.key==='Home'?1:event.key==='End'?count:0;
  if(destination){event.preventDefault();dialog.current?.querySelector<HTMLButtonElement>(`[data-day="${Math.max(1,Math.min(count,destination))}"]`)?.focus();}
 }
 return <div className="fl-field"><span id="birthday-picker-label">생일 날짜</span><button ref={trigger} type="button" className="fl-input birthday-trigger" aria-label="생일 달력 열기" aria-haspopup="dialog" onClick={open}><span>{value ? `${value.year ? `${value.year}년 ` : '출생연도 미등록 · '}${value.month}월 ${value.day}일` : '달력에서 선택'}</span><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 11h18"/></svg></button>
 <dialog ref={dialog} className="birthday-dialog" aria-label="생일 달력"><div className="birthday-calendar-heading"><h2>{calendar==='lunar'?'음력':'양력'} 생일 선택</h2><button className="fl-button" data-variant="ghost" type="button" onClick={close}>닫기</button></div><p className="small muted">출생연도와 월을 고른 뒤 날짜를 선택하세요.</p>
 <label className="fl-field birthday-year">출생연도<input className="fl-input" aria-label="달력 연도" type="text" inputMode="numeric" maxLength={4} placeholder="예: 1990" value={year ?? ''} onChange={e=>{if(/^\d{0,4}$/.test(e.target.value))setYear(e.target.value ? Number(e.target.value) : null);}}/></label><div className="birthday-month-navigation"><button type="button" className="fl-button" data-variant="ghost" aria-label="이전 달" disabled={month===1 && (!validYear || year===1)} onClick={()=>{if(month===1){setYear(year!-1);setMonth(12);}else setMonth(month-1);}}>‹</button><select className="fl-input" aria-label="달력 월" value={month} onChange={e=>setMonth(Number(e.target.value))}>{Array.from({length:12},(_,i)=><option key={i+1} value={i+1}>{i+1}월</option>)}</select><button type="button" className="fl-button" data-variant="ghost" aria-label="다음 달" disabled={month===12 && (!validYear || year===currentYear)} onClick={()=>{if(month===12){setYear(year!+1);setMonth(1);}else setMonth(month+1);}}>›</button></div>
 <div className="birthday-days" role="group" aria-label={`${month}월 날짜`} onKeyDown={navigate}>{Array.from({length:daysInBirthdayMonth(calendar,month,year || 2000)},(_,i)=>i+1).map(day=><button className="birthday-day" type="button" key={day} data-day={day} aria-label={`${month}월 ${day}일`} disabled={!validYear || (calendar==='solar' && `${String(year).padStart(4,'0')}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`>today)} aria-pressed={value?.year===year&&value?.month===month&&value.day===day} onClick={()=>{onChange({year,month,day});close();}}>{day}</button>)}</div>
 <button type="button" className="fl-button" data-variant="ghost" onClick={()=>{onChange(null);close();}}>선택 지우기</button></dialog></div>;
}
