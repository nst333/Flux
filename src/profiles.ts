import type { ExamDocument } from './model';
export type PrintProfile = 'kice-2026' | 'office-2026' | 'legacy';
export const profiles = {
  'kice-2026': {
    name: '평가원 · 2026학년도 6월',
    body: 11.48,
    math: 10.98,
    title: 21,
    number: 13,
    page: 33,
    footer: 12,
    session: 22,
    type: 15,
    fonts: {
      body: '신명 중명조',
      latin: '한양신명조',
      title: '신명 디나루',
      number: '한양견명조',
      page: '신명 견명조',
      type: '#태고딕',
      math: 'HYhwpEQ',
    },
  },
  'office-2026': {
    name: '교육청 · 2026년 3월',
    body: 11.52,
    math: 11.04,
    title: 24,
    number: 14.04,
    page: 36,
    footer: 12,
    session: 21,
    type: 12,
    fonts: {
      body: '한컴바탕',
      latin: '한컴바탕',
      title: '한컴돋움',
      number: '한컴바탕',
      page: 'HY헤드라인M',
      type: 'HY헤드라인M',
      math: 'HYhwpEQ',
    },
  },
};
export function applyProfile(doc: ExamDocument, profile: PrintProfile): ExamDocument {
  if (profile === 'legacy') return { ...doc, printProfile: profile };
  const p = profiles[profile];
  return {
    ...doc,
    printProfile: profile,
    paper: 'A3',
    fontSize: p.body,
    mathFontSize: p.math,
    margin: 31,
    columnGap: 6,
    lineHeight: 1.55,
  };
}
