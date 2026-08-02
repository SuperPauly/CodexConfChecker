# Codex Config Checker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and publish a browser only Codex CLI TOML validator with Taplo formatting, versioned stable and alpha schemas, scheduled schema synchronization, and GitHub Pages deployment.

**Architecture:** A React and Vite single page app wraps `@taplo/lib` behind a small validation service and renders diagnostics through CodeMirror 6 line decorations. Checked in schemas and a manifest are updated by a testable Node synchronization script executed every 30 minutes. A separate workflow verifies and deploys the static Vite build to GitHub Pages.

**Tech Stack:** React 19, TypeScript 5, Vite 7, CodeMirror 6, `@taplo/lib`, Vitest, Testing Library, Node 22, GitHub Actions, GitHub Pages.

## Global Constraints

- Uploaded and pasted TOML never leaves the browser.
- Ordinary character input must not trigger validation.
- Enter, pointer caret movement, blur, upload, schema change, formatting, and Validate must trigger validation.
- Stable and alpha schemas must come from their exact OpenAI Codex release tags.
- Schema synchronization runs every 30 minutes and commits only meaningful changes.
- Every push to `main` must test, build, and deploy the static site to GitHub Pages.
- Production asset URLs must work below `/CodexConfChecker/`.
- Formatting must use Taplo and must not force formatting of invalid TOML.
- The responsive interface must provide System, Light, and Dark themes and persist explicit selection locally.

---

### Task 1: Project foundation and schema manifest

**Files:**
- Create: `package.json`
- Create: `package-lock.json`
- Create: `tsconfig.json`
- Create: `tsconfig.app.json`
- Create: `tsconfig.node.json`
- Create: `vite.config.ts`
- Create: `vitest.setup.ts`
- Create: `index.html`
- Create: `.gitignore`
- Create: `src/main.tsx`
- Create: `src/types/schema.ts`
- Create: `src/schema/manifest.ts`
- Test: `src/schema/manifest.test.ts`
- Create: `public/schemas/manifest.json`

**Interfaces:**
- Produces: `SchemaChannel`, `SchemaEntry`, `SchemaManifest`, `parseSchemaManifest(value: unknown): SchemaManifest`, and `schemaAssetUrl(channel: SchemaChannel): string`.
- Consumes: JSON served from `public/schemas/manifest.json`.

- [ ] **Step 1: Scaffold only the test runner and write the failing manifest tests**

```ts
import { describe, expect, it } from "vitest";
import { parseSchemaManifest, schemaAssetUrl } from "./manifest";

describe("parseSchemaManifest", () => {
  it("accepts stable and alpha entries", () => {
    const manifest = parseSchemaManifest({
      generatedAt: "2026-08-02T12:00:00Z",
      channels: {
        stable: { version: "0.146.0", tag: "rust-v0.146.0", sha256: "a".repeat(64), sourceUrl: "https://github.com/openai/codex" },
        alpha: { version: "0.147.0-alpha.4", tag: "rust-v0.147.0-alpha.4", sha256: "b".repeat(64), sourceUrl: "https://github.com/openai/codex" },
      },
    });
    expect(manifest.channels.alpha.version).toBe("0.147.0-alpha.4");
  });

  it("rejects a manifest without both channels", () => {
    expect(() => parseSchemaManifest({ generatedAt: "x", channels: {} })).toThrow("stable");
  });

  it("builds a GitHub Pages safe schema URL", () => {
    expect(schemaAssetUrl("stable")).toBe(`${import.meta.env.BASE_URL}schemas/stable/config.schema.json`);
  });
});
```

- [ ] **Step 2: Run the test and verify the missing module failure**

Run: `npm test -- src/schema/manifest.test.ts`

Expected: FAIL because `src/schema/manifest.ts` does not exist.

- [ ] **Step 3: Implement strict manifest parsing and Vite base path configuration**

```ts
export type SchemaChannel = "stable" | "alpha";

export interface SchemaEntry {
  readonly version: string;
  readonly tag: string;
  readonly sha256: string;
  readonly sourceUrl: string;
}

export interface SchemaManifest {
  readonly generatedAt: string;
  readonly channels: Readonly<Record<SchemaChannel, SchemaEntry>>;
}
```

