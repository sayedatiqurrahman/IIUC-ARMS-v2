// Generates the site favicon set from the source logo and writes them to public/.
// Run after changing public/arms-logo-icon.png:  node scripts/generate-favicons.js
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const SRC = path.join(__dirname, '..', 'public', 'arms-logo-icon.png');
const OUT = path.join(__dirname, '..', 'public');

const SIZES = [16, 32, 48, 64, 128, 144, 152, 192, 512];

async function main() {
  if (!fs.existsSync(SRC)) throw new Error(`Missing source logo: ${SRC}`);

  // 1) Square PNG icons
  for (const s of SIZES) {
    await sharp(SRC).resize(s, s, { fit: 'cover' }).png().toFile(path.join(OUT, `icon-${s}.png`));
  }
  await sharp(SRC).resize(180, 180, { fit: 'cover' }).png().toFile(path.join(OUT, 'apple-touch-icon.png'));

  // 2) Multi-size favicon.ico (PNG-encoded entries — supported by all modern
  //    browsers/OSes, including Google's crawler).
  const entries = [];
  const buffers = {};
  for (const s of [16, 32, 48]) {
    const buf = await sharp(SRC).resize(s, s, { fit: 'cover' }).png().toBuffer();
    buffers[s] = buf;
    entries.push({ size: s, bytes: buf.length });
  }

  const count = entries.length;
  const headerSize = 6 + 16 * count;
  const ico = Buffer.alloc(headerSize);
  ico.writeUInt16LE(0, 0); // reserved
  ico.writeUInt16LE(1, 2); // type: icon
  ico.writeUInt16LE(count, 4);

  let offset = headerSize;
  entries.forEach((e, i) => {
    const p = 6 + i * 16;
    ico.writeUInt8(e.size === 256 ? 0 : e.size, p);       // width
    ico.writeUInt8(e.size === 256 ? 0 : e.size, p + 1);   // height
    ico.writeUInt8(0, p + 2);                             // colors
    ico.writeUInt8(0, p + 3);                             // reserved
    ico.writeUInt16LE(1, p + 4);                          // planes
    ico.writeUInt16LE(32, p + 6);                         // bitcount
    ico.writeUInt32LE(e.bytes, p + 8);                    // bytes in res
    ico.writeUInt32LE(offset, p + 12);                    // offset
    offset += e.bytes;
  });

  const body = Buffer.concat([...[[16], [32], [48]].map(([s]) => buffers[s])]);
  fs.writeFileSync(path.join(OUT, 'favicon.ico'), Buffer.concat([ico, body]));

  console.log('Generated public/icon-{16,32,48,64,128,192,512}.png, apple-touch-icon.png, favicon.ico');
}

main().catch(e => { console.error(e); process.exit(1); });