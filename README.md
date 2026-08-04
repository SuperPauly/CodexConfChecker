# Codex Config Checker

A static, browser-only configuration validator, linter, and formatter. The default
Codex workspace checks `config.toml` against tracked Codex releases. The generic
JSON Schema Workbench checks JSON, YAML, or TOML against a schema you upload.

## Features

- Validates TOML with Taplo WebAssembly and the selected Codex release schema
- Tracks the latest stable and alpha Codex release schemas
- Validates JSON, YAML, and TOML against JSON Schema drafts 4, 7, 2019-09, and 2020-12
- Supports internal `$ref` values or an uploaded local schema bundle, without network fetching
- Runs configurable format-specific lint rules with Off, Info, Warning, and Error severities
- Explains every finding with its precise location, reason, suggested fix, actual value, expected value, data path, and schema path when available
- Highlights complete editor lines by severity and filters the Problems view by severity or source
- Formats JSON and YAML with Prettier and TOML with Taplo
- Includes 20 curated Rainglow editor colour themes, split evenly between dark and light presets
- Imports and exports lint settings as JSON
- Upload, paste, copy, download, format, validate, and clear controls
- Responsive layout with System, Light, and Dark themes
- Keeps configuration and schema text entirely inside the browser

## JSON Schema Workbench

1. Open the **JSON Schema Workbench** tab.
2. Paste a configuration or upload a `.json`, `.yaml`, `.yml`, or `.toml` file.
3. Upload a primary JSON Schema. For multi-file schemas, upload dependency files
   and select **Uploaded local bundle**.
4. Choose **Validate**. Ordinary typing does not trigger validation; Enter,
   pointer movement, and editor blur do.

Remote schema references are deliberately blocked. Local dependencies are
matched by filename or declared `$id`. Configuration files are limited to 2 MiB;
schema bundles are limited to 50 files and 10 MiB.

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

Each stable and alpha manifest entry records its own `syncedAt` timestamp. The
website shows this as the last time that exact release schema was successfully
copied from OpenAI and merged into this repository.

## Optional visitor analytics

The site supports Google Analytics 4 for visitor and page view metrics. Create a
GA4 property and web data stream, then copy its measurement ID, such as
`G-AB12CD34`.

In this GitHub repository, open **Settings**, **Secrets and variables**,
**Actions**, then **Variables**. Add a repository variable named
`GA_MEASUREMENT_ID` containing that measurement ID and manually run the Pages
workflow, or push a new commit.

The measurement ID is public configuration rather than a secret. When the
variable is absent or malformed, analytics is disabled. When it is configured,
the Google tag is not loaded until a visitor explicitly allows analytics. Only
standard page visit data is sent. Configuration text, uploaded filenames,
schemas, diagnostics, validation results, and formatting results remain local.

## Deployment

Every push to `main` runs linting, type checks, browser tests, workflow tests,
and the production build before deploying `dist` to GitHub Pages.

The production site is configured for:

<https://superpauly.github.io/CodexConfChecker/>