Set `base` to `/CodexConfChecker/` for production and `/` for development. Add scripts for `dev`, `build`, `test`, `test:run`, `typecheck`, `lint`, and `check`.

- [ ] **Step 4: Install locked dependencies and run the manifest tests**

Run: `npm install && npm test -- src/schema/manifest.test.ts`

Expected: PASS with no warnings.

- [ ] **Step 5: Commit the foundation**

```bash
git add package.json package-lock.json tsconfig*.json vite.config.ts vitest.setup.ts index.html .gitignore src/main.tsx src/types/schema.ts src/schema public/schemas/manifest.json
git commit -m "build: scaffold Codex config checker"
```

### Task 2: Release selection and schema synchronization

**Files:**
- Create: `scripts/release-selection.mjs`
- Create: `scripts/release-selection.test.mjs`
- Create: `scripts/sync-schemas.mjs`
- Create: `scripts/sync-schemas.test.mjs`
- Create: `scripts/fixtures/releases.json`
- Create: `public/schemas/stable/config.schema.json`
- Create: `public/schemas/alpha/config.schema.json`
- Create: `.github/workflows/sync-schemas.yml`
- Modify: `package.json`

**Interfaces:**
- Produces: `selectLatestChannels(releases): { stable: Release; alpha: Release }`, `normalizeVersion(tag): string`, `sha256(text): string`, and `synchronizeSchemas(options): Promise<SyncResult>`.
- Consumes: GitHub Releases API JSON and raw `config.schema.json` content from exact release tags.

- [ ] **Step 1: Write failing release filtering tests**

```js
import assert from "node:assert/strict";
import test from "node:test";
import { selectLatestChannels } from "./release-selection.mjs";

test("selects Codex stable and alpha releases and ignores rusty-v8", () => {
  const releases = [
    { tag_name: "rusty-v8-v150.4.0", published_at: "2026-08-02T12:00:00Z" },
    { tag_name: "rust-v0.146.0", published_at: "2026-08-01T12:00:00Z" },
    { tag_name: "rust-v0.147.0-alpha.4", published_at: "2026-08-02T11:00:00Z" },
    { tag_name: "rust-v0.147.0-alpha.3", published_at: "2026-08-02T10:00:00Z" },
  ];
  const result = selectLatestChannels(releases);
  assert.equal(result.stable.tag_name, "rust-v0.146.0");
  assert.equal(result.alpha.tag_name, "rust-v0.147.0-alpha.4");
});
```

- [ ] **Step 2: Run Node tests and verify the module failure**

Run: `node --test scripts/release-selection.test.mjs scripts/sync-schemas.test.mjs`

Expected: FAIL because synchronization modules do not exist.

- [ ] **Step 3: Implement release filtering, exact tag downloads, JSON validation, hashing, and atomic writes**

Use these exact patterns:

```js
const STABLE_TAG = /^rust-v\d+\.\d+\.\d+$/u;
const ALPHA_TAG = /^rust-v\d+\.\d+\.\d+-alpha(?:\.\d+)+$/u;
const SCHEMA_PATH = "codex-rs/core/config.schema.json";
```

Require successful HTTP status, parse every downloaded schema before writing, compute SHA256 from normalized final text, write temporary files first, then rename. Update manifest version metadata when a release changes even if the schema hash is unchanged. Return `changed: false` when tags and hashes match.

- [ ] **Step 4: Test unchanged, metadata only, schema changed, and malformed response cases**

Run: `node --test scripts/*.test.mjs`

Expected: PASS for every fixture backed test.

- [ ] **Step 5: Bootstrap both schema files from the newest matching release tags**

Run: `node scripts/sync-schemas.mjs`

Expected: `public/schemas/stable/config.schema.json`, `public/schemas/alpha/config.schema.json`, and `manifest.json` contain exact tag data and valid JSON.

- [ ] **Step 6: Add the 30 minute workflow**

```yaml
name: Sync Codex schemas
on:
  schedule:
    - cron: "*/30 * * * *"
  workflow_dispatch:
permissions:
  contents: write
concurrency:
  group: sync-codex-schemas
  cancel-in-progress: false
```

Checkout with full history, run `node scripts/sync-schemas.mjs`, run schema script tests, and commit only when `git diff --quiet` is false. Commit with `github-actions[bot]` identity and push to `main`.

