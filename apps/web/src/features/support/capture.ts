import { toCanvas } from 'html-to-image';
export type Mask = {x:number;y:number;width:number;height:number};
export type Snapshot = {image:string | null;width:number;height:number;error:string};
export async function captureScreen():Promise<Snapshot> {
  const width=window.innerWidth,height=window.innerHeight;
  const scrollX=window.scrollX,scrollY=window.scrollY;
  const viewport=document.createElement('div');
  viewport.setAttribute('data-report-exclude','');
  viewport.style.cssText=`position:fixed;left:-20000px;top:0;width:${width}px;height:${height}px;overflow:hidden;pointer-events:none;z-index:-1`;
  const source=document.querySelector<HTMLElement>('.service-shell') ?? document.body;
  const originalRect=source.getBoundingClientRect();
  const clone=source.cloneNode(true) as HTMLElement;
  const originals=[source,...source.querySelectorAll<HTMLElement>('*')];
  const copies=[clone,...clone.querySelectorAll<HTMLElement>('*')];
  const floating:HTMLElement[]=[];
  try {
    originals.forEach((original,index)=>{
      const copy=copies[index];if(!copy)return;
      const style=getComputedStyle(original);
      for(const key of Array.from(style)) copy.style.setProperty(key,style.getPropertyValue(key),style.getPropertyPriority(key));
      if(original.matches('input[type="password"], [data-report-exclude], script, iframe, video')||original.closest('[data-report-exclude]')) {copy.style.visibility='hidden';if(copy instanceof HTMLInputElement)copy.value='';}
      else if(original instanceof HTMLInputElement&&copy instanceof HTMLInputElement)copy.value=original.value;
      else if(original instanceof HTMLTextAreaElement&&copy instanceof HTMLTextAreaElement)copy.value=original.value;
      else if(original instanceof HTMLSelectElement&&copy instanceof HTMLSelectElement)copy.value=original.value;
      if(original instanceof HTMLCanvasElement&&copy instanceof HTMLCanvasElement)copy.getContext('2d')?.drawImage(original,0,0);
      copy.scrollTop=original.scrollTop;copy.scrollLeft=original.scrollLeft;
      if(original!==source&&(style.position==='fixed'||style.position==='sticky'))floating.push(copy);
    });
    clone.style.position='absolute';clone.style.left=`${originalRect.left}px`;clone.style.top=`${originalRect.top}px`;clone.style.margin='0';clone.style.transform='none';clone.style.width=`${originalRect.width}px`;
    viewport.append(clone);
    for(const copy of floating){
      const original=originals[copies.indexOf(copy)]!;const rect=original.getBoundingClientRect();
      const placeholder=copy.cloneNode(false) as HTMLElement;placeholder.style.visibility='hidden';copy.replaceWith(placeholder);
      copy.style.position='absolute';copy.style.left=`${rect.left}px`;copy.style.top=`${rect.top}px`;copy.style.right='auto';copy.style.bottom='auto';copy.style.width=`${rect.width}px`;copy.style.height=`${rect.height}px`;copy.style.margin='0';copy.style.transform='none';viewport.append(copy);
    }
    document.body.append(viewport);
    // Restore internal scrollers after attachment; viewport coordinates stay frozen.
    originals.forEach((original,index)=>{const copy=copies[index];if(copy){copy.scrollTop=original.scrollTop;copy.scrollLeft=original.scrollLeft;}});
    const canvas=await toCanvas(viewport,{width,height,pixelRatio:1,skipFonts:true,backgroundColor:getComputedStyle(document.body).backgroundColor,style:{position:'relative',inset:'auto',insetInline:'auto',insetBlock:'auto',left:'0',top:'0',zIndex:'auto'},filter:node=>!(node instanceof Element&&node.matches('script,iframe,video,input[type="password"]'))});
    return {image:canvas.toDataURL('image/png'),width,height,error:''};
  } catch {
    return {image:null,width,height,error:'화면 이미지를 만들지 못했습니다. 핀과 설명은 등록할 수 있습니다.'};
  } finally {viewport.remove();window.scrollTo(scrollX,scrollY);}
}

export async function maskedImage(source:string,masks:Mask[]):Promise<string> {
  const image=new Image(); image.src=source; await image.decode();
  const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
  const ctx=canvas.getContext('2d');if(!ctx) throw new Error('화면 이미지를 처리하지 못했습니다.');
  ctx.drawImage(image,0,0);ctx.fillStyle='#202936';
  for(const mask of masks) {const left=Math.floor(mask.x*canvas.width),top=Math.floor(mask.y*canvas.height);ctx.fillRect(left,top,Math.ceil((mask.x+mask.width)*canvas.width)-left,Math.ceil((mask.y+mask.height)*canvas.height)-top);}
  const encoded=canvas.toDataURL('image/png').split(',')[1];
  if(!encoded || encoded.length>4194304) throw new Error('화면 이미지가 큽니다. 화면 첨부를 제외하고 등록해 주세요.');
  return encoded;
}
