/**
 * Small, dependency-free generators for seed media: PNG pictures (avatars,
 * "photos"), a WAV voice note and a one-page PDF. Everything is generated in
 * memory, so seeding never downloads anything.
 */
const zlib = require('zlib');

// ---------------------------------------------------------------------------
// PNG
// ---------------------------------------------------------------------------
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** pixel(x, y) -> [r, g, b] (0-255). Returns a PNG Buffer. */
function png(width, height, pixel) {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  let o = 0;
  for (let y = 0; y < height; y++) {
    raw[o++] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const [r, g, b] = pixel(x, y);
      raw[o++] = r;
      raw[o++] = g;
      raw[o++] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function hexRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));

/**
 * A profile picture: a two-tone gradient with a head-and-shoulders
 * silhouette, so lists and headers look like real people have photos.
 */
function avatarPng(colorA, colorB, size = 256) {
  const a = hexRgb(colorA);
  const b = hexRgb(colorB);
  const skin = mix([255, 255, 255], a, 0.25);
  const cx = size / 2;
  return png(size, size, (x, y) => {
    const head = (x - cx) ** 2 + (y - size * 0.4) ** 2 < (size * 0.2) ** 2;
    const shoulders = (x - cx) ** 2 / (size * 0.38) ** 2 + (y - size * 1.02) ** 2 / (size * 0.4) ** 2 < 1;
    if (head || shoulders) return mix(skin, [255, 255, 255], 0.15 + 0.2 * (y / size));
    return mix(a, b, (x + y) / (2 * size));
  });
}

/** A landscape "photo": sky gradient, sun, two mountain ridges. */
function photoPng(seed = 1, width = 800, height = 600) {
  const palettes = [
    ['#ff7e5f', '#feb47b', '#2c3e50', '#4b6584'],
    ['#4facfe', '#00f2fe', '#1e3c72', '#2a5298'],
    ['#f7971e', '#ffd200', '#3a1c71', '#d76d77'],
    ['#8e2de2', '#fbc2eb', '#16222a', '#3a6073'],
  ];
  const [s1, s2, m1, m2] = palettes[seed % palettes.length].map(hexRgb);
  const sunX = width * (0.3 + 0.1 * (seed % 4));
  const sunY = height * 0.38;
  return png(width, height, (x, y) => {
    const ridge1 = height * (0.62 + 0.08 * Math.sin(x / 70 + seed));
    const ridge2 = height * (0.74 + 0.05 * Math.sin(x / 45 + seed * 2));
    if (y > ridge2) return mix(m1, [0, 0, 0], 0.2 * ((y - ridge2) / (height - ridge2)));
    if (y > ridge1) return m2;
    if ((x - sunX) ** 2 + (y - sunY) ** 2 < 55 ** 2) return [255, 244, 214];
    return mix(s1, s2, y / height);
  });
}

// ---------------------------------------------------------------------------
// WAV voice note: 16 kHz mono, syllable-like tone bursts
// ---------------------------------------------------------------------------
function voiceWav(seconds = 4, seed = 1) {
  const rate = 16000;
  const n = Math.floor(seconds * rate);
  const data = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    const syllable = Math.max(0, Math.sin(Math.PI * ((t * (3 + (seed % 3))) % 1)));
    const pitch = 150 + 40 * Math.sin(t * 2.1 + seed);
    const v = syllable ** 2 * (0.5 * Math.sin(2 * Math.PI * pitch * t) + 0.25 * Math.sin(4 * Math.PI * pitch * t));
    data.writeInt16LE(Math.round(v * 12000), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

/** Seconds of audio in a PCM WAV buffer, or null. */
function wavDurationSeconds(buf) {
  try {
    if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') return null;
    let o = 12;
    let byteRate = null;
    while (o + 8 <= buf.length) {
      const id = buf.toString('ascii', o, o + 4);
      const size = buf.readUInt32LE(o + 4);
      if (id === 'fmt ') byteRate = buf.readUInt32LE(o + 16);
      if (id === 'data' && byteRate) return Math.round((size / byteRate) * 10) / 10;
      o += 8 + size + (size % 2);
    }
  } catch {
    // not a WAV we understand
  }
  return null;
}

// ---------------------------------------------------------------------------
// PDF: one page of text
// ---------------------------------------------------------------------------
function textPdf(lines) {
  const esc = (s) => s.replace(/[\\()]/g, (c) => `\\${c}`);
  const stream = ['BT', '/F1 14 Tf', '72 760 Td', '18 TL', ...lines.map((l) => `(${esc(l)}) '`), 'ET'].join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let out = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(out));
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  out += offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out);
}

module.exports = { png, avatarPng, photoPng, voiceWav, wavDurationSeconds, textPdf };