- [ ] **Step 7: Commit synchronization support**

```bash
git add scripts public/schemas .github/workflows/sync-schemas.yml package.json
git commit -m "feat: synchronize stable and alpha Codex schemas"
```

### Task 3: Taplo browser service

**Files:**
- Create: `src/taplo/types.ts`
- Create: `src/taplo/service.ts`
- Test: `src/taplo/service.test.ts`

**Interfaces:**
- Produces: `TaploService.initialize(): Promise<TaploService>`, `validate(toml: string, schemaUrl: string): Promise<ValidationResult>`, and `format(toml: string): string`.
- Consumes: `@taplo/lib`, same origin schema URLs, and Taplo ranges.

- [ ] **Step 1: Write a failing integration test using a minimal real JSON schema**

```ts
it("reports an unknown top level key with a source range", async () => {
  const service = await TaploService.initialize(testEnvironment(schema));
  const result = await service.validate('unknown_key = true\n', "memory://schema.json");
  expect(result.diagnostics[0]).toMatchObject({ severity: "error" });
  expect(result.diagnostics[0]?.message).toContain("unknown_key");
});
```

- [ ] **Step 2: Run the Taplo test and verify it fails because the service is missing**

Run: `npm test -- src/taplo/service.test.ts`

Expected: FAIL due to missing `TaploService`.

- [ ] **Step 3: Implement one time WASM initialization and schema aware linting**

Provide a browser environment whose schema reads use `fetch` for same origin URLs. Convert Taplo errors into this stable interface:

```ts
export interface Diagnostic {
  readonly from: number;
  readonly to: number;
  readonly message: string;
  readonly severity: "error";
}

export interface ValidationResult {
  readonly diagnostics: readonly Diagnostic[];
}
```

Preserve Taplo's safe formatter behavior and normalize thrown values to `Error` objects.

- [ ] **Step 4: Run Taplo integration tests**

Run: `npm test -- src/taplo/service.test.ts`

Expected: PASS for valid TOML, syntax errors, duplicate keys, schema errors, and format refusal on invalid syntax.

- [ ] **Step 5: Commit the Taplo service**

```bash
git add src/taplo
git commit -m "feat: add browser Taplo validation service"
```

### Task 4: Diagnostic line mapping and validation scheduling

**Files:**
- Create: `src/editor/diagnostics.ts`
- Test: `src/editor/diagnostics.test.ts`
- Create: `src/editor/validation-trigger.ts`
- Test: `src/editor/validation-trigger.test.ts`

**Interfaces:**
- Produces: `diagnosticLines(state: EditorState, diagnostics: readonly Diagnostic[]): readonly DiagnosticLine[]` and `shouldValidate(transaction: Transaction): boolean`.
- Consumes: Taplo diagnostics and CodeMirror transactions.

- [ ] **Step 1: Write failing tests for full line expansion**

```ts
it("expands a diagnostic to every touched document line", () => {
  const state = EditorState.create({ doc: "model = 1\nunknown = true\n" });
  const lines = diagnosticLines(state, [{ from: 10, to: 24, message: "Unknown key", severity: "error" }]);
  expect(lines).toEqual([{ from: 10, to: 25, line: 2, message: "Unknown key" }]);
});
```

- [ ] **Step 2: Write failing trigger tests**

Prove plain typing returns false, `input.type` containing a newline returns true, `select.pointer` returns true, blur is handled by the editor view, and explicit actions bypass transaction inspection.

- [ ] **Step 3: Run tests and verify both modules are missing**

Run: `npm test -- src/editor/diagnostics.test.ts src/editor/validation-trigger.test.ts`

Expected: FAIL because both modules are missing.

- [ ] **Step 4: Implement line mapping and narrow trigger detection**

Clamp Taplo offsets to the document, expand zero length errors to their containing line, deduplicate multiple diagnostics on the same line for decoration purposes, and retain every message for the panel.

- [ ] **Step 5: Run editor utility tests**

