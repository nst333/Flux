import JSZip from 'jszip';
import { download } from './storage';
import { examTitle, numbering, ordered, tokenizeMath } from './model';
import type { Block, ExamDocument, Problem } from './model';
import { profiles } from './profiles';
import { latexToHwp } from './latexToHwp';
import { renderMathHtml } from './RichText';

const esc = (text: string) =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const units = (mm: number) => Math.round((mm * 7200) / 25.4);
const hp = 'http://www.hancom.co.kr/hwpml/2011/paragraph';
const hh = 'http://www.hancom.co.kr/hwpml/2011/head';
const tags = (node: Document | Element, name: string) => [...node.getElementsByTagNameNS('*', name)];
const parse = (xml: string) => {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.querySelector('parsererror')) throw Error('한글 문서 XML을 만들지 못했습니다.');
  return doc;
};
const serialize = (node: Node) => new XMLSerializer().serializeToString(node);
function plain(html: string) {
  const el = document.createElement('div');
  el.innerHTML = html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '</p>\n');
  return el.textContent ?? '';
}
function answer(p: Problem) {
  if (p.type === 'short') return p.answer || '미입력';
  const i = p.blocks
    .filter((b) => b.kind === 'choices')
    .flatMap((b) => b.items)
    .findIndex((x) => x.id === p.answer);
  return i < 0 ? '미입력' : String.fromCodePoint(0x2460 + i);
}

