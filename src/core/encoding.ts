const CP1251: number[] = (() => {
  const table = new Array<number>(256).fill(-1);
  for (let i = 0; i < 128; i++) table[i] = i;
  const chars =
    'ЂЃ‚ѓ„…†‡€‰Љ‹ЊЌЋЏђ‘’“”•–—˜™љ›њќћџ ' +
    'ЎўЈ¤¥¦§Ё©Є«¬\u00AD®Ї°±Ііґµ¶·ё№є»јЅѕї' +
    'АБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ' +
    'абвгдежзийклмнопрстуфхцчшщъыьэюя';
  for (let i = 0; i < chars.length; i++) {
    table[0x80 + i] = chars.charCodeAt(i);
  }
  return table;
})();

const UNICODE_TO_CP1251 = new Map<number, number>();
for (let i = 0; i < CP1251.length; i++) {
  const cp = CP1251[i];
  if (cp >= 0) UNICODE_TO_CP1251.set(cp, i);
}

export function decodeWin1251(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) {
    const cp = CP1251[b] ?? b;
    out += String.fromCharCode(cp);
  }
  return out;
}

export function encodeWin1251(text: string): Uint8Array {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code < 128) {
      out[i] = code;
    } else {
      out[i] = UNICODE_TO_CP1251.get(code) ?? 0x3f;
    }
  }
  return out;
}

export function decodeSaveString(bytes: Uint8Array, offset: number, lang: string): string {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const len = view.getInt16(offset, true);
  if (len <= 0) return '';
  const slice = bytes.subarray(offset + 2, offset + 2 + len);
  return lang === 'ru' ? decodeWin1251(slice) : new TextDecoder('ascii').decode(slice);
}
