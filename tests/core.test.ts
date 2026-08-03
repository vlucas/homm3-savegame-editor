import { describe, expect, it } from 'vitest';
import { getInt, writeInt32, indexOfPattern, heroNamePattern } from '../src/core/bytes';
import { encodeWin1251, decodeWin1251 } from '../src/core/encoding';
import { Skills, Spells, loadAllArtifacts } from '../src/core/constants';

describe('bytes', () => {
  it('reads int16 from 4-byte span like desktop GetInt', () => {
    const buf = new Uint8Array(4);
    writeInt32(buf, 0, 0x12345678);
    expect(getInt(buf, 0)).toBe(0x5678);
  });

  it('finds byte patterns', () => {
    const hay = new TextEncoder().encode('hello Christian world');
    const needle = new TextEncoder().encode('Christian');
    expect(indexOfPattern(hay, needle)).toBe(6);
  });

  it('builds 13-byte hero name patterns', () => {
    const p = heroNamePattern('Orrin', encodeWin1251);
    expect(p.length).toBe(13);
    expect(new TextDecoder().decode(p.subarray(0, 5))).toBe('Orrin');
  });
});

describe('encoding', () => {
  it('round-trips windows-1251 cyrillic', () => {
    const text = 'Адела';
    const enc = encodeWin1251(text);
    expect(decodeWin1251(enc)).toBe(text);
  });
});

describe('constants', () => {
  it('loads artifact registry', () => {
    loadAllArtifacts();
    expect(Skills.getByCode(0)).toBe('Pathfinding');
    expect(Spells.getByCode(15)).toBe('Magic Arrow');
  });
});

describe('gzip wasm', () => {
  it('compresses and decompresses raw save bytes', async () => {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const { dirname, join } = await import('node:path');
    const { loadGzipModuleFromBytes, gzipCompressWithModule, gzipDecompressWithModule } = await import('../src/wasm/gzip');
    const wasmPath = join(dirname(fileURLToPath(import.meta.url)), '../public/wasm/homm3-gzip.wasm');
    const mod = await loadGzipModuleFromBytes(readFileSync(wasmPath).buffer);
    const original = new Uint8Array(256);
    for (let i = 0; i < original.length; i++) original[i] = i & 0xff;
    original[0x08] = 42;
    original[0x0c] = 5;
    const compressed = await gzipCompressWithModule(mod, original);
    expect(compressed[0]).toBe(0x1f);
    expect(compressed[1]).toBe(0x8b);
    const restored = await gzipDecompressWithModule(mod, compressed);
    expect(restored).toEqual(original);
  });
});
