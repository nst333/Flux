import { mkdir, readFile, writeFile } from 'node:fs/promises';
import JSZip from 'jszip';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
// Binary assets are stored together so the original source fonts stay intact.
if (existsSync('templates/assets.zip')) {
  const assets = await JSZip.loadAsync(await readFile('templates/assets.zip'));
  for (const [name, entry] of Object.entries(assets.files)) {
    if (entry.dir) continue;
    const target = resolve(name);
    if (!target.startsWith(resolve('.') + '/') && !target.startsWith(resolve('.') + '\\')) throw Error('Invalid asset path');
    await mkdir(resolve(target, '..'), { recursive: true });
    await writeFile(target, await entry.async('nodebuffer'));
  }
}
const py = process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
if (process.argv.includes('--compile')) execFileSync(py, ['tools/pink_pdf.py'], { stdio: 'inherit' });
await mkdir('public/pink', { recursive: true });
execFileSync(py, ['tools/prepare_pink.py'], { stdio: 'inherit' });
const zip = new JSZip();
for (const name of ['background.pdf', 'reference.tex', 'fonts/NanumGothic-Regular.ttf', 'fonts/NanumGothic-Bold.ttf', 'fonts/Korean.ttf', 'licenses/NANUM_GOTHIC_LICENSE.txt', 'licenses/DROID_NOTICE.txt']) {
  zip.file(`templates/pink/${name}`, await readFile(`templates/pink/${name}`));
}
zip.file('tools/pink_pdf.py', await readFile('tools/pink_pdf.py'));
zip.file('problems.json', await readFile('public/pink/sample.json'));
zip.file('README.txt', 'Flux 벚꽃 문제지\n\nPython 3와 XeLaTeX(TeX Live: xetex, latex-extra, fonts-recommended)가 필요합니다.\n압축을 푼 폴더에서 실행:\npython -m pip install PyMuPDF==1.26.6\npython tools/pink_pdf.py --input problems.json --output worksheet.pdf\n\n문항별 지시와 정답은 출력하지 않습니다. 폰트 라이선스는 templates/pink/licenses/에 있습니다.\n문항 수정은 problems.json에서 합니다. JSON의 text 및 items에는 $…$, $$…$$ 수식을 쓸 수 있습니다.\n');
await writeFile('public/pink/source-kit.zip', await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
