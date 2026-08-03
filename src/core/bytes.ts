/** Match C# BinaryPrimitives.ReadInt16LittleEndian over 4 bytes (desktop quirk). */
export function getInt(bytes: Uint8Array, start: number): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return view.getInt16(start, true);
}

/** Read unsigned 16-bit little-endian integer (hero mana, etc.). */
export function getUint16(bytes: Uint8Array, start: number): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return view.getUint16(start, true);
}

/** Read unsigned 32-bit little-endian integer (hero experience, etc.). */
export function getUint32(bytes: Uint8Array, start: number): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return view.getUint32(start, true);
}

export function writeInt16(bytes: Uint8Array, start: number, value: number): void {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  view.setInt16(start, value, true);
}

export function writeInt32(bytes: Uint8Array, start: number, value: number): void {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  view.setInt32(start, value, true);
}

export function indexOfPattern(haystack: Uint8Array, needle: Uint8Array): number {
  if (needle.length === 0) return 0;
  outer: for (let i = 0; i <= haystack.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return i;
  }
  return -1;
}

export function startsWith(bytes: Uint8Array, pattern: Uint8Array): boolean {
  if (pattern.length > bytes.length) return false;
  for (let i = 0; i < pattern.length; i++) {
    if (bytes[i] !== pattern[i]) return false;
  }
  return true;
}

export function heroNamePattern(name: string, encodeRu: (s: string) => Uint8Array): Uint8Array {
  const clean = name.includes(' (') ? name.slice(0, name.indexOf(' (')) : name;
  const pattern = new Uint8Array(13);
  const isCyrillic = /\p{Script=Cyrillic}/u.test(clean);
  const encoded = isCyrillic ? encodeRu(clean) : new TextEncoder().encode(clean);
  pattern.set(encoded.subarray(0, Math.min(encoded.length, 13)));
  return pattern;
}
