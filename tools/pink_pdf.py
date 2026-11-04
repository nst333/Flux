"""Exact A4 template renderer. Input is data, never executable TeX."""
from pathlib import Path
import argparse
import json
import re
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
TEMPLATE = ROOT / 'templates' / 'pink'
# Commands used in math, with no file, macro, category-code or shell primitives.
COMMANDS = set('displaystyle text mathrm mathbf mathit mathcal mathbb operatorname frac dfrac tfrac sqrt left right begin end cases aligned matrix pmatrix bmatrix array limits nolimits int iint iiint oint sum prod lim infty to rightarrow leftarrow le leq ge geq ne neq equiv approx sim times cdot div pm mp cup cap in notin subset subseteq supset supseteq emptyset vert mid lvert rvert lVert rVert alpha beta gamma delta epsilon varepsilon theta vartheta lambda mu nu xi pi rho sigma tau phi varphi chi psi omega Gamma Delta Theta Lambda Xi Pi Sigma Phi Psi Omega sin cos tan cot sec csc log ln exp min max det sup inf overline underline vec hat bar dot ddot quad qquad enspace thinspace space partial nabla forall exists neg land lor ldots cdots vdots ddots big Big bigg Bigg bigl bigr Bigl Bigr biggl biggr textstyle scriptstyle scriptscriptstyle prime'.split())

def math_safe(value):
    if any(c in value for c in ['%', '#', '\x00', '^^']):
        raise ValueError('수식에 허용되지 않는 TeX 제어 문자가 있습니다.')
    for match in re.finditer(r'\\([A-Za-z]+|.)', value, re.S):
        command = match.group(1)
        if command.isalpha() and command not in COMMANDS:
            raise ValueError(f'지원하지 않는 수식 명령: \\{command}')
        if not command.isalpha() and command not in '{}\\,;:! |_$&':
            raise ValueError('허용되지 않는 수식 명령입니다.')
    for env in re.findall(r'\\(?:begin|end)\{([^}]+)\}', value):
        if env not in {'cases', 'aligned', 'matrix', 'pmatrix', 'bmatrix', 'array'}:
            raise ValueError(f'지원하지 않는 수식 환경: {env}')
    return value

def prose(value):
    table = {'\\': r'\textbackslash{}', '&': r'\&', '%': r'\%', '$': r'\$', '#': r'\#', '_': r'\_', '{': r'\{', '}': r'\}', '~': r'\textasciitilde{}', '^': r'\textasciicircum{}'}
    return ''.join(table.get(c, c) for c in value)

def rich(value):
    if not isinstance(value, str) or len(value) > 20000:
        raise ValueError('본문은 20,000자 이하의 문자열이어야 합니다.')
    parts = re.split(r'(\$\$[\s\S]*?\$\$|(?<!\\)\$[^$]*?(?<!\\)\$)', value)
    result = []
    for i, part in enumerate(parts):
        if i % 2:
            display = part.startswith('$$')
            raw = part[2:-2] if display else part[1:-1]
            result.append((r'\[' + math_safe(raw) + r'\]') if display else '$' + math_safe(raw) + '$')
        else:
            if re.search(r'(?<!\\)\$', part):
                raise ValueError('수식의 $ 구분자를 확인하세요.')
            result.append(prose(part))
    return ''.join(result)

def sample():
    data = json.loads((TEMPLATE / 'problems_source.json').read_text(encoding='utf-8'))['document']
    problems = []
    for i, q in enumerate(data['problems']):
        blocks = []
        for b in q['content']:
            def clean(s):
                s = s.replace(r'\n', '\n').replace('\\\\', '\\')
                s = s.replace('\\\n', '\\\\\n').replace('떄', '때')
                return re.sub(r'\\\\\s*(?=\\end\{cases\})', '', s)
            content = b['content']
            if b['type'] == 'STATEMENT':
                s = clean(content)
                if i == 7 and '고난도' in s:
                    s = s.split('\n', 1)[1]
                blocks.append({'kind': 'text', 'text': s})
            else:
                items = [clean(x) for x in content]
                if i == 7 and b['type'] == 'CONDITIONS':
                    items[0] = items[0].replace('최솟값', '최댓값')
                    # Explicit sample-only line break, never applied to user problems.
                    items[1] = items[1].replace('실수 $k$', '\n실수 $k$')
                blocks.append({'kind': 'choices' if b['type'] == 'CHOICES' else 'conditions', 'items': items})
        problems.append({'blocks': blocks})
    return {'version': 1, 'problems': problems}

