import { openDB } from 'idb';
import JSZip from 'jszip';
import type { ExamDocument, Block } from './model';
const db = () =>
  openDB('flux-math', 2, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('documents')) db.createObjectStore('documents');
      if (!db.objectStoreNames.contains('folders')) db.createObjectStore('folders');
    },
  });
export async function load() {
  const database = await db();
  const doc = ((await database.get('documents', 'active')) ??
    (await listDocuments()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]) as
    ExamDocument | undefined;
  if (doc && !(await database.get('documents', doc.id))) await database.put('documents', doc, doc.id);
  return doc;
}
export async function save(doc: ExamDocument, active = true) {
  const tx = (await db()).transaction('documents', 'readwrite');
  await tx.store.put(doc, doc.id);
  if (active || (await tx.store.get('active'))?.id === doc.id) await tx.store.put(doc, 'active');
  await tx.done;
}
export async function listDocuments(): Promise<ExamDocument[]> {
  const tx = (await db()).transaction('documents');
  const keys = await tx.store.getAllKeys();
  const docs = await tx.store.getAll();
  return docs.filter((_, i) => keys[i] !== 'active');
}
export async function removeDocument(id: string) {
  const tx = (await db()).transaction('documents', 'readwrite');
  await tx.store.delete(id);
  if ((await tx.store.get('active'))?.id === id) await tx.store.delete('active');
  await tx.done;
}
export interface Folder {
  id: string;
  name: string;
}
export async function listFolders(): Promise<Folder[]> {
  return (await db()).getAll('folders');
}
export async function saveFolder(folder: Folder) {
  await (await db()).put('folders', folder, folder.id);
}
export async function removeFolder(id: string) {
  const tx = (await db()).transaction(['documents', 'folders'], 'readwrite');
  const store = tx.objectStore('documents');
  const keys = await store.getAllKeys();
  const docs = await store.getAll();
  for (let i = 0; i < docs.length; i++)
    if (docs[i].folderId === id) {
      delete docs[i].folderId;
      await store.put(docs[i], keys[i]);
    }
  await tx.objectStore('folders').delete(id);
  await tx.done;
}
export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
export async function exportExam(doc: ExamDocument) {
  const zip = new JSZip();
  const copy = structuredClone(doc);
  let n = 0;
  const add = (b: Block) => {
    if (b.image?.startsWith('data:image/')) {
      const match = b.image.match(/^data:(image\/[\w.+-]+);base64,(.+)$/s);
      if (!match) return;
      const name = `assets/image-${++n}.${match[1].split('/')[1]}`;
      zip.file(name, match[2], { base64: true });
      b.image = name;
    }
  };
  copy.problems.forEach((p) => [...p.blocks, ...p.explanation].forEach(add));
  copy.templates.forEach((t) => t.blocks.forEach(add));
  zip.file('document.json', JSON.stringify(copy, null, 2));
  download(await zip.generateAsync({ type: 'blob' }), doc.name.replace(/[<>:"/\\|?*]/g, '-') + '.mathexam');
}
const MAX_SIZE = 60 * 1024 * 1024;
export async function importExam(file: File): Promise<ExamDocument> {
  if (file.size > MAX_SIZE) throw Error('60MB 이하 파일만 불러올 수 있습니다.');
  const zip = await JSZip.loadAsync(file);
  const entry = zip.file('document.json');
  if (!entry) throw Error('시험지 데이터가 없는 파일입니다.');
  const raw = await entry.async('string');
  if (raw.length > MAX_SIZE) throw Error('문서 데이터가 너무 큽니다.');
  const doc = JSON.parse(raw);
  validateDocument(doc);
  for (const b of [
    ...doc.problems.flatMap((p: any) => [...p.blocks, ...p.explanation]),
    ...doc.templates.flatMap((t: any) => t.blocks),
  ]) {
    if (b.image) {
      if (!/^assets\/[\w.-]+\.(png|jpeg|jpg|webp|gif)$/i.test(b.image))
        throw Error('지원하지 않는 이미지 경로입니다.');
      const asset = zip.file(b.image);
      if (!asset) throw Error('이미지 파일이 누락됐습니다.');
      const base64 = await asset.async('base64');
      if (base64.length > MAX_SIZE) throw Error('이미지가 너무 큽니다.');
      const ext = b.image.split('.').pop();
      b.image = `data:image/${ext === 'jpg' ? 'jpeg' : ext};base64,${base64}`;
    }
  }
  return doc;
}
function cleanHtml(html: string) {
  const root = document.createElement('div');
  root.innerHTML = html;
  for (const node of [...root.querySelectorAll('*')]) {
    if (['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'SVG', 'IMG'].includes(node.tagName)) {
      node.remove();
      continue;
    }
    for (const attr of [...node.attributes]) node.removeAttribute(attr.name);
    if (!['P', 'BR', 'STRONG', 'B', 'EM', 'I', 'U', 'S', 'SPAN', 'UL', 'LI'].includes(node.tagName))
      node.replaceWith(...node.childNodes);
  }
  return root.innerHTML;
}
export function validateDocument(doc: any): asserts doc is ExamDocument {
  if (
    doc?.version !== 1 ||
    typeof doc.id !== 'string' ||
    typeof doc.name !== 'string' ||
    !['1', '2', '3'].includes(doc.grade) ||
    !['B4', 'A4', 'A3'].includes(doc.paper) ||
    !Array.isArray(doc.problems) ||
    !Array.isArray(doc.templates) ||
    doc.problems.length > 500 ||
    doc.templates.length > 500
  )
    throw Error('지원하지 않거나 손상된 문서입니다.');
  for (const k of ['year', 'month', 'fontSize', 'lineHeight', 'margin', 'columnGap'])
    if (typeof doc[k] !== 'number' || !Number.isFinite(doc[k])) throw Error('잘못된 양식 설정입니다.');
  if (
    doc.margin < 5 ||
    doc.margin > 40 ||
    doc.columnGap < 4 ||
    doc.columnGap > 24 ||
    doc.fontSize < 7 ||
    doc.fontSize > 18 ||
    doc.lineHeight < 1.2 ||
    doc.lineHeight > 2.4
  )
    throw Error('양식 값이 허용 범위를 벗어났습니다.');
  const used = new Set<string>();
  if (doc.printProfile !== undefined && !['legacy', 'kice-2026', 'office-2026'].includes(doc.printProfile))
    throw Error('잘못된 출력 양식입니다.');
  if (
    doc.mathFontSize !== undefined &&
    (typeof doc.mathFontSize !== 'number' ||
      !Number.isFinite(doc.mathFontSize) ||
      doc.mathFontSize < 7 ||
      doc.mathFontSize > 18)
  )
    throw Error('잘못된 수식 크기입니다.');
  if (doc.titleMode !== undefined && !['auto', 'custom'].includes(doc.titleMode))
    throw Error('잘못된 제목 방식입니다.');
  for (const key of ['customTitle', 'description', 'folderId'])
    if (doc[key] !== undefined && (typeof doc[key] !== 'string' || doc[key].length > 2000))
      throw Error('잘못된 문서 정보입니다.');
  if (doc.favorite !== undefined && typeof doc.favorite !== 'boolean')
    throw Error('잘못된 즐겨찾기 설정입니다.');
  if (doc.cover !== undefined && typeof doc.cover !== 'boolean') throw Error('잘못된 표지 설정입니다.');
  if (doc.interleaf !== undefined && !['none', 'blank', 'elective'].includes(doc.interleaf))
    throw Error('잘못된 간지 설정입니다.');
  if (doc.coverNote !== undefined && (typeof doc.coverNote !== 'string' || doc.coverNote.length > 2000))
    throw Error('표지 안내문이 너무 깁니다.');
  const unique = (id: any) => {
    if (typeof id !== 'string' || used.has(id)) throw Error('중복되거나 잘못된 ID입니다.');
    used.add(id);
  };
  const blocks = (list: any) => {
    if (!Array.isArray(list) || list.length > 200) throw Error('잘못된 블록입니다.');
    for (const b of list) {
      unique(b.id);
      if (
        !['text', 'image', 'choices', 'conditions', 'box', 'view'].includes(b.kind) ||
        typeof b.html !== 'string' ||
        !Array.isArray(b.items) ||
        !['auto', 'five', 'two', 'threeTwo', 'twoThree', 'vertical'].includes(b.layout) ||
        !['left', 'center', 'right'].includes(b.align) ||
        typeof b.imageWidth !== 'number' ||
        b.imageWidth < 10 ||
        b.imageWidth > 100
      )
        throw Error('블록 데이터가 올바르지 않습니다.');
      b.html = cleanHtml(b.html);
      if (b.columns !== undefined && ![1, 2].includes(b.columns)) throw Error('잘못된 보기 열 설정입니다.');
      if (b.markers !== undefined && !['korean', 'letters', 'bullet', 'none'].includes(b.markers))
        throw Error('잘못된 항목 표기입니다.');
      if (b.items.length > 50) throw Error('항목이 너무 많습니다.');
      for (const x of b.items) {
        unique(x.id);
        if (typeof x.html !== 'string') throw Error('항목 데이터가 올바르지 않습니다.');
        x.html = cleanHtml(x.html);
      }
    }
  };
  for (const p of doc.problems) {
    unique(p.id);
    if (
      typeof p.title !== 'string' ||
      typeof p.description !== 'string' ||
      typeof p.answer !== 'string' ||
      !['choice', 'short'].includes(p.type) ||
      !['common', 'elective'].includes(p.section) ||
      typeof p.score !== 'number' ||
      p.score < 1 ||
      p.score > 10 ||
      typeof p.space !== 'number' ||
      p.space < 0 ||
      p.space > 150 ||
      !['auto', 'column', 'page'].includes(p.breakBefore) ||
      typeof p.allowSplit !== 'boolean'
    )
      throw Error('문항 데이터가 올바르지 않습니다.');
    blocks(p.blocks);
    blocks(p.explanation);
  }
  for (const t of doc.templates) {
    unique(t.id);
    if (typeof t.name !== 'string') throw Error('잘못된 템플릿입니다.');
    blocks(t.blocks);
  }
}
