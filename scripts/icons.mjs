import sharp from 'sharp';
import { fileURLToPath } from 'node:url';

const icon = new URL('../public/icon.svg', import.meta.url);
for (const [size, filename] of [[32, 'favicon-32.png'], [180, 'apple-touch-icon.png'], [192, 'icon-192.png'], [512, 'icon-512.png']]) {
  await sharp(fileURLToPath(icon)).resize(size, size).png().toFile(fileURLToPath(new URL(`../public/${filename}`, import.meta.url)));
}
console.log('Generated Flux icons (32, 180, 192, 512px).');
