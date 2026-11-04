import { memo, useEffect, useRef, useState } from 'react';
import type { Block, ExamDocument, Problem } from './model';
import { Rendered } from './RichText';
import { pinkAsset, pinkSource } from './pink';
import './pink-page.css';
const letters = '가나다라마바사아자차';
function PinkBlock({ b }: { b: Block }) {
  if (b.kind === 'choices') return <div className="pink-choices">{b.items.map((item, i) => <div key={item.id}><span className="pink-circled">{String.fromCodePoint(0x2460 + i)}</span><Rendered html={item.html} examFonts={false}/></div>)}</div>;
  if (b.kind === 'conditions') return <div className="pink-conditions pink-condition-list">{b.items.map((item, i) => <div key={item.id}><span>({letters[i] ?? i+1})</span><Rendered html={item.html} examFonts={false}/></div>)}</div>;
  if (b.kind === 'image' || b.kind === 'view') return <p className="pink-unsupported">이 블록은 벚꽃 양식에서 출력할 수 없습니다. 본문·조건·박스·선택지로 바꿔주세요.</p>;
  return <div className={b.kind === 'box' ? 'pink-conditions' : undefined}><Rendered html={b.html} examFonts={false}/></div>;
}
export const PinkPage = memo(function PinkPage({ problem: p, index, hidden = false, onEdit }: { problem: Problem; index: number; hidden?: boolean; onEdit?: (problemId: string, blockId: string) => void }) {
  return <section className={`pink-page${hidden ? ' pink-offscreen' : ''}`} data-pink-problem={p.id} aria-hidden={hidden || undefined} aria-label={`${index + 1}번 문항 · 벚꽃 템플릿`}>
    <img className="pink-background" src={pinkAsset('background.webp')} alt="" draggable={false}/>
    <strong className="pink-number">{String(index+1).padStart(2,'0')}.</strong>
    <div className="pink-body">{p.blocks.map(b => <div key={b.id} className="pink-block" data-pink-block={b.id}
      {...(onEdit ? {role:'button',tabIndex: hidden ? -1 : 0,'aria-label':`${index+1}번 ${b.kind === 'choices' ? '선택지' : b.kind === 'conditions' ? '조건' : '본문'} 편집`,onClick:()=>onEdit(p.id,b.id),onKeyDown:(e:React.KeyboardEvent)=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onEdit(p.id,b.id);}}} : {})}>
      <PinkBlock b={b}/>
    </div>)}</div>
  </section>;
});
export default function PinkPreview({ doc, selected, view, onWarnings, onReady, onEdit }: { doc: ExamDocument; selected: Problem; view: 'problem'|'exam'; onWarnings: (warnings:string[])=>void; onReady: (ready:boolean,version?:string)=>void; onEdit: (problemId:string,blockId:string)=>void }) {
  const root=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    let cancelled=false;
    onReady(false);
    const measure=()=>{
      if(cancelled || !root.current) return;
      const warnings:string[]=[];
      try { pinkSource(doc); } catch(e) { warnings.push((e as Error).message); }
      root.current.querySelectorAll<HTMLElement>('.pink-page').forEach((page,i)=>{
        const body=page.querySelector<HTMLElement>('.pink-body')!;
        if(body.scrollHeight > 195*96/25.4 || body.scrollWidth > body.clientWidth+2) warnings.push(`${i+1}번: 문제 영역을 넘습니다. 문항을 나눠주세요.`);
        if(page.querySelector('.math-error')) warnings.push(`${i+1}번: 수식 구문을 확인하세요.`);
      });
      onWarnings(warnings);
      onReady(true,`${doc.id}:${doc.updatedAt}:questions`);
    };
    const observer=new ResizeObserver(measure);
    root.current?.querySelectorAll('.pink-body').forEach(el=>observer.observe(el));
    document.fonts.ready.then(measure);
    document.fonts.addEventListener('loadingdone',measure);
    measure();
    return ()=>{cancelled=true;observer.disconnect();document.fonts.removeEventListener('loadingdone',measure);};
  },[doc,onWarnings,onReady]);
  return <div ref={root} className="pink-pages pages">{doc.problems.map((p,i)=><PinkPage key={p.id} problem={p} index={i} hidden={view==='problem' && p.id!==selected.id} onEdit={onEdit}/>)}</div>;
}
export function PinkThumbnail({ doc, index=0 }: { doc:ExamDocument; index?:number }) {
  const ref=useRef<HTMLDivElement>(null);
  const [scale,setScale]=useState(.5);
  useEffect(()=>{const el=ref.current;if(!el)return;const update=()=>setScale(el.clientWidth/(210*96/25.4));const observer=new ResizeObserver(update);observer.observe(el);update();return ()=>observer.disconnect();},[]);
  const p=doc.problems[index];
  return <div ref={ref} className="pink-thumbnail"><div style={{transform:`scale(${scale})`,transformOrigin:'top left'}}>{p&&<PinkPage problem={p} index={index}/>}</div></div>;
}
