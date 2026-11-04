const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const JSZip = require('jszip');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://127.0.0.1:5173/');
  await page.locator('.document-card').waitFor();
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
  await page.getByLabel('테마 전환', { exact: true }).click();
  await page.reload();
  await page.locator('.document-card').waitFor();
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
  await page.screenshot({path:'analysis/glass-light.png',fullPage:true});
  await page.getByLabel('테마 전환', { exact: true }).click();
  await page.getByLabel('효과 줄이기', { exact: true }).click();
  await page.reload();
  await page.locator('.document-card').waitFor();
  assert.equal(await page.locator('html').getAttribute('data-effects'), 'reduced');
  await page.getByLabel('효과 줄이기', { exact: true }).click();
  await page.screenshot({ path: 'analysis/glass-library.png', fullPage: true });
  await page.locator('.document-card-open').first().click();
  await page.getByText('자동 저장됨', { exact: true }).waitFor();
  await page.waitForTimeout(1000);
  assert.equal(await page.locator('.formula-tooltip').count(), 0);
  assert.equal(await page.locator('.format-toolbar:visible').count(), 0);
  await page.getByLabel('입력 도구', { exact: true }).first().click();
  assert.equal(await page.locator('.format-toolbar:visible').count(), 1);
  await page.getByLabel('입력 도구', { exact: true }).first().click();
  const input = page.locator('.tiptap').first();
  await input.click();
  await input.press('End');
  const client = await page.context().newCDPSession(page);
  await client.send('Input.imeSetComposition', { text: '한', selectionStart: 1, selectionEnd: 1 });
  await page.waitForTimeout(300);
  await client.send('Input.insertText', { text: '한글' });
  await page.waitForTimeout(700);
  assert((await input.innerText()).includes('한글'));
  await input.press('Backspace');
  await input.press('Backspace');
  await page.waitForTimeout(300);
  const result = await page.evaluate(async () => {
    const { demo, block } = await import('/src/model.ts');
    const { buildHwpx } = await import('/src/hwpx.ts');
    const doc = demo();
    doc.cover = true;
    doc.interleaf = 'elective';
    doc.problems[3].section = 'elective';
    doc.problems[1].breakBefore = 'column';
    doc.problems[2].breakBefore = 'page';
    doc.problems[0].explanation[0].html = '<p>$$</p><p>\\frac{1}{2}</p><p>$$</p>';
    const explanation = await buildHwpx(doc, 'explanations');
    if (explanation.size < 1000) throw Error('여러 줄 독립 수식 해설을 내보내지 못했습니다.');
    const image = block('image');
    image.image =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a2ioAAAAASUVORK5CYII=';
    doc.problems[0].blocks.push(image);
    const bytes = new Uint8Array(await (await buildHwpx(doc)).arrayBuffer());
    let text = '';
    for (const b of bytes) text += String.fromCharCode(b);
    const results = { data: btoa(text) };
    doc.problems[0].blocks[0].html = '<p>$\\unsupported{x}$</p>';
    try {
      await buildHwpx(doc);
      results.error = 'NO_ERROR';
    } catch (e) {
      results.error = e.message;
    }
    return results;
  });
  assert(result.error.includes('unsupported'));
  assert(result.error.includes('1번'));
  const data = Buffer.from(result.data, 'base64');
  await fs.writeFile('output/flux-export-test.hwpx', data);
  const zip = await JSZip.loadAsync(data);
  const header = await zip.file('Contents/header.xml').async('string');
  assert(header.includes('신명 중명조'));
  assert(header.includes('한양신명조'));
  assert(header.includes('height="1148"'));
  const sections = Object.keys(zip.files).filter((x) => /^Contents\/section\d+\.xml$/.test(x));
  assert.equal(sections.length, 4);
  const body = (await Promise.all(sections.map((x) => zip.file(x).async('string')))).join('');
  assert(body.includes('HYhwpEQ'));
  assert(body.includes('baseUnit="1098"'));
  assert(body.includes('hp:script'));
  assert(body.includes('hp:pic'));
  assert(body.includes('colCount="2"'));
  assert(body.includes('columnBreak="1"'));
  assert(body.includes('pageBreak="1"'));
  assert(Object.keys(zip.files).some((x) => x.startsWith('BinData/')));
  const valid = await page.evaluate(
    (xml) =>
      xml.every(
        (text) => !new DOMParser().parseFromString(text, 'application/xml').querySelector('parsererror'),
      ),
    [
      header,
      body.slice(0, 0),
      ...(await Promise.all(sections.map((x) => zip.file(x).async('string')))),
    ].filter(Boolean),
  );
  assert(valid);
  await page.screenshot({ path: 'analysis/glass-editor.png', fullPage: true });
  await page.evaluate(async()=>{
    const {load,save}=await import('/src/storage.ts');const doc=await load();
    delete doc.printProfile;delete doc.mathFontSize;doc.paper='A4';doc.fontSize=8.2;doc.margin=22;doc.columnGap=4;
    doc.problems[0].breakBefore='column';doc.problems[0].space=37;await save(doc);
  });
  await page.reload();await page.getByText('자동 저장됨',{exact:true}).waitFor();
  const legacy=await page.evaluate(async()=>{const {load}=await import('/src/storage.ts');return load();});
  assert.equal(legacy.fontSize,8.2);assert.equal(legacy.paper,'A4');assert.equal(legacy.problems[0].space,37);assert.equal(legacy.problems[0].breakBefore,'column');assert.equal(legacy.printProfile,undefined);
  assert.deepEqual(errors, []);
  console.log(
    'PASS dark/theme/effects persistence, simple input, HWPX XML/font references/equations/images/cover/interleaf, unsupported expression rejection',
  );
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
