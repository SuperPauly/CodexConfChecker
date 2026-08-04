# Unified Schema Registry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver one schema driven configuration page with a searchable version modal, retained Codex schema versions, and validated JSON, YAML, or TOML downloads.

**Architecture:** Replace the channel manifest with a program registry, extend the existing multi format workbench to consume tracked or custom schemas, and isolate cross format serialization in a tested converter. The scheduled synchronizer fetches stable from the official documentation URL and alpha from an exact release asset while retaining older version files.

**Tech Stack:** React 19, TypeScript, Vite, CodeMirror, Ajv, Taplo WASM, YAML, Vitest, Node test runner, GitHub Actions.

## Global Constraints

Configuration content remains local to the browser. Validation runs on explicit interaction triggers, not ordinary typing. The public schema updater runs every 30 minutes. Existing Rainglow themes, detailed diagnostics, formatting, lint settings, custom schemas, and local references remain available.

---

### Task 1: Program schema registry

**Files:** Modify `src/types/schema.ts`, `src/schema/manifest.ts`; modify their tests.

- [ ] Write tests that reject malformed registry entries and resolve version asset URLs.
- [ ] Run the focused tests and verify the missing registry API failure.
- [ ] Implement typed program and version parsing plus URL resolution.
- [ ] Run focused tests until green.

### Task 2: Version retaining schema synchronizer

**Files:** Modify `scripts/sync-schemas.mjs`, `scripts/sync-schemas.test.mjs`, `public/schemas/manifest.json`; create versioned schema assets through the synchronizer.

- [ ] Write script tests for the stable documentation URL, exact alpha release asset, archive retention, unchanged runs, and missing asset failure.
- [ ] Run the script tests and verify the source and registry assertions fail.
- [ ] Implement stable and alpha downloads, registry migration, immutable version paths, and atomic writes.
- [ ] Run all script tests until green.

### Task 3: Cross format export

**Files:** Modify `src/taplo/service.ts`; create `src/formats/serialize.ts` and `src/formats/serialize.test.ts`.

- [ ] Write literal output tests for JSON, YAML, and TOML serialization.
- [ ] Run the focused tests and verify the serializer is missing.
- [ ] Expose Taplo encode and implement the three serializers.
- [ ] Run focused tests until green.

### Task 4: Unified workbench

**Files:** Modify `src/workbenches/GenericWorkbench.tsx`, `src/workbenches/GenericWorkbench.test.tsx`, `src/App.tsx`, `src/App.test.tsx`.

- [ ] Write component tests for Program selection, the Select Version modal, latest channel shortcuts, release search and loading, custom schema locking, validation gated downloads, and removal of mode tabs.
- [ ] Run focused component tests and verify the new controls are absent.
- [ ] Add the accessible searchable version modal, tracked schema loading, custom schema locking, revision based validation state, and export menu.
- [ ] Make App render the unified workbench only and run focused tests until green.

### Task 5: Responsive visual integration and publication

**Files:** Modify `src/styles.css`, `README.md`; publish all changed files and verify GitHub Actions.

- [ ] Adjust the existing Rainglow layout for the unified four select header and download menu at desktop and mobile widths.
- [ ] Run `npm run check` and `npm run build`.
- [ ] Inspect the production app at desktop and mobile sizes and repair overflow, unreadable controls, or inert actions.
- [ ] Publish to `main`, confirm schema synchronization and Pages deployment workflows succeed, then verify the live site.
