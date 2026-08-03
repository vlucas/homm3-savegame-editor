#!/usr/bin/env bash
# Build homm3-gzip.wasm once via Emscripten Docker image.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="$ROOT/public/wasm"
mkdir -p "$OUT"

docker run --rm \
  -v "$ROOT/wasm/gzip:/src" \
  -v "$OUT:/out" \
  emscripten/emsdk:latest \
  emcc /src/homm3_gzip.c -O2 -s WASM=1 -s EXPORTED_FUNCTIONS='["_homm3_gzip_decompress","_homm3_gzip_compress","_homm3_free","_malloc","_free"]' \
    -s EXPORTED_RUNTIME_METHODS='[]' \
    -s ALLOW_MEMORY_GROWTH=1 \
    -s MODULARIZE=1 \
    -s EXPORT_NAME=createHomm3GzipModule \
    -o /out/homm3-gzip.js

echo "Built $OUT/homm3-gzip.wasm"
