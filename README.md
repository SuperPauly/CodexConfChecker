# Codex Config Checker

A static, browser-only validator and formatter for Codex CLI `config.toml` files.

## Features

- Validates TOML with Taplo WebAssembly and the selected Codex release schema
- Tracks the latest stable and alpha Codex release schemas
- Highlights every invalid editor line and lists actionable diagnostics
- Formats valid TOML with Taplo
- Upload, paste, copy, download, and clear controls
- Responsive layout with System, Light, and Dark themes
- Keeps configuration text entirely inside the browser

## Local development

Requires Node.js 24 or newer.

```sh
npm ci
npm run dev
```

Run all checks:

```sh
npm run check
npm run build
```

## Schema updates

`scripts/sync-schemas.mjs` selects the newest Codex tags matching stable
`rust-vX.Y.Z` and alpha `rust-vX.Y.Z-alpha...`, then downloads each exact tagged
`codex-rs/core/config.schema.json` file. It writes only verified JSON and records
the release tag and SHA256 digest in `public/schemas/manifest.json`.

The `Sync Codex schemas` workflow runs this check every 30 minutes. Meaningful
schema or release metadata changes are committed to `main`, which starts the
separate tested GitHub Pages deployment workflow.

## Deployment

Every push to `main` runs linting, type checks, browser tests, workflow tests,
and the production build before deploying `dist` to GitHub Pages.

The production site is configured for:

<https://superpauly.github.io/CodexConfChecker/>
