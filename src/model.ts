export type BlockKind = 'text' | 'image' | 'choices' | 'conditions' | 'box' | 'view';
export type ChoiceLayout = 'auto' | 'five' | 'two' | 'threeTwo' | 'twoThree' | 'vertical';
export interface Block {
  id: string;
  kind: BlockKind;
  html: string;
  items: { id: string; html: string }[];
  layout: ChoiceLayout;
  image?: string;
  imageWidth: number;
  align: 'left' | 'center' | 'right';
  columns?: 1 | 2;
  markers?: 'korean' | 'letters' | 'bullet' | 'none';
}
export interface Problem {
  id: string;
  title: string;
  description: string;
  type: 'choice' | 'short';
  section: 'common' | 'elective';
  score: number;
  blocks: Block[];
  answer: string;
  explanation: Block[];
  space: number;
  breakBefore: 'auto' | 'column' | 'page';
  allowSplit: boolean;
}
export interface Template {
  id: string;
  name: string;
  blocks: Block[];
}
export interface ExamDocument {
  version: 1;
  id: string;
  name: string;
  year: number;
  titleMode?: 'auto' | 'custom';
  customTitle?: string;
  description?: string;
  favorite?: boolean;
  folderId?: string;
  month: number;
  grade: '1' | '2' | '3';
  elective: string;
  paper: 'B4' | 'A4' | 'A3';
  fontSize: number;
  mathFontSize?: number;
  printProfile?: 'kice-2026' | 'office-2026' | 'legacy';
  pageTemplate?: 'exam' | 'pink';
  lineHeight: number;
  margin: number;
  columnGap: number;
  problems: Problem[];
  templates: Template[];
  updatedAt: string;
  cover?: boolean;
  interleaf?: 'none' | 'blank' | 'elective';
  coverNote?: string;
}
export const id = () => crypto.randomUUID();
export function examTitle(doc: ExamDocument, cover = false) {
  return doc.titleMode === 'custom'
    ? doc.customTitle?.trim() || doc.name
    : doc.printProfile === 'kice-2026'
      ? `${doc.year}학년도 대학수학능력시험 ${doc.month}월 모의평가${cover ? '' : ' 문제지'}`
      : `${doc.year}학년도 ${doc.month}월 고${doc.grade} 전국연합학력평가${cover ? '' : ' 문제지'}`;
}
export const names: Record<BlockKind, string> = {
  text: '텍스트',
  image: '이미지',
  choices: '선택지',
  conditions: '조건',
  box: '박스',
  view: '보기',
};
export const paragraph = (s: string) => `<p>${s}</p>`;
export function block(kind: BlockKind): Block {
  return {
    id: id(),
    kind,
    html: '<p></p>',
    items: Array.from(
      { length: kind === 'choices' ? 5 : kind === 'conditions' ? 2 : kind === 'view' ? 3 : 0 },
      () => ({ id: id(), html: '<p></p>' }),
    ),
    layout: 'auto',
    imageWidth: 70,
    align: 'center',
  };
}
export function problem(): Problem {
  return {
    id: id(),
    title: '새 문항',
    description: '',
    type: 'choice',
    section: 'common',
    score: 3,
    blocks: [block('text'), block('choices')],
    answer: '',
    explanation: [],
    space: 25,
    breakBefore: 'auto',
    allowSplit: false,
  };
}
export function copyBlock(b: Block): Block {
  return { ...structuredClone(b), id: id(), items: b.items.map((x) => ({ ...x, id: id() })) };
}
export function copyProblem(p: Problem): Problem {
  const blocks = p.blocks.map(copyBlock);
  let answer = p.answer;
  if (p.type === 'choice') {
    const original = p.blocks.flatMap((b) => b.items);
    const copied = blocks.flatMap((b) => b.items);
    const index = original.findIndex((x) => x.id === p.answer);
    answer = index >= 0 ? copied[index].id : '';
  }
  return {
    ...structuredClone(p),
    id: id(),
    title: p.title + ' (복사)',
    blocks,
    answer,
    explanation: p.explanation.map(copyBlock),
  };
}
export function numbering(d: ExamDocument): Map<string, number> {
  if (d.pageTemplate === 'pink') return new Map(d.problems.map((p, i) => [p.id, i + 1]));
  let common = 0,
    elective = 22;
  return new Map(
    d.problems.map((p) => [p.id, d.grade === '3' && p.section === 'elective' ? ++elective : ++common]),
  );
}
export function mathErrors(html: string): string[] {
  const el = document.createElement('div');
  el.innerHTML = html;
  const text = el.textContent || '';
  return tokenizeMath(text)
    .filter((x) => x.error)
    .map((x) => x.source);
}
export interface MathToken {
  source: string;
  math: boolean;
  display: boolean;
  error?: boolean;
}
export function tokenizeMath(text: string): MathToken[] {
  const result: MathToken[] = [];
  let start = 0,
    i = 0;
  while (i < text.length) {
    if (text[i] !== '$' || (i > 0 && text[i - 1] === '\\')) {
      i++;
      continue;
    }
    if (i > start) result.push({ source: text.slice(start, i), math: false, display: false });
    const display = text[i + 1] === '$',
      delimiter = display ? '$$' : '$';
    const from = i + delimiter.length;
    let end = from;
    while (end < text.length) {
      if (text.startsWith(delimiter, end) && text[end - 1] !== '\\') break;
      end++;
    }
    if (end >= text.length) {
      result.push({ source: text.slice(i), math: false, display: false, error: true });
      start = text.length;
      break;
    }
    result.push({ source: text.slice(from, end), math: true, display });
    i = end + delimiter.length;
    start = i;
  }
  if (start < text.length) result.push({ source: text.slice(start), math: false, display: false });
  return result;
}
export function demo(): ExamDocument {
  const p1 = problem();
  p1.title = '지수의 계산';
  p1.score = 2;
  p1.blocks[0].html = paragraph('$2^{1+\\sqrt{3}} \\times 2 \\times (\\frac{1}{2})^{\\sqrt{3}}$의 값은?');
  p1.blocks[1].items = ['$\\frac{1}{4}$', '$\\frac{1}{2}$', '$1$', '$2$', '$4$'].map((html) => ({
    id: id(),
    html: paragraph(html),
  }));
  p1.space = 75;
  p1.answer = p1.blocks[1].items[4].id;
  p1.explanation = [
    {
      ...block('text'),
      html: paragraph('지수법칙을 이용하면 $2^{1+\\sqrt{3}} \\times 2^{1-\\sqrt{3}}=2^2=4$이다.'),
    },
  ];
  const p2 = problem();
  p2.title = '함수의 연속';
  p2.score = 3;
  p2.blocks[0].html =
    paragraph('함수') +
    paragraph('$$f(x)=\\begin{cases} ax^2-2 & (x&lt;2) \\\\ 3x & (x\\geq 2) \\end{cases}$$') +
    paragraph('가 실수 전체의 집합에서 연속일 때, 상수 $a$의 값은?');
  p2.blocks[1].items = [1, 2, 3, 4, 5].map((n) => ({ id: id(), html: paragraph(`$${n}$`) }));
  p2.space = 60;
  p2.answer = p2.blocks[1].items[1].id;
  const p3 = problem();
  p3.title = '등차수열';
  p3.score = 3;
  p3.blocks[0].html = paragraph('등차수열 $\\{a_n\\}$이 다음 조건을 만족시킨다.');
  const cond = block('conditions');
  cond.items = [
    { id: id(), html: paragraph('$a_1=2$') },
    { id: id(), html: paragraph('$2a_2+a_7=30$') },
  ];
  p3.blocks = [p3.blocks[0], cond, { ...block('text'), html: paragraph('$a_{10}$의 값은?') }, p3.blocks[1]];
  p3.blocks[3].items = [29, 30, 31, 32, 33].map((n) => ({ id: id(), html: paragraph(`$${n}$`) }));
  p3.space = 65;
  p3.answer = p3.blocks[3].items[0].id;
  const p4 = problem();
  p4.title = '미분계수';
  p4.type = 'short';
  p4.score = 4;
  p4.blocks = [
    {
      ...block('text'),
      html:
        paragraph('함수 $f(x)=2x^2+x+2$에 대하여 다음 극한값을 구하시오.') +
        paragraph('$$\\lim_{h\\to 0}\\frac{f(1+h)-f(1)}{h}$$'),
    },
  ];
  p4.answer = '5';
  p4.space = 45;
  return {
    version: 1,
    id: id(),
    name: '나의 첫 번째 모의고사',
    year: 2026,
    month: 6,
    grade: '3',
    elective: '미적분',
    paper: 'A3',
    printProfile: 'kice-2026',
    fontSize: 11.48,
    mathFontSize: 10.98,
    lineHeight: 1.55,
    margin: 31,
    columnGap: 6,
    problems: [p1, p2, p3, p4],
    templates: [],
    updatedAt: new Date().toISOString(),
  };
}
export function ordered(d: ExamDocument) {
  return d.grade === '3' && d.pageTemplate !== 'pink'
    ? [
        ...d.problems.filter((p) => p.section === 'common'),
        ...d.problems.filter((p) => p.section === 'elective'),
      ]
    : d.problems;
}
