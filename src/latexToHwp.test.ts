import { describe, it, expect } from 'vitest';
import { latexToHwp } from './latexToHwp';
import { demo } from './model';
import { applyProfile } from './profiles';
describe('한글 수식 변환', () => {
  it('중첩 분수·제곱근·상하첨자를 구조를 유지해 변환한다', () => {
    expect(latexToHwp(String.raw`\frac{1}{\sqrt{x_1^2+1}}`)).toContain('over');
    expect(latexToHwp(String.raw`\frac{1}{\sqrt{x_1^2+1}}`)).toContain('sqrt');
    expect(latexToHwp(String.raw`\sqrt[3]{x}`)).toBe('root {3} of {x}');
  });
  it('극한과 조각함수의 행과 조건을 유지한다', () => {
    const result = latexToHwp(String.raw`f(x)=\begin{cases} ax^2-2 & x<2 \\ 3x & x\geq 2 \end{cases}`);
    expect(result).toContain('cases');
    expect(result).toContain('#');
    expect(result).toContain('>=');
    expect(latexToHwp(String.raw`\lim_{h\to 0}\frac{f(1+h)-f(1)}{h}`)).toContain('lim sub {h -> 0}');
  });
  it('텍스트의 글자 사이에 임의의 공백을 넣지 않는다', () => {
    expect(latexToHwp(String.raw`\text{모든 실수}`)).toBe('"모든 실수"');
  });
  it('논리 화살표를 부등호로 바꾸지 않는다', () => {
    expect(latexToHwp(String.raw`A\Leftarrow B`)).toContain('⇐');
    expect(latexToHwp(String.raw`A\Leftarrow B`)).not.toContain('<=');
  });
  it('지원하지 않는 명령과 깨진 수식은 실패시킨다', () => {
    expect(() => latexToHwp(String.raw`\unknown{x}`)).toThrow('unknown');
    expect(() => latexToHwp(String.raw`\frac{1}`)).toThrow();
    expect(() => latexToHwp(String.raw`\begin{cases}x`)).toThrow();
    expect(() => latexToHwp('x}')).toThrow();
    expect(() => latexToHwp(String.raw`\text{"x"}`)).toThrow();
  });
});
describe('출력 양식 호환', () => {
  it('새 문서는 평가원 A3 원본 크기를 사용한다', () => {
    const doc = demo();
    expect([doc.paper, doc.fontSize, doc.mathFontSize]).toEqual(['A3', 11.48, 10.98]);
  });
  it('양식 적용은 명시적으로 하며 원래 문서를 변경하지 않는다', () => {
    const doc = demo();
    const next = applyProfile(doc, 'office-2026');
    expect(next.fontSize).toBe(11.52);
    expect(doc.fontSize).toBe(11.48);
  });
});