def render_source(data):
    problems = data.get('problems')
    if not isinstance(problems, list) or not 1 <= len(problems) <= 100:
        raise ValueError('문항은 1~100개여야 합니다.')
    pre = (TEMPLATE / 'reference.tex').read_text(encoding='utf-8').split(r'\begin{document}')[0]
    pre = re.sub(r'\\hypersetup\{[^\n]+', r'\\hypersetup{pdftitle={Flux},pdfauthor={}}', pre)
    pages = []
    for i, q in enumerate(problems):
        blocks = []
        if not isinstance(q.get('blocks'), list) or len(q['blocks']) > 100:
            raise ValueError('문항의 블록 구성을 확인하세요.')
        for b in q['blocks']:
            kind = b.get('kind')
            if kind in {'text', 'box'}:
                body = rich(b.get('text', ''))
                blocks.append(r'\cond{' + body + '}' if kind == 'box' else body)
            elif kind in {'conditions', 'choices'}:
                items = b.get('items')
                limit = 5 if kind == 'choices' else 10
                if not isinstance(items, list) or not 1 <= len(items) <= limit:
                    raise ValueError(f'{kind}: 항목은 1~{limit}개여야 합니다.')
                if kind == 'choices':
                    blocks.append(r'\par\vspace{15pt}\noindent ' + ''.join(r'\makebox[30mm][l]{{\circledfont ' + mark + r'}\enspace ' + rich(s) + '}' for mark, s in zip('①②③④⑤', items)))
                else:
                    rows = [r'\begin{minipage}[t]{9mm}(' + '가나다라마바사아자차'[k] + r')\end{minipage}\begin{minipage}[t]{135mm}' + rich(s).replace('\n', r'\\ ') + r'\end{minipage}' for k, s in enumerate(items)]
                    blocks.append(r'\cond{' + r'\par\vspace{8pt}'.join(rows) + '}')
            else:
                raise ValueError(f'지원하지 않는 블록: {kind}')
        pages.append('\n'.join([
            r'\null\begin{tikzpicture}[remember picture,overlay]',
            r'\node[anchor=north west,inner sep=0pt] at (current page.north west) {\includegraphics[width=210mm,height=297mm]{background.pdf}};',
            f'\\place{{23}}{{59}}{{161}}{{\\fontsize{{19}}{{24}}\\selectfont\\color{{rose}}\\textbf{{{i+1:02d}.}}}}',
            r'\place{23}{75}{161}{\fontsize{15.5}{24}\selectfont ' + '\n'.join(blocks) + '}',
            r'\end{tikzpicture}\newpage']))
    return pre + '\\begin{document}\n' + '\n'.join(pages) + r'\end{document}'

def build(data, destination, reference=False):
    destination = Path(destination).resolve()
    destination.parent.mkdir(parents=True, exist_ok=True)
    (ROOT / 'tmp/pdfs').mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='flux-pink-', dir=ROOT / 'tmp/pdfs') as tmp:
        work = Path(tmp)
        shutil.copytree(TEMPLATE / 'fonts', work / 'fonts')
        shutil.copy2(TEMPLATE / 'background.pdf', work)
        source = (TEMPLATE / 'reference.tex').read_text(encoding='utf-8') if reference else render_source(data)
        (work / 'worksheet.tex').write_text(source, encoding='utf-8')
        engine = shutil.which('xelatex')
        if engine:
            command = [engine, '-no-shell-escape', '-interaction=nonstopmode', '-halt-on-error', 'worksheet.tex']
            for _ in range(2):
                run = subprocess.run(command, cwd=work, capture_output=True, timeout=180)
                if run.returncode:
                    raise RuntimeError(run.stdout.decode('utf-8', errors='replace')[-5000:])
        else:
            engine = shutil.which('tectonic') or str(ROOT / 'tools/tectonic/tectonic.exe')
            if not Path(engine).exists():
                raise RuntimeError('XeLaTeX 또는 Tectonic을 설치하세요. GitHub Actions에서도 조판할 수 있습니다.')
            run = subprocess.run([engine, '--untrusted', '--keep-logs', 'worksheet.tex'], cwd=work, capture_output=True, timeout=240)
            if run.returncode:
                raise RuntimeError(run.stderr.decode('utf-8', errors='replace')[-5000:])
        log = (work / 'worksheet.log').read_text(encoding='utf-8', errors='replace')
        if 'Missing character:' in log or re.search(r'Overfull \\[hv]box', log):
            raise ValueError('글꼴 누락 또는 영역 넘침이 있습니다. 문항을 나누거나 수식 길이를 줄여주세요.')
        import fitz
        with fitz.open(work / 'worksheet.pdf') as pdf:
            if len(pdf) != len(data['problems']):
                raise ValueError('한 쪽에 한 문항 배치를 확인하지 못했습니다.')
            for i, page in enumerate(pdf):
                for span in page.get_texttrace():
                    x0, y0, x1, y1 = span['bbox']
                    if x0 < 22 * 72 / 25.4 or x1 > 188 * 72 / 25.4 or y1 > 270 * 72 / 25.4:
                        raise ValueError(f'{i+1}번 문항이 흰 문제 영역을 넘습니다. 문항을 나눠주세요.')
        shutil.copy2(work / 'worksheet.pdf', destination)
        destination.with_suffix('.tex').write_text(source, encoding='utf-8')
    return destination

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', type=Path)
    parser.add_argument('--output', type=Path, default=ROOT / 'output/pdf/pink-worksheet.pdf')
    args = parser.parse_args()
    data = json.loads(args.input.read_text(encoding='utf-8')) if args.input else sample()
    print(build(data, args.output, reference=not args.input))
