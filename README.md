# HoMM3 Savegame Editor (Web)

Client-side Heroes of Might and Magic III savegame editor. Ported from [AlexSnowLeo/Heroes3Editor](https://github.com/AlexSnowLeo/Heroes3Editor).

All processing runs in your browser — save files are never uploaded to a server.

## Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
npm run preview
```

## WASM GZip module

The tolerant GZip decompressor is compiled to WebAssembly once and committed under `public/wasm/`. Rebuild with:

```bash
npm run build:wasm
```

Requires Rust with the `wasm32-unknown-unknown` target.

## Deploy (Cloudflare Pages)

- **Build command:** `npm run build`
- **Output directory:** `dist`
- **Node version:** 20 (see `.nvmrc`)

SPA fallback and WASM headers are configured via `public/_redirects` and `public/_headers`.

## Tests

```bash
npm test
```

## Supported saves

- `.CGM` (campaign) and `.GM1` / scenario saves
- Classic and Horn of the Abyss (HotA)
- English, Russian, Polish, French UI labels (from ported lang JSON)
