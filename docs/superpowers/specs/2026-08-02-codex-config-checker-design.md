# Codex Config Checker Design

## Goal

Build a static, privacy preserving website that validates and formats Codex CLI `config.toml` files entirely in the browser. Validation must use versioned schemas taken from exact Codex release tags.

## Technology

- React with TypeScript and Vite
- CodeMirror 6 with TOML syntax highlighting
- `@taplo/lib` WebAssembly for TOML parsing, schema validation, and formatting
- Vitest and Testing Library
- GitHub Actions for continuous integration and scheduled schema synchronization

No backend, account, API key, or configuration upload is required.

## Editor workflow

The page contains one primary editor and a compact action bar with Upload, Validate, Format, Copy, Download, and Clear controls.

The editor does not validate after ordinary character input. Validation runs only after one of these events:

1. The user presses Enter or inserts a carriage return.
2. A pointer action moves the caret or selection.
3. The editor loses focus.
4. A TOML file is uploaded.
5. The selected schema channel changes.
6. Formatting completes.
7. The user presses Validate.

Validation requests are serialized so an older asynchronous result cannot overwrite a newer result.

## Validation presentation

Taplo diagnostics are converted into CodeMirror document ranges. Every line touched by an error receives a full width red background decoration. The gutter also shows an error marker.

A diagnostic panel lists each error with its line and column. Selecting an error moves the editor to the relevant line. Syntax, duplicate key, semantic, and schema errors use the same presentation. A valid document receives a clear success state.

## Formatting

Format calls Taplo in the browser. Taplo's default safe behavior is preserved: TOML containing syntax errors is not force formatted. On success, the formatted text replaces the editor contents, validation runs, and the operation remains undoable within CodeMirror history.

## Schema channels

The interface provides two radio choices:

- Stable, labelled with the exact stable Codex release version
- Alpha, labelled with the exact alpha Codex release version

The stable option is selected by default. Each option loads a checked in schema captured from its exact Codex release tag, not from a moving `main` branch snapshot.

The repository stores:

- `public/schemas/stable/config.schema.json`
- `public/schemas/alpha/config.schema.json`
- `public/schemas/manifest.json`

The manifest records channel, displayed version, upstream tag, upstream commit or schema blob identity when available, content SHA256, source URL, and synchronization time.

## Scheduled schema synchronization

A GitHub Actions workflow runs every 30 minutes and supports manual dispatch.

It queries the OpenAI Codex releases API and identifies:

- Stable: the newest tag matching `rust-vX.Y.Z`
- Alpha: the newest tag matching `rust-vX.Y.Z-alpha...`

This excludes unrelated releases such as Rust V8 artifacts. GitHub release timestamps determine the newest matching release, which also handles alpha hotfix versions safely.

For each channel, the workflow fetches `codex-rs/core/config.schema.json` from the exact release tag. It calculates a SHA256 digest and compares the tag and schema digest with the checked in manifest.

- If neither changed, the workflow exits without a commit.
- If a release changed but its schema did not, only version metadata changes.
- If the schema changed, the corresponding channel schema and metadata change.

When changes exist, the workflow commits them using the GitHub Actions bot and pushes to the default branch. It uses minimal `contents: write` permission, validates downloaded JSON before replacing repository files, and fails without modifying files if either upstream request is invalid.

## GitHub Pages deployment

A separate GitHub Pages workflow runs for every push to `main` and supports manual dispatch. It installs locked dependencies, runs linting, type checking, tests, and the production build before uploading only the generated `dist` directory as the Pages artifact.

Deployment uses GitHub's official Pages actions with `pages: write` and `id-token: write` permissions and a concurrency group that prevents overlapping deployments. Vite uses the `/CodexConfChecker/` base path in production so JavaScript, WebAssembly, and schema assets resolve correctly on the repository Pages URL.

Schema synchronization commits therefore trigger the Pages workflow automatically. A newly imported stable or alpha schema becomes available on the public website after the build and deployment checks pass.

## Privacy and security

- TOML contents never leave the browser.
- No analytics or remote validation service is included.
- Schemas are served from the same site and protected by repository history.
- The synchronization workflow pins third party actions to full commit SHAs.
- Workflow shell scripts use strict mode, validate tag formats, validate HTTP responses, and parse JSON with `jq`.
- GitHub Pages deploys only a tested static build and receives no TOML contents.
- Uploaded files are treated as text and never executed.

## Responsive design

Desktop uses a wide editor with the diagnostics panel alongside or directly beneath it depending on viewport width. Mobile uses a single column with large controls, horizontally scrollable schema choices when necessary, and an editor height suitable for Android browsers.

The visual style is a focused developer tool with complete light and dark themes, restrained green success color, red error lines, and strong accessible contrast. A visible theme control supports System, Light, and Dark. System follows `prefers-color-scheme`; an explicit choice is stored in `localStorage` and restored without a theme flash. Motion is limited to status transitions and respects reduced motion preferences.

## Testing

Unit and component tests cover:

- Validation trigger rules, including the absence of validation during ordinary typing
- Pointer caret movement, blur, and Enter behavior
- Taplo diagnostic to full line decoration mapping
- Stable and alpha schema selection
- Stale asynchronous validation result suppression
- File upload and rejection of unsuitable files
- Safe formatting success and syntax error failure
- Copy, clear, and download controls
- System, Light, and Dark theme selection and persistence
- Manifest parsing and schema loading failures

Workflow tests exercise release filtering, alpha hotfix ordering, unchanged schemas, metadata only updates, malformed upstream responses, and schema changes. Continuous integration runs formatting checks, linting, type checking, tests, and the production build.

## Acceptance criteria

1. An invalid key or value is reported against the selected release schema and every affected editor line has a full width red background.
2. Ordinary typing does not start validation.
3. Enter, pointer caret movement, blur, upload, schema change, formatting, and Validate do start validation.
4. Format uses Taplo and does not force format syntactically invalid TOML.
5. Stable and alpha radio options show their exact Codex versions.
6. The scheduled workflow checks both channels every 30 minutes and commits only meaningful schema or metadata changes.
7. Every push to `main`, including schema synchronization commits, triggers a tested GitHub Pages deployment.
8. The responsive interface supports System, Light, and Dark themes with persistent explicit selection.
9. The production site requires no backend and sends no TOML content away from the browser.
