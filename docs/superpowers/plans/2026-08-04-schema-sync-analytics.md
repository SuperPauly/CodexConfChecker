# Schema Freshness And Visitor Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Display independent stable and alpha schema synchronization times and add consent gated optional GA4 visitor metrics.

**Architecture:** The schema sync script owns channel timestamps and writes them to the manifest. React renders validated manifest metadata. A focused analytics module validates the public measurement ID, stores consent, and loads Google only after approval.

**Tech Stack:** Node.js, TypeScript, React, Vite, Vitest, Testing Library, GitHub Actions, Google Analytics 4

## Global Constraints

Configuration and schema contents remain entirely in the browser.

No analytics script loads before consent.

Stable and alpha timestamps change independently.

The feature must remain responsive and use active Rainglow theme tokens.

---

### Task 1: Per channel synchronization metadata

**Files:**

* Modify: `scripts/sync-schemas.test.mjs`
* Modify: `scripts/sync-schemas.mjs`
* Modify: `public/schemas/manifest.json`

**Interfaces:**

* Produces: `channels.stable.syncedAt` and `channels.alpha.syncedAt` as ISO 8601 strings

- [ ] Add failing script tests proving changed channels receive the current time and unchanged channels preserve their previous time.
- [ ] Run `node --test scripts/sync-schemas.test.mjs` and confirm the missing timestamps fail.
- [ ] Implement per channel change detection, timestamp preservation, and old manifest migration.
- [ ] Run the script tests and confirm they pass.

### Task 2: Manifest validation and selector display

**Files:**

* Modify: `src/types/schema.ts`
* Modify: `src/schema/manifest.ts`
* Modify: `src/schema/manifest.test.ts`
* Modify: `src/App.tsx`
* Modify: `src/App.test.tsx`
* Modify: `src/styles.css`

**Interfaces:**

* Consumes: `SchemaEntry.syncedAt`
* Produces: `formatSchemaSyncTime(iso: string): string`

- [ ] Add failing parser and component tests for valid timestamps and visible per channel dates.
- [ ] Run the focused Vitest files and confirm the expected failures.
- [ ] Add the type, strict ISO validation, local date formatting, semantic `time` markup, and responsive metadata styles.
- [ ] Run the focused tests and confirm they pass.

### Task 3: Optional consent gated GA4

**Files:**

* Create: `src/analytics/google.ts`
* Create: `src/analytics/google.test.ts`
* Create: `src/components/AnalyticsConsent.tsx`
* Create: `src/components/AnalyticsConsent.test.tsx`
* Modify: `src/App.tsx`
* Modify: `src/styles.css`
* Modify: `.github/workflows/pages.yml`
* Modify: `scripts/workflows.test.mjs`
* Modify: `README.md`

**Interfaces:**

* Produces: `normalizeMeasurementId(value)`, `loadGoogleAnalytics(id)`, and `AnalyticsConsent`

- [ ] Add failing tests for identifier validation, no loading before consent, approval loading, decline persistence, and workflow environment propagation.
- [ ] Run the focused tests and confirm they fail for missing behavior.
- [ ] Implement the analytics loader and consent component, mount it once at application level, and pass `vars.GA_MEASUREMENT_ID` to Vite.
- [ ] Document GA4 property creation, the repository variable, deployment, and privacy behavior.
- [ ] Run focused tests and confirm they pass.

### Task 4: Full verification and publication

**Files:**

* Verify all changed files

- [ ] Run `npm run check`.
- [ ] Run `npm run build`.
- [ ] Inspect the production site in the browser at desktop and mobile widths.
- [ ] Publish the complete change to `main` and verify the Pages workflow succeeds.

