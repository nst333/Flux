import { block, id, paragraph, problem } from './model';
export function blankReasoningExample() {
  const p = problem();
  p.title = '빈칸 추론 · 함수의 연속';
  p.score = 3;
  p.space = 15;
  const text = block('text');
  text.html = paragraph(
    '다음은 두 함수 $f(x)=x+2$, $g(x)=x^2-4$에 대하여 두 함수 $f(x)g(x)$와 $\\dfrac{f(x)}{g(x)}$가 연속인 전체 구간을 구하는 과정이다.',
  );
  const box = block('box');
  box.html =
    '<ul>' +
    [
      '두 함수 $f(x)$와 $g(x)$는 [[가]] 에서 연속이다.',
      '함수 $f(x)g(x)=(x+2)(x^2-4)=x^3+2x^2-4x-8$은 [[가]] 즉 [[나]] 에서 연속이다.',
      '함수 $\\dfrac{f(x)}{g(x)}=\\dfrac{x+2}{x^2-4}$는 [[다]] 인 모든 실수, 즉 [[라]] 에서 연속이다.',
    ]
      .map((x) => '<li>' + paragraph(x) + '</li>')
      .join('') +
    '</ul>';
  const prompt = block('text');
  prompt.html = paragraph('위의 (가)~(라)에 들어갈 것으로 옳은 것만을 &lt;보기&gt;에서 있는 대로 고른 것은?');
  const view = block('view');
  view.columns = 2;
  view.markers = 'letters';
  view.items = ['모든 실수', '$(-\\infty,\\infty)$', '$x\\ne-2,\\ x\\ne2$', '$(2,\\infty)$'].map((x) => ({
    id: id(),
    html: paragraph(x),
  }));
  const choices = block('choices');
  choices.layout = 'two';
  choices.items = ['(가), (나)', '(가), (다)', '(다), (라)', '(가), (나), (다)', '(나), (다), (라)'].map(
    (x) => ({ id: id(), html: paragraph(x) }),
  );
  p.blocks = [text, box, prompt, view, choices];
  p.answer = choices.items[3].id;
  p.explanation = [
    {
      ...block('text'),
      html: paragraph(
        '다항함수는 모든 실수에서 연속이고, 몫은 분모가 0이 아닌 곳에서 연속이다. 따라서 (가), (나), (다)가 옳다.',
      ),
    },
  ];
  return p;
}
