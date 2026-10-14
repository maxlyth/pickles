import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, readdir, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = await readFile(path.join(root, 'pickles.svg'));
const widths = [256, 512, 1024, 2048];
const intrinsic = await sharp(source).metadata();
const manifest = {
  source: 'pickles.svg',
  sourceSha256: createHash('sha256').update(source).digest('hex'),
  transparent: true,
  sizes: [],
};

for (const format of ['png', 'webp']) {
  const directory = path.join(root, 'renders', format);
  await mkdir(directory, { recursive: true });
  for (const filename of await readdir(directory)) {
    const match = filename.match(/^pickles-(\d+)\.(png|webp)$/);
    if (match && match[2] === format && !widths.includes(Number(match[1]))) {
      await unlink(path.join(directory, filename));
    }
  }
}

for (const width of widths) {
  // Render the vector above the target resolution before downsampling.
  const density = Math.max(144, Math.ceil(144 * width / intrinsic.width));
  const bitmap = await sharp(source, { density })
    .resize({ width })
    .toColourspace('srgb')
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  for (const format of ['png', 'webp']) {
    const output = sharp(bitmap.data, { raw: bitmap.info });
    const encoded = format === 'png'
      ? output.png({ compressionLevel: 9 })
      : output.webp({ lossless: true, effort: 6 });
    // Sharp strips EXIF, XMP and other inherited metadata by default.
    await encoded.toFile(path.join(root, 'renders', format, `pickles-${width}.${format}`));
  }
  manifest.sizes.push({ width: bitmap.info.width, height: bitmap.info.height });
  console.log(`Rendered ${bitmap.info.width} × ${bitmap.info.height}: PNG and WebP`);
}

await writeFile(path.join(root, 'renders', 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
