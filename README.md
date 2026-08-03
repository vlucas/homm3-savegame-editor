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

## Deploy (GitHub Pages)

Pushes to `main` deploy via [GitHub Actions](.github/workflows/deploy.yml).

1. In the repository **Settings → Pages**, set **Source** to **GitHub Actions**.
2. Push to `main` (or run the workflow manually).

Project sites are served from `https://<user>.github.io/<repo>/`. User/organization sites (`<user>.github.io` repo) use `/` as the base path automatically.

Local production preview with the same base path as GitHub Pages:

```bash
VITE_BASE_PATH=/homm3-savegame-editor/ npm run build
npm run preview
```

Replace `homm3-savegame-editor` with your repository name if different.

## Tests

```bash
npm test
```

## Supported saves

- `.CGM` (campaign) and `.GM1` / scenario saves
- Classic and Horn of the Abyss (HotA)
- English, Russian, Polish, French UI labels (from ported lang JSON)
