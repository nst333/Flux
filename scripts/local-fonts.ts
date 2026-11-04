import { existsSync, readFileSync } from 'node:fs';
import type { Plugin } from 'vite';
const root = 'C:/Program Files (x86)/HNC/Office 2022/HOffice120/Shared/TTF/';
const files: Record<string, string> = {
  Batang: root + 'All/HBATANG.TTF',
  Dotum: root + 'All/HDOTUM.TTF',
  Headline: root + 'All/H2HDRM.TTF',
  Myeongjo: root + 'Hwp/HYMJRE.TTF',
  Equation: 'C:/Windows/Fonts/HYHWPEQ.TTF',
};
// Older Hangeul TTFs use an invalid U+FFFF sentinel. Repair only the cmap
// sentinel/checksums in memory for Chromium's OpenType sanitizer. Glyph data
// and installed files remain byte-for-byte unchanged.
function browserFont(path: string) {
  const b = readFileSync(path);
  const tables = new Map<string, { record: number; offset: number; length: number }>();
  for (let i = 0; i < b.readUInt16BE(4); i++) {
    const record = 12 + i * 16;
    tables.set(b.toString('ascii', record, record + 4), {
      record,
      offset: b.readUInt32BE(record + 8),
      length: b.readUInt32BE(record + 12),
    });
  }
  const cmap = tables.get('cmap');
  const head = tables.get('head');
  if (cmap && head) {
    for (let i = 0; i < b.readUInt16BE(cmap.offset + 2); i++) {
      const o = cmap.offset + b.readUInt32BE(cmap.offset + 8 + i * 8);
      if (b.readUInt16BE(o) !== 4) continue;
      const n = b.readUInt16BE(o + 6) / 2;
      const starts = o + 16 + n * 2,
        deltas = starts + n * 2,
        ranges = deltas + n * 2;
      for (let j = 0; j < n; j++)
        if (b.readUInt16BE(o + 14 + j * 2) === 65535 && b.readUInt16BE(starts + j * 2) === 65535) {
          b.writeUInt16BE(1, deltas + j * 2);
          b.writeUInt16BE(0, ranges + j * 2);
        }
    }
    const sum = (o: number, n: number) => {
      let value = 0;
      for (let i = 0; i < n; i += 4) {
        let word = 0;
        for (let j = 0; j < 4; j++) word = word * 256 + (i + j < n ? b[o + i + j] : 0);
        value = (value + word) >>> 0;
      }
      return value;
    };
    b.writeUInt32BE(0, head.offset + 8);
    for (const t of tables.values()) b.writeUInt32BE(sum(t.offset, t.length), t.record + 4);
    b.writeUInt32BE((0xb1b0afba - sum(0, b.length)) >>> 0, head.offset + 8);
  }
  return b;
}
export function localFonts(): Plugin {
  const install = (server: any) => {
    server.middlewares.use('/__exam_fonts', (req: any, res: any) => {
      const key = (req.url || '').split('?')[0].replace(/^\//, '');
      const path = files[key];
      if (!path || !existsSync(path)) {
        res.statusCode = 404;
        res.end();
        return;
      }
      res.setHeader('Content-Type', 'font/ttf');
      res.setHeader('Cache-Control', 'private, max-age=3600');
      res.end(browserFont(path));
    });
  };
  return {
    name: 'local-exam-fonts',
    configureServer(server) {
      install(server);
    },
    configurePreviewServer(server) {
      install(server);
    },
  };
}
