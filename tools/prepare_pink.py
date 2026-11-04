from pathlib import Path
import json
import shutil
import re
import fitz
from pink_pdf import sample, ROOT, TEMPLATE

out = ROOT / 'public/pink'
out.mkdir(parents=True, exist_ok=True)
(out / 'sample.json').write_text(json.dumps(sample(), ensure_ascii=False, indent=2), encoding='utf-8')
pdf = ROOT / 'output/pdf/pink-worksheet.pdf'
if not pdf.exists():
    raise SystemExit('먼저 python tools/pink_pdf.py로 PDF를 조판하세요.')
shutil.copy2(pdf, out / 'worksheet.pdf')
doc = fitz.open(pdf)
ref = fitz.open(TEMPLATE / 'reference.pdf')
assert len(doc) == len(ref) == 8
report = {'pages': [], 'fonts': sorted({f[3] for p in doc for f in p.get_fonts()})}
for i, page in enumerate(doc):
    assert abs(page.rect.width - 595.276) < 1 and abs(page.rect.height - 841.89) < 1
    pix = page.get_pixmap(matrix=fitz.Matrix(1.2, 1.2), alpha=False)
    target = ref[i].get_pixmap(matrix=fitz.Matrix(1.2, 1.2), alpha=False)
    identical = pix.samples == target.samples
    text_equal = re.sub(r'\s', '', page.get_text()) == re.sub(r'\s', '', ref[i].get_text())
    assert text_equal, f'문항 내용 차이: {i+1}쪽'
    report['pages'].append({'page': i+1, 'identical_render': identical, 'text_equal': text_equal})
    pix.pil_save(out / f'page-{i+1}.webp', format='WEBP', quality=90)
    fonts = page.get_fonts(full=True)
    # ReportLab's untouched background declares an unused base-14 Helvetica.
    # Require embedding of every font that actually paints text.
    unused = [f for f in fonts if not doc.extract_font(f[0])[3]]
    assert all(f[3] == 'Helvetica' and f[6] > 0 and not any(op in doc.xref_stream(f[6]) for op in [b'Tj', b'TJ']) for f in unused), 'Unembedded text font'
    assert any('NanumGothic' in f[3] for f in fonts)
    assert any('EURM' in f[3].upper() for f in fonts)
    assert f'{i+1:02d}.' in page.get_text()
(ROOT / 'output/pdf/pink-verification.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(report))
