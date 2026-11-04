const { chromium } = require('playwright');
const fs = require('node:fs/promises');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const results = [];
  const ts = require('typescript');
  const Module = require('module');
  const model = new Module('flux-model');
  model._compile(
    ts.transpileModule(await fs.readFile('src/model.ts', 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    'model.cjs',
  );
  for (const count of [30, 100]) {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    await page.goto((process.argv[2] || 'http://127.0.0.1:5173/') + '#editor');
    await page.getByText('자동 저장됨', { exact: true }).waitFor();
    const doc = model.exports.demo();
    doc.grade = '1';
    doc.name = `성능 검증 ${count}`;
    doc.problems = Array.from({ length: count }, (_, i) => ({
      ...model.exports.copyProblem(doc.problems[i % 4]),
      title: `문항 ${i + 1}`,
      space: 10,
    }));
    await page.evaluate(async (doc) => {
      const db = await new Promise((resolve, reject) => {
        const r = indexedDB.open('flux-math', 2);
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
      await new Promise((resolve, reject) => {
        const tx = db.transaction('documents', 'readwrite');
        tx.objectStore('documents').put(doc, 'active');
        tx.objectStore('documents').put(doc, doc.id);
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    }, doc);
    const client = await page.context().newCDPSession(page);
    await client.send('Emulation.setCPUThrottlingRate', { rate: 6 });
    await page.reload();
    await page.getByText('자동 저장됨', { exact: true }).waitFor();
    await page.getByRole('button', { name: '전체 시험지', exact: true }).click();
    await page.waitForTimeout(3000);
    await page.evaluate(() => {
      window.__inputTimes = [];
      document.querySelector('.tiptap').addEventListener('keydown', () => {
        const start = performance.now();
        window.__lastInputTime = start;
        requestAnimationFrame(() =>
          requestAnimationFrame(() => window.__inputTimes.push(performance.now() - start)),
        );
      });
    });
    const input = page.locator('.tiptap').first();
    await input.click();
    await input.press('End');
    for (let i = 0; i < 24; i++) {
      await input.press('a');
      await page.waitForTimeout(90);
    }
    await page.waitForFunction(() => document.querySelector('.measurement')?.textContent.includes('a'.repeat(24)));
    const previewDelay = await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(performance.now() - window.__lastInputTime)))));
    await page.waitForTimeout(1200);
    const times = await page.evaluate(() => window.__inputTimes.slice(1).sort((a, b) => a - b));
    const p95 = times[Math.min(times.length - 1, Math.floor(times.length * 0.95))];
    const style = await page.locator('.editor-pane').evaluate((el) => ({
      filter: getComputedStyle(el).backdropFilter,
      glassFilter: getComputedStyle(el, '::before').filter,
    }));
    assert.equal(style.filter, 'none');
    assert.equal(style.glassFilter, 'none');
    const result = {
      problems: count,
      cpuSlowdown: 6,
      inputPaintP95Ms: Math.round(p95 * 10) / 10,
      previewDelayMs: Math.round(previewDelay * 10) / 10,
      samples: times.length,
      pages: await page.locator('.exam-page').count(),
      targetMet: p95 <= 100,
    };
    results.push(result);
    console.log(result);
    await page.close();
  }
  await fs.writeFile('analysis/performance.json', JSON.stringify(results, null, 2));
  await browser.close();
  if (results.some((r) => !r.targetMet)) process.exitCode = 1;
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