Run: `npm test -- src/editor/diagnostics.test.ts src/editor/validation-trigger.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit editor utilities**

```bash
git add src/editor/diagnostics* src/editor/validation-trigger*
git commit -m "feat: map diagnostics and validation triggers"
```

### Task 5: Application state and interactions

**Files:**
- Create: `src/app/use-validator.ts`
- Test: `src/app/use-validator.test.tsx`
- Create: `src/app/file-actions.ts`
- Test: `src/app/file-actions.test.ts`
- Create: `src/editor/CodexEditor.tsx`
- Create: `src/components/Toolbar.tsx`
- Create: `src/components/SchemaSelector.tsx`
- Create: `src/components/DiagnosticsPanel.tsx`
- Create: `src/App.tsx`
- Test: `src/App.test.tsx`

**Interfaces:**
- Produces: `useValidator()` application model, accessible controls, and the complete functional page.
- Consumes: manifest parser, schema URL builder, Taplo service, diagnostic utilities, and CodeMirror.

- [ ] **Step 1: Write failing stale result and trigger behavior tests**

```ts
it("ignores an older validation result that resolves last", async () => {
  const first = deferred<ValidationResult>();
  const second = deferred<ValidationResult>();
  const { result } = renderHook(() => useValidator({ validate: vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise) }));
  act(() => result.current.validate("first"));
  act(() => result.current.validate("second"));
  second.resolve({ diagnostics: [] });
  first.resolve({ diagnostics: [{ from: 0, to: 1, message: "stale", severity: "error" }] });
  await waitFor(() => expect(result.current.diagnostics).toEqual([]));
});
```

- [ ] **Step 2: Write failing accessible workflow tests**

Test stable default selection, visible version labels, Upload, Validate, Format, Copy, Download, Clear, diagnostic navigation, ordinary typing suppression, Enter validation, pointer selection validation, and blur validation.

- [ ] **Step 3: Run application tests and verify missing component failures**

Run: `npm test -- src/app src/App.test.tsx`

Expected: FAIL because application modules do not exist.

- [ ] **Step 4: Implement minimal application behavior**

Use a monotonically increasing validation request ID. Keep editor text, selected channel, diagnostics, status, and service readiness explicit. Reject files larger than 2 MiB and files whose names do not end in `.toml`, while allowing pasted text of any reasonable editor length.

- [ ] **Step 5: Implement full width CodeMirror error decorations**

Use `Decoration.line({ class: "cm-errorLine" })` and a matching gutter marker. Keep diagnostic messages in accessible HTML outside the editor and move focus to the selected line when a diagnostic is activated.

- [ ] **Step 6: Run application tests**

Run: `npm test -- src/app src/App.test.tsx`

Expected: PASS without React act warnings.

- [ ] **Step 7: Commit the functional application**

```bash
git add src/app src/editor/CodexEditor.tsx src/components src/App.tsx src/App.test.tsx
git commit -m "feat: build Codex TOML validation interface"
```

### Task 6: Visual system and responsive implementation

**Files:**
- Create: `src/styles/tokens.css`
- Create: `src/styles/app.css`
- Create: `src/theme/theme.ts`
- Test: `src/theme/theme.test.ts`
- Create: `src/components/ThemeToggle.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/Toolbar.tsx`
- Modify: `src/components/SchemaSelector.tsx`
- Modify: `src/components/DiagnosticsPanel.tsx`
- Test: `src/App.test.tsx`

**Interfaces:**
- Produces: desktop and Android responsive layouts, System, Light, and Dark themes, accessible contrast, and reduced motion behavior.
- Consumes: accepted image concept and existing functional components.

- [ ] **Step 1: Generate and inspect the complete app screen concept**

Create a single desktop concept and one mobile state using the approved developer tool information architecture. Extract exact color, spacing, typography, radius, border, and control tokens before editing CSS.

- [ ] **Step 2: Add failing theme behavior tests**

```ts
it("uses the system theme until the user chooses an explicit theme", () => {
  expect(resolveTheme("system", true)).toBe("dark");
  expect(resolveTheme("system", false)).toBe("light");
  expect(resolveTheme("light", true)).toBe("light");
});
```

Test `localStorage` restoration, an invalid stored value falling back to System, media query changes while System is active, and the accessible three state theme control.

- [ ] **Step 3: Add failing semantic and accessibility assertions**

Assert one `main`, one `h1`, labelled schema fieldset, accessible status live region, keyboard reachable actions, and visible text labels rather than icon only primary controls.

- [ ] **Step 4: Implement the visual system and theme controller without decorative raster dependencies**

Match the accepted concept using code native CSS, Lucide icons only where they clarify controls, full width red error lines, restrained success green, and a single column breakpoint at 760 px. Define semantic color tokens for both themes. Apply the resolved theme through `data-theme` on the document root, listen to `prefers-color-scheme` only while System is active, persist explicit choice in `localStorage`, and initialize the theme in `index.html` before React loads to prevent a flash.

- [ ] **Step 5: Run component and theme tests plus browser responsive checks**

Run: `npm test -- src/App.test.tsx src/theme/theme.test.ts && npm run build`

Expected: PASS, no clipped controls at 360 px, 768 px, or 1440 px widths, and correct contrast in both themes.

- [ ] **Step 6: Commit responsive styling and themes**

```bash
git add index.html src/styles src/theme src/App.tsx src/components src/App.test.tsx
git commit -m "style: add responsive light and dark themes"
```

### Task 7: Continuous integration and GitHub Pages deployment

**Files:**
- Create: `.github/workflows/pages.yml`
- Create: `.github/dependabot.yml`
- Modify: `README.md`
- Test: production build and workflow syntax inspection

**Interfaces:**
- Produces: a verified `dist` Pages artifact for every push to `main` and manual deployment.
- Consumes: locked npm dependencies and Vite production output.

- [ ] **Step 1: Add the Pages workflow with official actions pinned to full commit SHAs**

```yaml
name: Test, build, and deploy Pages
on:
  push:
    branches: [main]
  workflow_dispatch:
