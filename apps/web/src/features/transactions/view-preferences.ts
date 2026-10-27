import { useEffect, useState } from 'react';

type Preferences={limit:number;showTotals:boolean};
const defaults:Preferences={limit:50,showTotals:false};
const unavailable='브라우저에서 설정을 저장할 수 없어 이 화면에서만 적용됩니다.';
export function useTransactionPreferences(family:string|undefined,user:string|undefined){
  const key=family&&user?`family-ledger:transactions:v1:${family}:${user}`:null;
  const [state,setState]=useState<{key:string;values:Preferences;error:string}|null>(null);
  useEffect(()=>{
    if(!key)return;
    let cancelled=false;
    queueMicrotask(()=>{
      let values=defaults;let error='';
      try{
        const raw=localStorage.getItem(key);
        if(raw){try{const saved:unknown=JSON.parse(raw);if(saved&&typeof saved==='object'){
          const item=saved as Record<string,unknown>;
          values={limit:typeof item.limit==='number'&&[20,50,100].includes(item.limit)?item.limit:50,showTotals:typeof item.showTotals==='boolean'?item.showTotals:false};
        }}catch{/* Malformed saved preferences fall back to safe defaults. */}}
      }catch{error=unavailable;}
      if(!cancelled)setState({key,values,error});
    });
    return()=>{cancelled=true;};
  },[key]);
  const ready=!!key&&state?.key===key;
  function update(patch:Partial<Preferences>){
    if(!key||!ready||!state)return;
    const values={...state.values,...patch};let error='';
    try{localStorage.setItem(key,JSON.stringify(values));}catch{error=unavailable;}
    setState({key,values,error});
  }
  return {ready,...(ready?state.values:defaults),error:ready?state.error:'',update};
}
