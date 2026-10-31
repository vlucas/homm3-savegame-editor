#!/usr/bin/env node
/**
 * Offline research helper for town record layout (not shipped to the browser).
 * Usage: node scripts/research-town-layout.mjs [save.gm1]
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const __dirname = dirname(fileURLToPath(import.meta.url));
const defaultSave = join(__dirname, '../tests/savedgames/HoMM3Complete-SingleScenario-Start.GM1');

function gunzipLenient(data) {
  const flg = data[3];
  let i = 10;
  if (flg & 4) {
    const xlen = data.readUInt16LE(i);
    i += 2 + xlen;
  }
  if (flg & 8) {
    while (data[i]) i += 1;
    i += 1;
  }
  if (flg & 16) {
    while (data[i]) i += 1;
    i += 1;
  }
  if (flg & 2) i += 2;
  return zlib.inflateRawSync(data.subarray(i, data.length - 8));
}

const savePath = process.argv[2] ?? defaultSave;
const save = gunzipLenient(readFileSync(savePath));

const markers = [];
for (let i = 0x10000; i < save.length - 0x183; i++) {
  if (save[i] === 0x80 && save[i + 1] === 0xb5) markers.push(i - 6);
  if (save[i] === 0xff && save[i + 1] === 0x81 && save[i + 2] === 0x02) markers.push(i - 0x4a);
  if (save[i] === 0xff && save[i + 1] === 0xff) markers.push(i - 0x4a);
  if (save[i] === 0xff && save[i + 1] !== 0x81) markers.push(i - 0x4a);
  if (save[i] === 0xff && save[i - 1] !== 0xff) markers.push(i - 0x4b);
}

const unique = [...new Set(markers)].sort((a, b) => a - b);
console.log(`Town record candidates in ${savePath}: ${unique.length}`);
for (const rs of unique) {
  const nlen = save.readUInt16LE(rs + 0x4e);
  const name = save.subarray(rs + 0x50, rs + 0x50 + nlen).toString('latin1');
  const meta = rs + 0x50 + nlen;
  const typeId = save.readUInt16LE(meta);
  const owner = save.readUInt16LE(meta + 2);
  console.log(`  0x${rs.toString(16)} ${name} type=${typeId} owner=${owner}`);
}
