import type { Pin } from './shared';
import { pageTarget } from './target-catalog';
export type Region = NonNullable<Pin['region']>;
export type Target = {element:HTMLElement;label:string;kind:string;priority:number;context:NonNullable<Pin['context']>};
export type Selection = {region:Region;label:string;target:string;context:NonNullable<Pin['context']>};
const widgetNames:Record<string,string>={balance:'잔액 위젯',flow:'우리 가족 자금 흐름 위젯',tasks:'내 할 일 위젯',dues:'회비 미납 현황 위젯',income_expense:'입출금 위젯'};
const clean=(text:string)=>text.replace(/\s+/g,' ').trim().slice(0,100);
function fieldLabel(element:HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement):string {
  const label=element.labels?.[0];if(!label)return '';
  const clone=label.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('input,select,textarea,option,button,[data-report-exclude]').forEach(node=>node.remove());
  return clone.textContent||'';
}
function selectorFor(element:HTMLElement,owner:HTMLElement):{locator:string;elementId:string}{
  let root=owner;let locator=`[data-report-id="${CSS.escape(owner.dataset.reportId!)}"]`;
  const row=element.closest<HTMLElement>('[data-report-item]');
  if(row&&owner.contains(row)){root=row;locator+=` [data-report-item="${CSS.escape(row.dataset.reportItem!)}"]`;}
  const testId=element.dataset.testid;
  const token=testId||element.getAttribute('name');
  if(token&&/^[a-zA-Z0-9_.:-]+$/.test(token)){
    const attribute=testId?'data-testid':'name',specific=`[${attribute}="${CSS.escape(token)}"]`;
    if(root===element)return {locator,elementId:token};
    if(root.querySelectorAll(specific).length===1)return {locator:`${locator} ${specific}`,elementId:token};
  }
  const parts:string[]=[];let current:HTMLElement|null=element;
  while(current&&current!==root){const parent:HTMLElement|null=current.parentElement;if(!parent)break;const tag=current.tagName.toLowerCase();const siblings=Array.from(parent.children).filter(child=>child.tagName===current!.tagName);parts.unshift(`${tag}:nth-of-type(${siblings.indexOf(current)+1})`);current=parent;}
  const tag=element.tagName.toLowerCase();
  return {locator:locator+(parts.length?' > '+parts.join(' > '):''),elementId:element===owner?'root':`${tag}:${Array.from(root.querySelectorAll(tag)).indexOf(element)+1}`};
}
function textContent(element:HTMLElement):string {
  const clone=element.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('input,select,textarea,option,button,script,style,[data-report-exclude]').forEach(node=>node.remove());
  return clean(clone.textContent||'');
}
function isText(element:HTMLElement):boolean {
  return !element.closest('button,a,input,select,textarea,svg,[contenteditable=true]') &&
    Array.from(element.childNodes).some(node=>node.nodeType===Node.TEXT_NODE&&!!node.textContent?.trim());
}
export function collectTargets():Target[]{
  const candidates=Array.from(document.querySelectorAll<HTMLElement>('.service-shell button,.service-shell a,.service-shell input,.service-shell select,.service-shell textarea,[data-report-id],.dashboard-widget,.fl-card,.service-main section,.service-main th,.service-main td'));
  const texts=Array.from(document.querySelectorAll<HTMLElement>('[data-report-id] h1,[data-report-id] h2,[data-report-id] h3,[data-report-id] h4,[data-report-id] p,[data-report-id] span,[data-report-id] strong,[data-report-id] small,[data-report-id] em,[data-report-id] label,[data-report-id] div,[data-report-id] li,[data-report-id] dt,[data-report-id] dd,[data-report-id] time')).filter(isText);
  return Array.from(new Set([...candidates,...texts])).filter(element=>!element.closest('[data-report-exclude]')&&!!element.closest('[data-report-id]')&&!element.matches('main,.service-header,.service-sidebar')).map(element=>{
    const control=element.matches('button,a,input,select,textarea');const text=isText(element);const widget=element.closest<HTMLElement>('[data-widget]');
    const owner=element.closest<HTMLElement>('[data-report-id]')!;
    const heading=element.querySelector('h1,h2,h3')?.textContent;
    const labelText=element instanceof HTMLInputElement||element instanceof HTMLSelectElement||element instanceof HTMLTextAreaElement ? fieldLabel(element) : element.textContent;
    const name=element.dataset.reportLabel || (element.dataset.widget ? widgetNames[element.dataset.widget] || clean(element.querySelector('.widget-drag')?.textContent||'대시보드 위젯').replace('⠿','').trim() : element.getAttribute('aria-label') || (control?labelText:text?textContent(element):heading) || widget?.querySelector('.widget-drag')?.textContent || element.closest('section')?.querySelector('h2')?.textContent || owner.dataset.reportLabel || '');
    const suffix=element.matches('button')?' 버튼':element.matches('input,select,textarea')?' 입력 영역':element.matches('a')?' 링크':element.matches('th,td')?' 표 영역':text?' 텍스트':'';
    const label=(clean(name)+suffix).slice(0,120);
    const identity=selectorFor(element,owner);
    const page=pageTarget(location.pathname);
    const hierarchy=Array.from(new Set([document.querySelector<HTMLElement>('main')?.dataset.reportLabel||'',owner.dataset.reportLabel||'',label].filter(Boolean)));
    return {element,label,kind:element.tagName.toLowerCase(),priority:control?0:text?1:element.matches('th,td')?2:3,context:{schema_version:1 as const,component_id:owner.dataset.reportId!,element_id:identity.elementId,locator:identity.locator,source_file:owner.dataset.reportSource||page.source,hierarchy,tag:element.tagName.toLowerCase()}};
  }).filter(target=>!!target.label&&target.context.locator.length<=1000);
}
export function regionFromPixels(left:number,top:number,right:number,bottom:number,width=innerWidth,height=innerHeight):Region{
  const l=Math.max(0,Math.min(9999,Math.round(left/width*10000))),t=Math.max(0,Math.min(9999,Math.round(top/height*10000)));
  const r=Math.max(l+1,Math.min(10000,Math.round(right/width*10000))),b=Math.max(t+1,Math.min(10000,Math.round(bottom/height*10000)));
  return {left:l,top:t,width:r-l,height:b-t};
}
export function targetAt(targets:Target[],x:number,y:number):Selection|null{
  const layers=(element:HTMLElement)=>{
    const path:number[]=[];
    for(let node:HTMLElement|null=element;node;node=node.parentElement){const css=getComputedStyle(node);if(css.zIndex!=='auto'&&css.position!=='static')path.unshift(Number(css.zIndex)||0);}
    return path;
  };
  const hits=targets.flatMap(target=>{
    const element=target.element,style=getComputedStyle(element);if(style.display==='none'||style.visibility==='hidden')return [];
    const rect=element.getBoundingClientRect();if(x<rect.left||x>rect.right||y<rect.top||y>rect.bottom)return [];let left=Math.max(0,rect.left),top=Math.max(0,rect.top),right=Math.min(innerWidth,rect.right),bottom=Math.min(innerHeight,rect.bottom);
    for(let parent=element.parentElement;parent;parent=parent.parentElement){const css=getComputedStyle(parent),r=parent.getBoundingClientRect();if(/hidden|auto|scroll|clip/.test(css.overflowX)){left=Math.max(left,r.left);right=Math.min(right,r.right);}if(/hidden|auto|scroll|clip/.test(css.overflowY)){top=Math.max(top,r.top);bottom=Math.min(bottom,r.bottom);}}
    if(right-left<2||bottom-top<2||x<left||x>right||y<top||y>bottom)return [];
    return [{...target,region:regionFromPixels(left,top,right,bottom),area:(right-left)*(bottom-top),layers:layers(element)}];
  }).sort((a,b)=>{
    for(let i=0;i<Math.max(a.layers.length,b.layers.length);i++){const difference=(b.layers[i]||0)-(a.layers[i]||0);if(difference)return difference;}
    return a.priority-b.priority||a.area-b.area;
  });
  const chosen=hits[0];return chosen?{region:chosen.region,label:chosen.label,target:chosen.kind,context:chosen.context}:null;
}
export function regionStyle(region:Region){return {left:`${region.left/100}%`,top:`${region.top/100}%`,width:`${region.width/100}%`,height:`${region.height/100}%`};}