permissions:
  contents: read
  pages: write
  id-token: write
concurrency:
  group: pages
  cancel-in-progress: true
```

The build job runs `npm ci`, `npm run check`, and `npm run build`, then uploads `dist`. The deploy job uses the protected `github-pages` environment and `actions/deploy-pages`.

- [ ] **Step 2: Add README architecture, privacy, local development, schema policy, and workflow documentation**

Document `npm ci`, `npm run dev`, `npm run check`, the stable and alpha meaning, scheduled updates, Pages deployment, and the pinned upstream source links.

- [ ] **Step 3: Verify workflows and production asset paths**

Run: `npm run check && npm run build && find dist -maxdepth 3 -type f | sort`

Expected: all checks pass and `dist/schemas/{stable,alpha}/config.schema.json` exists.

- [ ] **Step 4: Commit deployment support**

```bash
git add .github/workflows/pages.yml .github/dependabot.yml README.md
git commit -m "ci: deploy verified build to GitHub Pages"
```

### Task 8: Final browser verification and publication

**Files:**
- Modify only files required by failures discovered during verification

**Interfaces:**
- Produces: tested source on `main`, triggering Pages deployment.
- Consumes: all prior tasks.

- [ ] **Step 1: Run the complete clean verification suite**

Run: `npm ci && npm run check && npm run build && node --test scripts/*.test.mjs`

Expected: zero failures, zero type errors, zero lint errors, and a successful production build.

- [ ] **Step 2: Test real browser workflows**

Validate a known valid config, an unknown key, an invalid enum value, a duplicate key, and malformed TOML against both schema channels. Verify upload, selection triggers, Enter trigger, plain typing suppression, Format, Copy, Download, Clear, diagnostic navigation, System, Light, and Dark theme behavior, mobile layout, and reduced motion.

- [ ] **Step 3: Compare implementation and concept images**

Capture desktop and mobile screenshots, inspect them with `view_image`, compare directly with the generated concepts, and fix fidelity or accessibility issues before continuing.

- [ ] **Step 4: Review the final diff for secrets and generated debris**

Run: `git status --short && git diff --check && rg -n "(sk-[A-Za-z0-9]|ghp_[A-Za-z0-9]|TODO|TBD)" -g '!package-lock.json' .`

Expected: no credentials, placeholders, whitespace errors, or temporary QA files.

- [ ] **Step 5: Push the exact verified source state to `main`**

Create one final repository tree and commit from the verified local files, then update `refs/heads/main` only if its current head still matches the expected base commit. This push triggers both continuous deployment and future schema synchronization.
