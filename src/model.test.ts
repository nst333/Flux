import { describe, it, expect } from 'vitest';
import { demo, copyProblem, tokenizeMath, numbering, ordered, problem, examTitle } from './model';
describe('인쇄 제목 방식', () => {
  it('기존 문서는 모의고사 제목을 자동 생성한다', () => {
    const d = demo();
    delete d.printProfile;
    expect(examTitle(d)).toBe(`${d.year}학년도 ${d.month}월 고${d.grade} 전국연합학력평가 문제지`);
    expect(examTitle(d, true)).not.toContain('문제지');
  });
  it('평가원 양식은 모의평가 제목으로 표시한다', () => {
    expect(examTitle(demo())).toBe('2026학년도 대학수학능력시험 6월 모의평가 문제지');
  });
  it('직접 입력 제목을 표지와 문제지에 적용하고 빈 제목은 문서 이름을 쓴다', () => {
    const d = { ...demo(), titleMode: 'custom' as const, customTitle: '  함수 연습  ' };
    expect(examTitle(d)).toBe('함수 연습');
    expect(examTitle(d, true)).toBe('함수 연습');
    d.customTitle = '  ';
    expect(examTitle(d)).toBe(d.name);
  });
});
describe('LaTeX 원문 토큰 분리', () => {
  it('한글과 인라인·독립 수식을 구분한다', () => {
    const tokens = tokenizeMath('함수 $f(x)$와 $$\\frac{1}{2}$$');
    expect(tokens.filter((t) => t.math).map((t) => [t.source, t.display])).toEqual([
      ['f(x)', false],
      ['\\frac{1}{2}', true],
    ]);
  });
  it('입력 중 닫히지 않은 수식을 보존한다', () => {
    const tokens = tokenizeMath('값은 $\\frac{1}');
    expect(tokens.at(-1)?.source).toBe('$\\frac{1}');
    expect(tokens.at(-1)?.error).toBe(true);
  });
  it('이스케이프된 달러를 수식으로 처리하지 않는다', () => {
    expect(
      tokenizeMath('가격 \\$5, 수식 $x$')
        .filter((t) => t.math)
        .map((t) => t.source),
    ).toEqual(['x']);
  });
});
describe('문항 식별과 정답 연결', () => {
  it('복제된 선지에 정답을 연결하고 원본과 ID를 공유하지 않는다', () => {
    const p = demo().problems[0],
      copy = copyProblem(p);
    expect(copy.id).not.toBe(p.id);
    expect(copy.answer).toBe(copy.blocks[1].items[4].id);
    expect(copy.answer).not.toBe(p.answer);
    expect(copy.blocks[1].items.map((x) => x.id).some((x) => p.blocks[1].items.some((y) => y.id === x))).toBe(
      false,
    );
  });
  it('단답형 정답은 복제 시 그대로 보존한다', () => {
    const p = demo().problems[3];
    expect(copyProblem(p).answer).toBe('5');
  });
  it('고3 선택과목은 23번부터, 단일과목은 연속 번호로 표시한다', () => {
    const d = demo();
    const p = problem();
    p.section = 'elective';
    d.problems.splice(1, 0, p);
    expect(numbering(d).get(p.id)).toBe(23);
    expect(ordered(d).at(-1)?.id).toBe(p.id);
    d.grade = '2';
    expect(numbering(d).get(p.id)).toBe(2);
  });
});
