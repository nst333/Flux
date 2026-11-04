import { useState, useRef, useEffect } from 'react';
import type { ExamDocument } from './model';
import { Download, X, ExternalLink } from 'lucide-react';
import { exportPink, localPinkPdf, pinkAsset, pinkExample, pinkSource, workflowUrl } from './pink';
import { download } from './storage';
import './pink.css';
export default function PinkOutput({ doc, onClose, onExample }: { doc: ExamDocument; onClose: () => void; onExample: (doc: ExamDocument) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [preview, setPreview] = useState(1);
  const dialog = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); return; }
      if (event.key !== 'Tab') return;
      const controls = [...(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],summary') || [])].filter(x => x.getClientRects().length);
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', handler);
    return () => { document.removeEventListener('keydown', handler); previous?.focus(); };
  }, []);
  async function run(action: () => Promise<void>, message: string) {
    setBusy(true); setError(''); setStatus('');
    try { await action(); setStatus(message); } catch(e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <div className="pink-overlay" onClick={onClose}>
    <section ref={dialog} className="pink-output" role="dialog" aria-modal="true" aria-labelledby="pink-title" onClick={e => e.stopPropagation()}>
      <header><h2 id="pink-title">벚꽃 문제지</h2><button autoFocus aria-label="벚꽃 출력 닫기" onClick={onClose}><X size={20}/></button></header>
      <div className="pink-output-body">
        <div className="pink-sheet-preview"><img src={pinkAsset(`page-${preview}.webp`)} alt={`원본 디자인 미리보기 · ${preview}번 문항`}/><nav aria-label="예제 페이지"><button disabled={preview === 1} onClick={() => setPreview(preview - 1)}>이전</button><span>{preview} / 8</span><button disabled={preview === 8} onClick={() => setPreview(preview + 1)}>다음</button></nav><small>원본 8문항 디자인 예제 · 현재 문서의 출력 미리보기가 아닙니다.</small></div>
        <div className="pink-output-actions">
          <p>A4 한 장에 한 문항. 원본 장식과 나눔고딕, Euler 수식체로 조판합니다.</p>
          <h3>원본 8문항</h3>
          <a className="pink-main-action" href={pinkAsset('worksheet.pdf')} download="flux-pink-8problems.pdf"><Download size={16}/>완성 PDF 다운로드</a>
          <button disabled={busy} onClick={() => run(async () => { await onExample(await pinkExample()); onClose(); }, '')}>8문항을 새 문서로 편집</button>
          <h3>현재 문서 · {doc.problems.length}문항</h3>
          <p>본문·조건·박스·선택지를 가져옵니다. 제목·정답·해설·표지는 출력하지 않습니다.</p>
          {import.meta.env.DEV && <button disabled={busy} onClick={() => run(() => localPinkPdf(doc), 'PDF를 저장했습니다.')}>현재 문서 PDF 생성</button>}
          <button disabled={busy} onClick={() => run(() => exportPink(doc), '조판 소스를 저장했습니다. 압축을 풀고 README의 실행 방법을 확인하세요.')}>조판 소스 ZIP 다운로드</button>
          <details><summary>GitHub Actions에서 PDF 만들기</summary>
            <ol><li>문항 JSON을 저장합니다.</li><li>Actions에서 <b>Run workflow</b>를 열고 JSON 파일의 내용을 <b>document_json</b>에 붙여 넣습니다.</li><li>완료된 실행의 <b>worksheet</b> 아티팩트에서 PDF를 받습니다.</li></ol>
            <p>저장소 쓰기 권한이 있는 GitHub 계정이 필요합니다. JSON을 제출하면 문항이 GitHub로 전송됩니다.</p>
            <button disabled={busy} onClick={() => run(async () => download(new Blob([JSON.stringify(pinkSource(doc))], {type:'application/json'}), 'flux-pink-problems.json'), '문항 JSON을 저장했습니다.')}>문항 JSON 저장</button>
            <a href={workflowUrl} target="_blank" rel="noreferrer">PDF 생성 Actions 열기 <ExternalLink size={14}/></a>
          </details>
          <p className="pink-output-note">배포 웹앱에서는 조판 소스 또는 Actions를 이용합니다. 로컬 PDF 생성은 <code>npm run pdf:server</code> 실행 후 사용할 수 있습니다. 긴 문항은 조판 시 넘침을 검사합니다.</p>
          {busy && <p role="status">준비 중…</p>}{status && <p role="status">{status}</p>}{error && <p className="pink-output-error" role="alert">{error}</p>}
        </div>
      </div>
    </section>
  </div>;
}