export async function buildHwpx(
  doc: ExamDocument,
  mode: 'questions' | 'answers' | 'explanations' = 'questions',
): Promise<Blob> {
  // Preflight every expression before creating a file. No raster equation fallback.
  const errors: string[] = [];
  const nums = numbering(doc);
  const relevant = ordered(doc);
  for (const p of relevant)
    for (const b of mode === 'answers' ? [] : mode === 'explanations' ? p.explanation : p.blocks) {
      for (const html of [b.html, ...b.items.map((x) => x.html)]) {
        for (const token of tokenizeMath(plain(html)))
          if (token.math || token.error) {
            try {
              if (token.error) throw Error('닫히지 않은 $ 수식');
              latexToHwp(token.source);
            } catch (e) {
              errors.push(`${nums.get(p.id)}번 · ${token.source}\n${(e as Error).message}`);
            }
          }
      }
    }
  if (errors.length)
    throw Error('한글 수식 변환을 확인하세요. 파일을 만들지 않았습니다.\n\n' + errors.join('\n\n'));
  const response = await fetch(`${import.meta.env.BASE_URL}templates/base.hwpx`);
  if (!response.ok) throw Error('한글 문서 템플릿을 불러오지 못했습니다.');
  const zip = await JSZip.loadAsync(await response.arrayBuffer());
  const header = parse(await zip.file('Contents/header.xml')!.async('string'));
  const base = parse(await zip.file('Contents/section0.xml')!.async('string'));
  const packageDoc = parse(await zip.file('Contents/content.hpf')!.async('string'));
  const profile =
    doc.printProfile && doc.printProfile !== 'legacy' ? profiles[doc.printProfile] : profiles['office-2026'];
  const paperScale = (doc.paper === 'A3' ? 297 : doc.paper === 'B4' ? 257 : 210) / 297;
  const fonts = [
    profile.fonts.body,
    profile.fonts.latin,
    profile.fonts.title,
    profile.fonts.number,
    profile.fonts.page,
    profile.fonts.type,
    profile.fonts.math,
  ];
  const families = tags(header, 'fontface');
  for (const family of families) {
    family.setAttribute('fontCnt', String(fonts.length));
    family.replaceChildren();
    fonts.forEach((name, id) => {
      const font = header.createElementNS(hh, 'hh:font');
      font.setAttribute('id', String(id));
      font.setAttribute('face', name);
      font.setAttribute('type', doc.printProfile === 'kice-2026' && id !== 6 ? 'HFT' : 'TTF');
      font.setAttribute('isEmbedded', '0');
      family.append(font);
    });
  }
  const chars = tags(header, 'charProperties')[0];
  const charBase = tags(header, 'charPr')[0].cloneNode(true) as Element;
  chars.replaceChildren();
  const sizes = [
    doc.fontSize,
    doc.fontSize,
    profile.title * paperScale,
    profile.number * paperScale,
    profile.page * paperScale,
    profile.type * paperScale,
    doc.mathFontSize ?? doc.fontSize * 0.956,
  ];
  fonts.forEach((_, id) => {
    const el = charBase.cloneNode(true) as Element;
    el.setAttribute('id', String(id));
    el.setAttribute('height', String(Math.round(sizes[id] * 100)));
    el.setAttribute('textColor', '#000000');
    const refs = tags(el, 'fontRef')[0];
    for (const attr of [...refs.attributes])
      refs.setAttribute(
        attr.name,
        String(id === 0 && ['latin', 'symbol', 'other', 'user'].includes(attr.name) ? 1 : id),
      );
    chars.append(el);
  });
  chars.setAttribute('itemCnt', String(fonts.length));
  for (const [id, size, font] of [
    [7, 36 * paperScale, 2],
    [8, doc.fontSize, 0],
    [9, doc.fontSize, 0],
    [10, profile.footer * paperScale, 4],
    [11, profile.session * paperScale, 3],
  ]) {
    const el = charBase.cloneNode(true) as Element;
    el.setAttribute('id', String(id));
    el.setAttribute('height', String(Math.round(size * 100)));
    for (const attr of [...tags(el, 'fontRef')[0].attributes])
      tags(el, 'fontRef')[0].setAttribute(
        attr.name,
        String(font === 0 && ['latin', 'symbol', 'other', 'user'].includes(attr.name) ? 1 : font),
      );
    if (id === 7 || id === 8) el.append(header.createElementNS(hh, 'hh:bold'));
    if (id === 9) el.append(header.createElementNS(hh, 'hh:italic'));
    chars.append(el);
  }
  chars.setAttribute('itemCnt', String(tags(chars, 'charPr').length));
  const paras = tags(header, 'paraProperties')[0];
  const paraBase = tags(header, 'paraPr')[0].cloneNode(true) as Element;
  const paraIds = new Map<string, number>();
  function paraStyle(
    options: { align?: string; border?: boolean; gap?: number; keep?: boolean; space?: number } = {},
  ) {
    const key = JSON.stringify(options);
    if (paraIds.has(key)) return paraIds.get(key)!;
    const id = tags(paras, 'paraPr').length;
    const el = paraBase.cloneNode(true) as Element;
    el.setAttribute('id', String(id));
    el.setAttribute('snapToGrid', '0');
    tags(el, 'align').forEach((e) => e.setAttribute('horizontal', options.align ?? 'JUSTIFY'));
    tags(el, 'lineSpacing').forEach((e) => {
      e.setAttribute('type', options.space ? 'FIXED' : 'PERCENT');
      e.setAttribute(
        'value',
        String(options.space ? units(options.space) : Math.round(doc.lineHeight * 100)),
      );
    });
    tags(el, 'next').forEach((e) => e.setAttribute('value', String(units(options.gap ?? 1))));
    tags(el, 'breakSetting').forEach((e) => {
      e.setAttribute('keepWithNext', options.keep ? '1' : '0');
      e.setAttribute('keepLines', '1');
    });
    tags(el, 'border').forEach((e) => {
      e.setAttribute('borderFillIDRef', options.border ? '3' : '2');
      e.setAttribute('offsetLeft', String(units(options.border ? 2 : 0)));
      e.setAttribute('offsetRight', String(units(options.border ? 2 : 0)));
      e.setAttribute('connect', options.border ? '1' : '0');
    });
    paras.append(el);
    paras.setAttribute('itemCnt', String(tags(paras, 'paraPr').length));
    paraIds.set(key, id);
    return id;
  }
  const borderFills = tags(header, 'borderFills')[0];
  const border = tags(borderFills, 'borderFill')[0].cloneNode(true) as Element;
  border.setAttribute('id', '3');
  for (const name of ['leftBorder', 'rightBorder', 'topBorder', 'bottomBorder'])
    tags(border, name).forEach((e) => {
      e.setAttribute('type', 'SOLID');
      e.setAttribute('width', '0.12 mm');
    });
  borderFills.append(border);
  borderFills.setAttribute('itemCnt', String(tags(borderFills, 'borderFill').length));
  const ns = [...base.documentElement.attributes]
    .filter((a) => a.name.startsWith('xmlns'))
    .map((a) => `${a.name}="${a.value}"`)
    .join(' ');
  let sequence = 1000;
  const run = (text: string, style = 0): string =>
    text
      .split(/(\[\[[가나다라마바사아자차]\]\])/g)
      .map((part) =>
        /^\[\[[가나다라마바사아자차]\]\]$/.test(part)
          ? table([run(`(${part[2]})`)], 1, true, 13).replace(/^<hp:p[^>]*>|<\/hp:p>$/g, '')
          : `<hp:run charPrIDRef="${style}"><hp:t>${esc(part)}</hp:t></hp:run>`,
      )
      .join('');
  function equation(source: string) {
    return `<hp:run charPrIDRef="0"><hp:equation id="${sequence++}" zOrder="0" numberingType="EQUATION" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" version="Equation Version 60" baseLine="0" textColor="#000000" baseUnit="${Math.round((doc.mathFontSize ?? doc.fontSize * 0.956) * 100)}" lineMode="CHAR" font="HYhwpEQ"><hp:sz width="0" widthRelTo="ABSOLUTE" height="0" heightRelTo="ABSOLUTE" protect="0"/><hp:pos treatAsChar="1" affectLSpacing="1" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="PARA" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/><hp:outMargin left="0" right="0" top="0" bottom="0"/><hp:shapeComment>수식</hp:shapeComment><hp:script>${esc(latexToHwp(source))}</hp:script></hp:equation></hp:run>`;
  }
  function inline(html: string): string {
    const element = document.createElement('div');
    element.innerHTML = html;
    const spans: { start: number; end: number; style: number }[] = [];
    let text = '';
    const visit = (node: Node, bold = false, italic = false): void => {
      if (node.nodeType === Node.TEXT_NODE) {
        const value = node.textContent ?? '';
        spans.push({ start: text.length, end: text.length + value.length, style: bold ? 8 : italic ? 9 : 0 });
        text += value;
        return;
      }
      if (!(node instanceof Element)) return;
      if (node.tagName === 'BR') {
        spans.push({ start: text.length, end: text.length + 1, style: 0 });
        text += '\n';
        return;
      }
      for (const child of [...node.childNodes])
        visit(
          child,
          bold || ['STRONG', 'B'].includes(node.tagName),
          italic || ['EM', 'I'].includes(node.tagName),
        );
    };
    for (const child of [...element.childNodes]) visit(child);
    let cursor = 0;
    return (
      tokenizeMath(text)
        .map((token) => {
          if (token.error) throw Error('닫히지 않은 수식');
          if (token.math) {
            cursor += token.source.length + (token.display ? 4 : 2);
            return equation(token.source);
          }
          const start = cursor,
            end = start + token.source.length;
          cursor = end;
          return spans
            .filter((span) => span.end > start && span.start < end)
            .map((span) => {
              const part = text.slice(Math.max(span.start, start), Math.min(span.end, end));
              return part
                .split('\n')
                .map((line) => run(line, span.style))
                .join('<hp:run charPrIDRef="0"><hp:t><hp:lineBreak/></hp:t></hp:run>');
            })
            .join('');
        })
        .join('') || run('')
    );
  }
  const paragraph = (content: string, style = paraStyle(), breakBefore = 'auto') =>
    `<hp:p id="${sequence++}" paraPrIDRef="${style}" styleIDRef="0" pageBreak="${breakBefore === 'page' ? 1 : 0}" columnBreak="${breakBefore === 'column' ? 1 : 0}" merged="0">${content || run('')}</hp:p>`;
  const width = doc.paper === 'A3' ? 297 : doc.paper === 'B4' ? 257 : 210,
    height = doc.paper === 'A3' ? 420 : doc.paper === 'B4' ? 364 : 297;
  const columnWidth = (width - doc.margin * 2 - doc.columnGap) / 2;
  const assets: { id: string; path: string; mime: string; bytes: Uint8Array }[] = [];
  async function image(b: Block) {
    if (!b.image) return '';
    const match = b.image.match(/^data:(image\/(?:png|jpeg|webp|gif));base64,(.+)$/s);
    if (!match) throw Error('한글 파일에 넣을 수 없는 이미지입니다.');
    let bytes = Uint8Array.from(atob(match[2]), (c) => c.charCodeAt(0)),
      mime = match[1];
    const img = new Image();
    img.src = b.image;
    await img.decode();
    if (mime === 'image/webp' || mime === 'image/gif') {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      c.getContext('2d')!.drawImage(img, 0, 0);
      const png = c.toDataURL('image/png').split(',')[1];
      bytes = Uint8Array.from(atob(png), (c) => c.charCodeAt(0));
      mime = 'image/png';
    }
    const id = `image${assets.length + 1}`,
      path = `BinData/${id}.${mime === 'image/jpeg' ? 'jpg' : 'png'}`;
    assets.push({ id, path, mime, bytes });
    const w = units((columnWidth * b.imageWidth) / 100),
      h = Math.round((w * img.naturalHeight) / img.naturalWidth);
    return paragraph(
      `<hp:run charPrIDRef="0"><hp:pic id="${sequence++}" zOrder="0" numberingType="PICTURE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" reverse="0"><hp:offset x="0" y="0"/><hp:orgSz width="${w}" height="${h}"/><hp:curSz width="${w}" height="${h}"/><hp:flip horizontal="0" vertical="0"/><hp:rotationInfo angle="0" centerX="${Math.round(w / 2)}" centerY="${Math.round(h / 2)}" rotateimage="1"/><hp:renderingInfo><hc:transMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/><hc:scaMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/><hc:rotMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/></hp:renderingInfo><hc:img binaryItemIDRef="${id}" bright="0" contrast="0" effect="REAL_PIC" alpha="0"/><hp:imgRect><hc:pt0 x="0" y="0"/><hc:pt1 x="${w}" y="0"/><hc:pt2 x="${w}" y="${h}"/><hc:pt3 x="0" y="${h}"/></hp:imgRect><hp:imgClip left="0" right="${w}" top="0" bottom="${h}"/><hp:inMargin left="0" right="0" top="0" bottom="0"/><hp:imgDim dimwidth="${w}" dimheight="${h}"/><hp:effects/><hp:sz width="${w}" widthRelTo="ABSOLUTE" height="${h}" heightRelTo="ABSOLUTE" protect="0"/><hp:pos treatAsChar="1" affectLSpacing="1" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="PARA" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/><hp:outMargin left="0" right="0" top="0" bottom="0"/><hp:shapeComment>문항 이미지</hp:shapeComment></hp:pic></hp:run>`,
      paraStyle({ align: b.align.toUpperCase() }),
    );
  }
  function rich(html: string, options: { border?: boolean; keep?: boolean } = {}, prefix = '', suffix = '') {
    const el = document.createElement('div');
    el.innerHTML = html.replace(/(?<!\\)\$\$[\s\S]*?(?<!\\)\$\$|(?<![\\$])\$[^$]*?(?<!\\)\$(?!\$)/g, (math) =>
      math.replace(/<\/p>\s*<p[^>]*>/g, '<br/>'),
    );
    const parts = [...el.children];
    if (!parts.length) return paragraph(inline(html), paraStyle(options));
    return parts
      .map((p, i) =>
        p.tagName === 'UL'
          ? [...p.children]
              .map((li) => paragraph(run('• ') + inline(li.innerHTML), paraStyle(options)))
              .join('')
          : paragraph(
              (i === 0 ? prefix : '') + inline(p.innerHTML) + (i === parts.length - 1 ? suffix : ''),
              paraStyle({ ...options, align: p.textContent?.trim().startsWith('$$') ? 'CENTER' : undefined }),
            ),
      )
      .join('');
  }
  function table(items: string[], columns: number, bordered: boolean, tableWidth = columnWidth) {
    if (!items.length) return '';
    const rows = Math.ceil(items.length / columns),
      w = units(tableWidth),
      cw = Math.floor(w / columns);
    let cells = '';
    for (let row = 0; row < rows; row++) {
      cells += '<hp:tr>';
      for (let col = 0; col < columns; col++)
        cells += `<hp:tc name="" header="0" hasMargin="1" protect="0" editable="0" dirty="0" borderFillIDRef="${bordered ? 3 : 1}"><hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="TOP" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">${paragraph(items[row * columns + col] ?? run(''))}</hp:subList><hp:cellAddr colAddr="${col}" rowAddr="${row}"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:cellSz width="${cw}" height="${units(5)}"/><hp:cellMargin left="${units(1)}" right="${units(1)}" top="${units(1)}" bottom="${units(1)}"/></hp:tc>`;
      cells += '</hp:tr>';
    }
    return paragraph(
      `<hp:run charPrIDRef="0"><hp:tbl id="${sequence++}" zOrder="0" numberingType="TABLE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" pageBreak="CELL" repeatHeader="0" rowCnt="${rows}" colCnt="${columns}" cellSpacing="0" borderFillIDRef="${bordered ? 3 : 1}" noAdjust="0"><hp:sz width="${w}" widthRelTo="ABSOLUTE" height="${rows * units(7)}" heightRelTo="ABSOLUTE" protect="0"/><hp:pos treatAsChar="1" affectLSpacing="1" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="PARA" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/><hp:outMargin left="0" right="0" top="0" bottom="0"/><hp:inMargin left="0" right="0" top="0" bottom="0"/>${cells}</hp:tbl></hp:run>`,
    );
  }
  function autoColumns(b: Block) {
    const probe = document.createElement('div');
    probe.className = 'exam-type';
    probe.style.cssText = `position:absolute;left:-10000px;top:0;width:max-content;white-space:nowrap;font-size:${doc.fontSize}pt;--math-scale:${(doc.mathFontSize ?? doc.fontSize * 0.956) / doc.fontSize}`;
    document.body.append(probe);
    let widest = 0;
    try {
      for (const item of b.items) {
        probe.innerHTML = '① ' + renderMathHtml(item.html).html;
        widest = Math.max(widest, probe.getBoundingClientRect().width + 14);
      }
    } finally {
      probe.remove();
    }
    const width = (columnWidth * 96) / 25.4;
    return widest <= width / 5 ? 5 : widest <= width / 3 ? 3 : widest <= width / 2 ? 2 : 1;
  }
  async function blocks(list: Block[], p?: Problem) {
    let out = '';
    const lastText = list.findLastIndex((b) => b.kind === 'text');
    for (const [index, b] of list.entries()) {
      if (b.kind === 'image') {
        out += await image(b);
        continue;
      }
      if (b.kind === 'choices') {
        const items = b.items.map((x, i) => run(String.fromCodePoint(0x2460 + i) + ' ') + inline(x.html));
        if (b.layout === 'threeTwo' || b.layout === 'twoThree') {
          const split = b.layout === 'threeTwo' ? 3 : 2;
          out +=
            table(items.slice(0, split), split, false) +
            table(items.slice(split), items.length - split, false);
        } else
          out += table(
            items,
            b.layout === 'vertical' ? 1 : b.layout === 'auto' ? autoColumns(b) : b.layout === 'two' ? 2 : 5,
            false,
          );
      } else if (b.kind === 'conditions' || b.kind === 'view') {
        if (b.kind === 'view')
          out += paragraph(run('< 보 기 >'), paraStyle({ align: 'CENTER', border: true, keep: true }));
        const markers = b.markers ?? (b.kind === 'conditions' ? 'letters' : 'korean');
        const items = b.items.map(
          (x, i) =>
            run(
              markers === 'none'
                ? ''
                : markers === 'bullet'
                  ? '• '
                  : markers === 'letters'
                    ? `(${'가나다라마바사아자차'[i] ?? i + 1}) `
                    : `${['ㄱ', 'ㄴ', 'ㄷ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅅ', 'ㅇ', 'ㅈ', 'ㅊ'][i] ?? i + 1}. `,
            ) + inline(x.html),
        );
        out +=
          b.columns === 2
            ? table(items, 2, true)
            : items.map((x) => paragraph(x, paraStyle({ border: true }))).join('');
      } else
        out += rich(
          b.html,
          { border: b.kind === 'box' },
          p && index === 0 ? run(`${nums.get(p.id)}. `, 3) : '',
          p && index === lastText ? run(` [${p.score}점]`) : '',
        );
    }
    return out;
  }
  const sections: string[] = [];
  const keepStyles = new Map<string, string>();
  function keepTogether(fragment: string) {
    const part = parse(`<hs:sec ${ns}>${fragment}</hs:sec>`);
    const list = [...part.documentElement.children];
    list.slice(0, -1).forEach((p) => {
      const original = p.getAttribute('paraPrIDRef')!;
      if (!keepStyles.has(original)) {
        const source = tags(paras, 'paraPr').find((e) => e.getAttribute('id') === original)!;
        const copy = source.cloneNode(true) as Element;
        const id = String(tags(paras, 'paraPr').length);
        copy.setAttribute('id', id);
        tags(copy, 'breakSetting').forEach((e) => e.setAttribute('keepWithNext', '1'));
        paras.append(copy);
        paras.setAttribute('itemCnt', String(tags(paras, 'paraPr').length));
        keepStyles.set(original, id);
      }
      p.setAttribute('paraPrIDRef', keepStyles.get(original)!);
    });
    tags(part, 'tbl').forEach((t) => t.setAttribute('pageBreak', 'NONE'));
    return list.map(serialize).join('');
  }
  function section(body: string, columns = 2, numbered = true) {
    const secPr = tags(base, 'secPr')[0].cloneNode(true) as Element;
    const page = tags(secPr, 'pagePr')[0];
    page.setAttribute('width', String(units(width)));
    page.setAttribute('height', String(units(height)));
    page.setAttribute('landscape', 'WIDELY');
    const margin = tags(page, 'margin')[0];
    for (const k of ['left', 'right', 'top', 'bottom']) margin.setAttribute(k, String(units(doc.margin)));
    margin.setAttribute('header', String(units(8)));
    margin.setAttribute('footer', String(units(8)));
    const columnsXml = `<hp:ctrl><hp:colPr id="" type="NEWSPAPER" layout="LEFT" colCount="${columns}" sameSz="1" sameGap="${units(doc.columnGap)}">${columns === 2 ? '<hp:colLine type="SOLID" width="0.12 mm" color="#888888"/>' : ''}</hp:colPr></hp:ctrl>`;
    tags(secPr, 'startNum')[0].setAttribute('page', numbered ? '1' : '0');
    const visibility = tags(secPr, 'visibility')[0];
    for (const key of ['hideFirstHeader', 'hideFirstFooter', 'hideFirstPageNum'])
      visibility.setAttribute(key, numbered ? '0' : '1');
    const pageNumber = numbered
      ? `<hp:run charPrIDRef="10"><hp:ctrl><hp:pageNum pos="BOTTOM_CENTER" formatType="DIGIT" sideChar=""/></hp:ctrl></hp:run>`
      : '';
    const pageField = `<hp:run charPrIDRef="4"><hp:ctrl><hp:autoNum num="1" numType="PAGE"><hp:autoNumFormat type="DIGIT" userChar="" prefixChar="" suffixChar="" supscript="0"/></hp:autoNum></hp:ctrl></hp:run>`;
    const runningHeader = numbered
      ? `<hp:ctrl><hp:header id="${sequence++}" applyPageType="BOTH"><hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="TOP" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">${paragraph(pageField, paraStyle({ align: 'RIGHT', gap: 0 }))}</hp:subList></hp:header></hp:ctrl>`
      : '';
    const controls = `<hp:run charPrIDRef="0">${serialize(secPr)}${columnsXml}${runningHeader}</hp:run>${pageNumber}`;
    const content = body.replace(/(<hp:p\b[^>]*>)/, `$1${controls}`);
    sections.push(`<?xml version="1.0" encoding="UTF-8"?><hs:sec ${ns}>${content}</hs:sec>`);
  }
  if (mode === 'questions' && doc.cover) {
    let body = paragraph(run(examTitle(doc, true), 2), paraStyle({ align: 'CENTER', gap: 20 }));
    body +=
      paragraph(run('제 2 교시', 11), paraStyle({ align: 'CENTER', gap: 10 })) +
      paragraph(run('수학 영역', 7), paraStyle({ align: 'CENTER', gap: 25 }));
    body += paragraph(
      run('성명 ____________________     수험 번호 ____________________'),
      paraStyle({ gap: 30 }),
    );
    body += paragraph(run('수험생 유의 사항', 3), paraStyle({ gap: 8 }));
    for (const line of [
      '문제지의 해당란에 성명과 수험 번호를 정확하게 쓰시오.',
      '각 문항의 배점은 문항 끝에 표시되어 있습니다.',
      ...(doc.grade === '3' ? ['공통과목과 자신이 선택한 과목의 문제를 풀어야 합니다.'] : []),
    ])
      body += paragraph(run('• ' + line));
    body += paragraph(
      run(doc.coverNote ?? '시험이 시작되기 전까지 문제지를 넘기지 마시오.'),
      paraStyle({ align: 'CENTER', gap: 10 }),
    );
    section(body, 1, false);
  }
  if (mode === 'answers')
    section(
      paragraph(run(examTitle(doc) + ' · 정답표', 2), paraStyle({ align: 'CENTER', gap: 10 })) +
        relevant.map((p) => paragraph(run(`${nums.get(p.id)}.  ${answer(p)}`))).join(''),
      1,
    );
  else {
    const groups =
      doc.grade === '3'
        ? [relevant.filter((p) => p.section === 'common'), relevant.filter((p) => p.section === 'elective')]
        : [relevant];
    for (let index = 0; index < groups.length; index++) {
      if (!groups[index].length) continue;
      if (index === 1 && mode === 'questions' && doc.interleaf && doc.interleaf !== 'none')
        section(
          doc.interleaf === 'blank'
            ? paragraph(run(''))
            : paragraph(run('수학 영역 · ' + doc.elective, 7), paraStyle({ align: 'CENTER' })),
          1,
          false,
        );
      // A one-column title strip followed by native newspaper columns.
      let body = paragraph(
        run(examTitle(doc) + (mode === 'explanations' ? ' · 해설' : ''), 2),
        paraStyle({ align: 'CENTER', gap: 5 }),
      );
      body += paragraph(
        run('수학 영역' + (index === 1 ? ` (${doc.elective})` : ''), 7),
        paraStyle({ align: 'CENTER', gap: 5 }),
      );
      body += paragraph(
        `<hp:run charPrIDRef="0"><hp:ctrl><hp:colPr id="" type="NEWSPAPER" layout="LEFT" colCount="2" sameSz="1" sameGap="${units(doc.columnGap)}"><hp:colLine type="SOLID" width="0.12 mm" color="#888888"/></hp:colPr></hp:ctrl></hp:run>`,
      );
      let previous = '';
      for (const p of groups[index]) {
        if (mode === 'questions' && previous !== p.type)
          body += paragraph(
            run(p.type === 'choice' ? '5지선다형' : '단답형', 5),
            paraStyle({ gap: 4, keep: true }),
          );
        previous = p.type;
        const content = mode === 'explanations' ? p.explanation : p.blocks;
        const inlineNumber = content[0]?.kind === 'text';
        if (!inlineNumber)
          body += paragraph(
            run(`${nums.get(p.id)}. `, 3) + run(`[${p.score}점]`),
            paraStyle({ keep: true }),
            p.breakBefore,
          );
        let fragment = await blocks(content, inlineNumber ? p : undefined);
        if (!p.allowSplit) fragment = keepTogether(fragment);
        if (inlineNumber && p.breakBefore !== 'auto')
          fragment = fragment.replace(
            'pageBreak="0" columnBreak="0"',
            `pageBreak="${p.breakBefore === 'page' ? 1 : 0}" columnBreak="${p.breakBefore === 'column' ? 1 : 0}"`,
          );
        body += fragment;
        if (mode === 'explanations') body += paragraph(run('정답 ' + answer(p)));
        const space = mode === 'explanations' ? 5 : p.space;
        if (space > 0) body += paragraph(run(''), paraStyle({ space }));
      }
      section(body, 1);
    }
  }
  header.documentElement.setAttribute('secCnt', String(sections.length));
  zip.file('Contents/header.xml', serialize(header));
  const manifest = tags(packageDoc, 'manifest')[0],
    spine = tags(packageDoc, 'spine')[0];
  for (const e of [...manifest.children]) if (e.getAttribute('id')?.startsWith('section')) e.remove();
  for (const e of [...spine.children]) if (e.getAttribute('idref')?.startsWith('section')) e.remove();
  const opf = manifest.namespaceURI!;
  sections.forEach((xml, i) => {
    const name = `Contents/section${i}.xml`;
    zip.file(name, xml);
    const item = packageDoc.createElementNS(opf, 'opf:item');
    item.setAttribute('id', `section${i}`);
    item.setAttribute('href', name);
    item.setAttribute('media-type', 'application/xml');
    manifest.append(item);
    const ref = packageDoc.createElementNS(opf, 'opf:itemref');
    ref.setAttribute('idref', `section${i}`);
    ref.setAttribute('linear', 'yes');
    spine.append(ref);
  });
  for (const asset of assets) {
    zip.file(asset.path, asset.bytes);
    const item = packageDoc.createElementNS(opf, 'opf:item');
    item.setAttribute('id', asset.id);
    item.setAttribute('href', asset.path);
    item.setAttribute('media-type', asset.mime);
    item.setAttribute('isEmbeded', '1');
    manifest.append(item);
  }
  const title = tags(packageDoc, 'title')[0];
  if (title) title.textContent = examTitle(doc);
  zip.file('Contents/content.hpf', serialize(packageDoc));
  zip.file('mimetype', 'application/hwp+zip', { compression: 'STORE' });
  return zip.generateAsync({ type: 'blob', mimeType: 'application/hwp+zip', compression: 'DEFLATE' });
}
export async function exportHwpx(
  doc: ExamDocument,
  mode: 'questions' | 'answers' | 'explanations' = 'questions',
) {
  download(
    await buildHwpx(doc, mode),
    doc.name.replace(/[<>:"/\\|?*]/g, '-') +
      (mode === 'questions' ? '' : mode === 'answers' ? '-정답' : '-해설') +
      '.hwpx',
  );
}
