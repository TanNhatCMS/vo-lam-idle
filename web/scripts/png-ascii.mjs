/* Giải PNG tối thiểu (zlib inflate + unfilter) → bản đồ ASCII độ sáng */
import { inflateSync } from 'zlib';
import fs from 'fs';

function decodePng(buf) {
  let off = 8, width = 0, height = 0, bitDepth = 0, colorType = 0;
  let idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off); off += 4;
    const type = buf.toString('ascii', off, off + 4); off += 4;
    if (type === 'IHDR') { width = buf.readUInt32BE(off); height = buf.readUInt32BE(off + 4); bitDepth = buf[off + 8]; colorType = buf[off + 9]; }
    else if (type === 'IDAT') idat.push(buf.subarray(off, off + len));
    off += len + 4;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const bpp = colorType === 6 ? 4 : colorType === 2 ? 3 : 1;
  const stride = width * bpp;
  const out = Buffer.alloc(height * stride);
  let p = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[p++];
    const row = raw.subarray(p, p + stride); p += stride;
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;
    const cur = out.subarray(y * stride, (y + 1) * stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0;
      const b = prev ? prev[x] : 0;
      const c = (x >= bpp && prev) ? prev[x - bpp] : 0;
      let v = row[x];
      if (filter === 1) v = (v + a) & 255;
      else if (filter === 2) v = (v + b) & 255;
      else if (filter === 3) v = (v + ((a + b) >> 1)) & 255;
      else if (filter === 4) {
        const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
        v = (v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255;
      }
      cur[x] = v;
    }
  }
  return { width, height, data: out, bpp };
}

const file = process.argv[2];
const cellW = 6, cellH = 12;
const { width, height, data, bpp } = decodePng(fs.readFileSync(file));
const chars = ' .:-=+*#%@';
for (let cy = 0; cy < height; cy += cellH) {
  let line = '';
  for (let cx = 0; cx < width; cx += cellW) {
    let sum = 0, n = 0;
    for (let y = cy; y < Math.min(cy + cellH, height); y += 2) {
      for (let x = cx; x < Math.min(cx + cellW, width); x += 2) {
        const i = (y * width + x) * bpp;
        sum += (data[i] + data[i + 1] + data[i + 2]) / 3; n++;
      }
    }
    const v = Math.round(sum / n / 25.6);
    line += chars[Math.min(9, v)];
  }
  console.log(line);
}
