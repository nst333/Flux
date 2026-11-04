import type { ExamDocument } from './model';
import { block, demo, problem, id } from './model';
import { download } from './storage';
export interface PinkBlock { kind: 'text' | 'conditions' | 'choices' | 'box'; text?: string; items?: string[] }
export interface PinkSource { version: 1; problems: { blocks: PinkBlock[] }[] }
export const pinkAsset = (name: string) => `${import.meta.env.BASE_URL}pink/${name}`;
export const workflowUrl = 'https://github.com/nst333/Flux/actions/workflows/worksheet.yml';
function plain(html: string) {
  const root = document.createElement('div');
  root.innerHTML = html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>\s*<p[^>]*>/gi, '\n\n');
  if (root.querySelector('ul,ol,table')) throw Error('벚꽃 양식은 글머리표·표를 지원하지 않습니다. 일반 본문으로 바꿔주세요.');
  return root.textContent || '';
}
export function pinkSource(doc: ExamDocument): PinkSource {
  return { version: 1, problems: doc.problems.map((p, i) => ({ blocks: p.blocks.map((b): PinkBlock => {
    if (b.kind === 'image' || b.kind === 'view') throw Error(`${i + 1}번: 벚꽃 양식은 이미지·보기를 지원하지 않습니다. 본문·조건·박스·선택지를 사용하세요.`);
    if (b.kind === 'choices' || b.kind === 'conditions') {
      if (!b.items.length || b.items.length > (b.kind === 'choices' ? 5 : 10)) throw Error(`${i + 1}번: 선택지는 1~5개, 조건은 1~10개를 지원합니다.`);
      return { kind: b.kind, items: b.items.map(x => plain(x.html)) };
    }
    return { kind: b.kind, text: plain(b.html) };
  }) })) };
}
const html = (s: string) => '<p>' + s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('\n', '<br>') + '</p>';
export async function pinkExample(): Promise<ExamDocument> {
  const response = await fetch(pinkAsset('sample.json'));
  if (!response.ok) throw Error('예제 문항을 불러오지 못했습니다. 다시 시도하세요.');
  const source: PinkSource = await response.json();
  return { ...demo(), id: id(), name: '벚꽃 · 부정적분 8문항', pageTemplate: 'pink', cover: false, interleaf: 'none', paper: 'A4',
    problems: source.problems.map((p, i) => ({ ...problem(), title: `문제 ${i + 1}`, answer: '',
      type: p.blocks.some(b => b.kind === 'choices') ? 'choice' : 'short',
      blocks: p.blocks.map(b => ({ ...block(b.kind), html: html(b.text || ''), items: (b.items || []).map(s => ({ id: id(), html: html(s) })) })) })),
    updatedAt: new Date().toISOString() };
}
export async function exportPink(doc: ExamDocument) {
  const source = pinkSource(doc);
  const response = await fetch(pinkAsset('source-kit.zip'));
  if (!response.ok) throw Error('조판 자산을 내려받지 못했습니다. 연결을 확인하고 다시 시도하세요.');
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(await response.arrayBuffer());
  zip.file('problems.json', JSON.stringify(source, null, 2));
  download(await zip.generateAsync({ type: 'blob' }), 'flux-pink-source.zip');
}
export async function localPinkPdf(doc: ExamDocument) {
  const response = await fetch(`${import.meta.env.BASE_URL}api/pink/pdf`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(pinkSource(doc)) });
  if (!response.ok) throw Error((await response.text()).slice(0, 500) || 'PDF 조판에 실패했습니다.');
  download(await response.blob(), 'flux-pink-worksheet.pdf');
}
