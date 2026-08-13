// Copies the jsquash wasm codecs (mozjpeg for JPEG, squoosh png for PNG) into
// public/jsquash so they can be fetched at runtime via `locateFile` (avoids
// relying on the bundler to resolve `new URL(..., import.meta.url)` wasm refs).
const fs = require('fs');
const path = require('path');

const dest = path.join(__dirname, '..', 'public', 'jsquash');
fs.mkdirSync(dest, { recursive: true });

const sources = [
  ['@jsquash/jpeg/codec/enc/mozjpeg_enc.wasm', 'mozjpeg_enc.wasm'],
  ['@jsquash/jpeg/codec/dec/mozjpeg_dec.wasm', 'mozjpeg_dec.wasm'],
  ['@jsquash/png/codec/pkg/squoosh_png_bg.wasm', 'squoosh_png_bg.wasm'],
];

for (const [rel, name] of sources) {
  const src = path.join(__dirname, '..', 'node_modules', rel);
  if (!fs.existsSync(src)) {
    console.warn(`[copy-jsquash-wasm] missing ${src} — skipping`);
    continue;
  }
  fs.copyFileSync(src, path.join(dest, name));
  console.log(`[copy-jsquash-wasm] ${name}`);
}
