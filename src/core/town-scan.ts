import { getUint16 } from './bytes';
import {
  TOWN_FIRST_MARKER_OFFSET,
  TOWN_INDEX_OFFSET,
  TOWN_LEAD_MARKER_OFFSET,
  TOWN_MARKER_OFFSET,
  TOWN_NAME_LEN_OFFSET,
  TOWN_NAME_OFFSET,
  TOWN_RECORD_SIZE,
  TOWN_SCAN_START,
  TOWN_MAX_NAME_LEN,
} from './town-constants';

export function readTownName(bytes: Uint8Array, recordStart: number): string {
  const len = getUint16(bytes, recordStart + TOWN_NAME_LEN_OFFSET);
  if (len <= 0 || len > TOWN_MAX_NAME_LEN) return '';
  const slice = bytes.subarray(recordStart + TOWN_NAME_OFFSET, recordStart + TOWN_NAME_OFFSET + len);
  return new TextDecoder('latin1').decode(slice);
}

function isPrintableTownName(bytes: Uint8Array, start: number, len: number): boolean {
  if (len <= 0 || len > TOWN_MAX_NAME_LEN) return false;
  if (start + len > bytes.length) return false;
  for (let i = 0; i < len; i++) {
    const b = bytes[start + i];
    if (b < 32 || b >= 127) return false;
  }
  return true;
}

/** HotA saves use ff ff / xx ff name-table markers at +0x4a instead of ff 81 02 / 80 b5. */
export function hasHotALeadMarker(bytes: Uint8Array, recordStart: number): boolean {
  const b4a = bytes[recordStart + 0x4a];
  const b4b = bytes[recordStart + 0x4b];
  const b4c = bytes[recordStart + 0x4c];
  const b4d = bytes[recordStart + 0x4d];

  // Classic Complete/SoD first-town marker — never HotA.
  if (b4a === 0xff && b4b === 0x81 && b4c === 0x02) return false;

  if (b4a === 0xff && b4b === 0xff) {
    return b4c <= 127 && (b4d === 0x00 || b4d === 0x7f);
  }
  // One-sided ff markers (Kergar ff bb, New Dolere b6 ff). A zero partner is
  // not a name-table entry — 1.8.1 saves have a 00 ff 00 00 hit that decodes as "!".
  if (b4a === 0xff || b4b === 0xff) {
    const other = b4a === 0xff ? b4b : b4a;
    if (other === 0x00) return false;
    return b4c <= 127 && (b4d === 0x00 || b4d === 0x7f || b4d === 0x7e);
  }
  return false;
}

function hasTableMarker(bytes: Uint8Array, recordStart: number): boolean {
  const markerA = bytes[recordStart + TOWN_MARKER_OFFSET] === 0x80
    && bytes[recordStart + TOWN_MARKER_OFFSET + 1] === 0xb5;
  const markerLead = bytes[recordStart + TOWN_LEAD_MARKER_OFFSET] === 0xff
    && bytes[recordStart + TOWN_LEAD_MARKER_OFFSET + 1] === 0x81
    && bytes[recordStart + TOWN_LEAD_MARKER_OFFSET + 2] === 0x02;
  const markerTail = bytes[recordStart + TOWN_FIRST_MARKER_OFFSET] === 0x81
    && bytes[recordStart + TOWN_FIRST_MARKER_OFFSET + 1] === 0x02;
  return markerA || markerLead || markerTail || hasHotALeadMarker(bytes, recordStart);
}

/** True when the town record uses HotA field packing (garrison/owner/buildings). */
export function isHotATownLayout(bytes: Uint8Array, recordStart: number): boolean {
  // Classic town-table members carry 80 b5 at +0x06 even when +0x4a has an 0xff byte.
  if (
    bytes[recordStart + TOWN_MARKER_OFFSET] === 0x80
    && bytes[recordStart + TOWN_MARKER_OFFSET + 1] === 0xb5
  ) {
    return false;
  }
  return hasHotALeadMarker(bytes, recordStart);
}

/** True when `recordStart` looks like a fixed-layout town struct in the save town table. */
export function isValidTownRecordAt(bytes: Uint8Array, recordStart: number): boolean {
  if (recordStart < TOWN_SCAN_START) return false;
  if (recordStart + TOWN_RECORD_SIZE > bytes.length) return false;
  if (!hasTableMarker(bytes, recordStart)) return false;

  const len = getUint16(bytes, recordStart + TOWN_NAME_LEN_OFFSET);
  if (!isPrintableTownName(bytes, recordStart + TOWN_NAME_OFFSET, len)) return false;

  if (bytes[recordStart + TOWN_MARKER_OFFSET] === 0x80) {
    const index = bytes[recordStart + TOWN_INDEX_OFFSET];
    if (index > 127) return false;
  }

  return readTownName(bytes, recordStart).length > 0;
}

function tryAddTownRecord(bytes: Uint8Array, recordStart: number, hits: Set<number>): void {
  if (recordStart >= TOWN_SCAN_START && isValidTownRecordAt(bytes, recordStart)) {
    hits.add(recordStart);
  }
}

/** Scan the save for town table records using layout fingerprints (not name catalogs). */
export function scanTownRecordStarts(bytes: Uint8Array): number[] {
  const hits = new Set<number>();
  const limit = bytes.length - TOWN_RECORD_SIZE;

  for (let i = TOWN_SCAN_START; i < limit; i++) {
    if (bytes[i] === 0x80 && bytes[i + 1] === 0xb5) {
      tryAddTownRecord(bytes, i - TOWN_MARKER_OFFSET, hits);
    }
    if (bytes[i] === 0xff && bytes[i + 1] === 0x81 && bytes[i + 2] === 0x02) {
      tryAddTownRecord(bytes, i - TOWN_LEAD_MARKER_OFFSET, hits);
    }
    if (bytes[i] === 0xff && bytes[i + 1] === 0xff) {
      tryAddTownRecord(bytes, i - TOWN_LEAD_MARKER_OFFSET, hits);
    }
    // HotA variants: ff xx at +0x4a (e.g. Kergar) or xx ff at +0x4b (e.g. New Dolere).
    if (bytes[i] === 0xff && bytes[i + 1] !== 0x81) {
      tryAddTownRecord(bytes, i - TOWN_LEAD_MARKER_OFFSET, hits);
    }
    if (bytes[i] === 0xff && bytes[i - 1] !== 0xff) {
      tryAddTownRecord(bytes, i - 0x4b, hits);
    }
  }

  return [...hits].sort((a, b) => a - b);
}
