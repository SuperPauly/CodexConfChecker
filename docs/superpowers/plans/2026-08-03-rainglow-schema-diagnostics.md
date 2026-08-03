# Rainglow Application Theme and Schema Diagnostics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Theme the whole validator with the selected Rainglow preset, support Codex numeric JSON Schema formats, and present complete grouped diagnostics.

**Architecture:** Lift the Rainglow selection into shared application state, derive semantic CSS variables from its palette, and pass the selected theme to both workbenches. Extend the AJV setup with a focused format registry and annotation notices. Keep diagnostics as the existing `Diagnostic` model while adding optional source navigation and grouped presentation.

**Tech Stack:** React 19, TypeScript 6, AJV 8, CodeMirror 6, Vitest, Testing Library, Vite.

## Global Constraints

* Keep validation and formatting entirely in the browser.
* Do not fetch external schema references.
* Keep all 20 existing Rainglow presets.
* Do not truncate diagnostic messages or metadata.
* Add no runtime dependency.

---

### Task 1: Codex numeric schema formats

**Files:**
* Modify: `src/generic-schema/worker.test.ts`
* Modify: `src/generic-schema/worker.ts`

**Interfaces:**
* Produces: `registerSchemaFormats(ajv: AjvCore, schema: unknown): SchemaNotice[]`
* Preserves: `validateSchemaRequest(request: SchemaValidationRequest): SchemaValidationResponse`

- [ ] Add a failing test using the Codex shape `{ type: "integer", format: "uint" }` and assert that a valid nonnegative integer compiles and validates.
- [ ] Run `npm test -- src/generic-schema/worker.test.ts` and confirm `schema/schema-compile` is returned.
- [ ] Add table driven boundary tests for all seven Codex formats plus an unknown custom format notice that does not block a separate type error.
- [ ] Implement numeric format registration, recursive format discovery, and annotation notices.
- [ ] Run `npm test -- src/generic-schema/worker.test.ts` and confirm all worker tests pass.

### Task 2: Complete Rainglow application tokens

**Files:**
* Modify: `src/editor/rainglow.test.ts`
* Modify: `src/editor/rainglow.ts`
* Modify: `src/App.test.tsx`
* Modify: `src/App.tsx`
* Modify: `src/workbenches/GenericWorkbench.tsx`
* Modify: `src/styles.css`
* Remove obsolete behaviour from: `src/theme/theme.ts`, `src/theme/theme.test.ts`

**Interfaces:**
* Produces: `applyRainglowTheme(themeId: RainglowThemeId, root?: HTMLElement): RainglowTheme`
* Changes: `ValidatorWorkbench` and `GenericWorkbench` consume a shared `themeId` and `onThemeChange` callback.

- [ ] Add failing tests asserting that Azure and GitHub Light set page, surface, text, accent, and native colour scheme tokens.
- [ ] Run the Rainglow test and confirm the application token API is missing.
- [ ] Add a failing application test proving one theme selection updates both workbench selectors and the root tokens.
- [ ] Implement semantic token derivation and shared application theme state.
- [ ] Remove the contradictory System, Light, and Dark control and update labels from editor colours to website theme.
- [ ] Convert remaining hard coded UI colours to semantic variables.
- [ ] Run the Rainglow and application tests and confirm they pass.

### Task 3: Complete grouped diagnostics

**Files:**
* Modify: `src/components/ProblemsPanel.test.tsx`
* Modify: `src/components/ProblemsPanel.tsx`
* Modify: `src/diagnostics/types.ts`
* Modify: `src/generic-schema/diagnostics.test.ts`
* Modify: `src/generic-schema/diagnostics.ts`
* Modify: `src/styles.css`

**Interfaces:**
* Adds: `Diagnostic.hasSourceLocation?: boolean`
* Produces: grouped severity sections and `diagnosticReport(diagnostics: readonly Diagnostic[]): string`

- [ ] Add failing tests for default group expansion, Expand all, Collapse all, complete long metadata, optional location buttons, and copied report text.
- [ ] Run the component tests and confirm grouped controls and report output are absent.
- [ ] Add a failing translator test proving `schema-compile` has no source location and does not serialize the entire root configuration as Actual.
- [ ] Implement optional source locations and concise schema compiler diagnostics.
- [ ] Implement severity groups, complete content, group controls, and Copy report.
- [ ] Add responsive styling for grouped findings and long metadata.
- [ ] Run component and schema diagnostic tests and confirm they pass.

### Task 4: Integrated verification and deployment

**Files:**
* Modify only if a failing integrated test reveals a defect.

**Interfaces:**
* Consumes the public GitHub Pages deployment and the user supplied Codex schema and TOML configuration.

- [ ] Run `npm run check && npm run build` and require zero failures.
- [ ] Start or load the application and verify the target flow: JSON Schema Workbench, upload Codex schema, load TOML, validate, then inspect grouped results without a schema compiler error.
- [ ] Verify a dark Rainglow preset and a light preset across the whole desktop interface.
- [ ] Verify the mobile layout has no horizontal overflow or clipped diagnostic controls.
- [ ] Publish the exact changed files to `SuperPauly/CodexConfChecker` with one atomic commit.
- [ ] Wait for the Pages workflow and repeat the target flow on `https://superpauly.github.io/CodexConfChecker/`.
