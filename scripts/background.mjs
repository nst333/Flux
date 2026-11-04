import sharp from 'sharp';
import { readdir, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
export async function prepareBackground() {
  const files = (await readdir(process.cwd())).filter((f) =>
    /^background\.(png|jpe?g|webp|avif|svg)$/i.test(f),
  );
  if (files.length !== 1) throw Error('프로젝트 루트에는 background 이미지가 정확히 하나 있어야 합니다.');
  const source = resolve(files[0]);
  const directory = resolve('public/background');
  await mkdir(directory, { recursive: true });
  const base = sharp(source, { limitInputPixels: 100_000_000 }).rotate().flatten({ background: '#151c24' });
  const normal = await base
    .clone()
    .resize({ width: 1440, height: 1000, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 65 })
    .toBuffer();
  const glass = await base
    .clone()
    .resize({ width: 720, height: 500, fit: 'inside', withoutEnlargement: true })
    .blur(14)
    .webp({ quality: 55 })
    .toBuffer();
  await Promise.all([
    writeFile(resolve(directory, 'scene.webp'), normal),
    writeFile(resolve(directory, 'glass.webp'), glass),
  ]);
  return { source: 'background' + extname(source), normal: normal.length, glass: glass.length };
}
if (process.argv[1] && resolve(process.argv[1]) === resolve('scripts/background.mjs'))
  console.log(await prepareBackground());
