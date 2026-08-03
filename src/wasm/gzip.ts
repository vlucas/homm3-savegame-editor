export interface Homm3GzipModule {
  memory: WebAssembly.Memory;
  homm3_gzip_decompress(inPtr: number, inLen: number, outLenPtr: number): number;
  homm3_gzip_compress(inPtr: number, inLen: number, outLenPtr: number): number;
  homm3_free(ptr: number, len: number): void;
  homm3_alloc(len: number): number;
}

let modulePromise: Promise<Homm3GzipModule> | null = null;

export function loadGzipModule(wasmUrl = `${import.meta.env.BASE_URL}wasm/homm3-gzip.wasm`): Promise<Homm3GzipModule> {
  if (!modulePromise) {
    modulePromise = (async () => {
      const resp = await fetch(wasmUrl);
      if (!resp.ok) throw new Error(`Failed to load WASM: ${resp.status}`);
      const bytes = await resp.arrayBuffer();
      const { instance } = await WebAssembly.instantiate(bytes, {});
      return instance.exports as unknown as Homm3GzipModule;
    })();
  }
  return modulePromise;
}

/** Test-only: instantiate from an ArrayBuffer (avoids fetch in Node). */
export async function loadGzipModuleFromBytes(bytes: ArrayBuffer): Promise<Homm3GzipModule> {
  const { instance } = await WebAssembly.instantiate(bytes, {});
  return instance.exports as unknown as Homm3GzipModule;
}

function copyToWasm(mod: Homm3GzipModule, data: Uint8Array): number {
  const ptr = mod.homm3_alloc(data.length);
  new Uint8Array(mod.memory.buffer, ptr, data.length).set(data);
  return ptr;
}

function copyFromWasm(mod: Homm3GzipModule, ptr: number, len: number): Uint8Array {
  return new Uint8Array(mod.memory.buffer, ptr, len).slice();
}

async function withModule<T>(fn: (mod: Homm3GzipModule) => Promise<T>): Promise<T> {
  return fn(await loadGzipModule());
}

export async function gzipDecompress(compressed: Uint8Array): Promise<Uint8Array> {
  return withModule(async (mod) => {
    const inPtr = copyToWasm(mod, compressed);
    const outLenPtr = mod.homm3_alloc(4);
    try {
      const outPtr = mod.homm3_gzip_decompress(inPtr, compressed.length, outLenPtr);
      if (outPtr === 0) throw new Error('GZip decompress failed');
      const view = new DataView(mod.memory.buffer);
      const outLen = view.getUint32(outLenPtr, true);
      const result = copyFromWasm(mod, outPtr, outLen);
      mod.homm3_free(outPtr, outLen);
      return result;
    } finally {
      mod.homm3_free(inPtr, compressed.length);
      mod.homm3_free(outLenPtr, 4);
    }
  });
}

export async function gzipCompress(uncompressed: Uint8Array): Promise<Uint8Array> {
  return withModule(async (mod) => {
    const inPtr = copyToWasm(mod, uncompressed);
    const outLenPtr = mod.homm3_alloc(4);
    try {
      const outPtr = mod.homm3_gzip_compress(inPtr, uncompressed.length, outLenPtr);
      if (outPtr === 0) throw new Error('GZip compress failed');
      const view = new DataView(mod.memory.buffer);
      const outLen = view.getUint32(outLenPtr, true);
      const result = copyFromWasm(mod, outPtr, outLen);
      mod.homm3_free(outPtr, outLen);
      return result;
    } finally {
      mod.homm3_free(inPtr, uncompressed.length);
      mod.homm3_free(outLenPtr, 4);
    }
  });
}

export async function gzipDecompressWithModule(mod: Homm3GzipModule, compressed: Uint8Array): Promise<Uint8Array> {
  const inPtr = copyToWasm(mod, compressed);
  const outLenPtr = mod.homm3_alloc(4);
  try {
    const outPtr = mod.homm3_gzip_decompress(inPtr, compressed.length, outLenPtr);
    if (outPtr === 0) throw new Error('GZip decompress failed');
    const view = new DataView(mod.memory.buffer);
    const outLen = view.getUint32(outLenPtr, true);
    const result = copyFromWasm(mod, outPtr, outLen);
    mod.homm3_free(outPtr, outLen);
    return result;
  } finally {
    mod.homm3_free(inPtr, compressed.length);
    mod.homm3_free(outLenPtr, 4);
  }
}

export async function gzipCompressWithModule(mod: Homm3GzipModule, uncompressed: Uint8Array): Promise<Uint8Array> {
  const inPtr = copyToWasm(mod, uncompressed);
  const outLenPtr = mod.homm3_alloc(4);
  try {
    const outPtr = mod.homm3_gzip_compress(inPtr, uncompressed.length, outLenPtr);
    if (outPtr === 0) throw new Error('GZip compress failed');
    const view = new DataView(mod.memory.buffer);
    const outLen = view.getUint32(outLenPtr, true);
    const result = copyFromWasm(mod, outPtr, outLen);
    mod.homm3_free(outPtr, outLen);
    return result;
  } finally {
    mod.homm3_free(inPtr, uncompressed.length);
    mod.homm3_free(outLenPtr, 4);
  }
}
