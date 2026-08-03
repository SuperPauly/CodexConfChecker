# Generic Config Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a separate generic JSON, YAML, and TOML workbench that validates local configuration files against uploaded JSON Schema files, provides configurable linting and detailed diagnostics, and adds 20 curated Rainglow editor palettes without regressing the Codex checker.

**Architecture:** Refactor the editor and diagnostics into shared modules while keeping Codex and generic workbench state isolated. Format adapters parse, locate, lint, and format documents; an Ajv worker validates JSON compatible values and resolves either internal references or an uploaded local schema bundle. The React shell composes the existing Codex workflow and the new generic workflow as accessible tabs.

**Tech Stack:** React 19, TypeScript 6, Vite 8, CodeMirror 6, Taplo WebAssembly, Ajv 8, ajv-formats, ajv-draft-04, jsonc-parser, yaml, Prettier standalone, Vitest, Testing Library.

## Global Constraints

- Preserve the existing Codex stable and alpha schema selector and 30 minute schema synchronization.
- Support JSON, YAML 1.2, and TOML configuration documents only. OpenAPI is excluded.
- Support JSON Schema Draft 4, 7, 2019-09, and 2020-12.
- Default a schema without `$schema` to Draft 2020-12 and report that choice as information.
- Never fetch remote `$ref` targets.
- Provide Internal only and Local schema bundle reference modes.
- Limit each configuration and primary schema file to 2 MiB.
- Limit a local schema bundle to 50 files and 10 MiB total.
- Provide exactly 20 Rainglow palettes, split into 10 light and 10 dark themes.
- Keep all configuration and schema content in the browser.
- Validate automatically only on Enter, pointer caret relocation, blur, upload, schema change, format, or explicit Validate.
- Follow red, green, refactor for every production behaviour.
- The local checkout has no writable Git metadata, so publish the completed verified tree as one guarded GitHub commit after all tasks pass.

---

## File structure

### Shared diagnostics and editor

- `src/diagnostics/types.ts`: normalized diagnostic, source range, severity, and filtering types.
- `src/diagnostics/location.ts`: offset, line, column, JSON pointer, and safe display helpers.
- `src/editor/ConfigEditor.tsx`: language aware CodeMirror editor and diagnostic line decorations.
- `src/editor/languages.ts`: CodeMirror JSON, YAML, and TOML extensions.
- `src/editor/rainglow.ts`: 20 adapted Rainglow palette definitions, CodeMirror theme generation, and persistence.

### Format adapters and linting

- `src/formats/types.ts`: format adapter and parsed document contracts.
- `src/formats/detect.ts`: extension and content based format detection.
- `src/formats/json.ts`: JSON parsing, pointer locations, and formatting.
- `src/formats/yaml.ts`: YAML parsing, path locations, and formatting.
- `src/formats/toml.ts`: Taplo parsing, path locations, and formatting.
- `src/lint/catalog.ts`: metadata and default configuration for every lint rule.
- `src/lint/engine.ts`: shared, JSON, YAML, and TOML rule execution.
- `src/lint/settings.ts`: settings validation, persistence, import, export, and reset.

### JSON Schema

- `src/generic-schema/types.ts`: schema file, reference mode, worker request, and worker response types.
- `src/generic-schema/references.ts`: `$ref` scanning and deterministic local identifiers.
- `src/generic-schema/diagnostics.ts`: Ajv and schema compilation diagnostic translation.
- `src/generic-schema/worker.ts`: Ajv draft selection, schema registration, and validation.
- `src/generic-schema/client.ts`: worker lifecycle, timeout, cancellation, and typed API.

### React workbenches

- `src/workbench/CodexWorkbench.tsx`: extracted current Codex workflow.
- `src/workbench/GenericWorkbench.tsx`: generic document and schema workflow.
- `src/workbench/ProblemsPanel.tsx`: shared filtering, grouping, expansion, and navigation.
- `src/workbench/LintSettingsDrawer.tsx`: searchable rule configuration UI.
- `src/workbench/FileControls.tsx`: reusable upload, copy, download, and clear controls.
- `src/App.tsx`: application heading, appearance control, tabs, and workbench composition.

## Task 1: Install browser validation dependencies and normalize diagnostics

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `src/diagnostics/types.ts`
- Create: `src/diagnostics/location.ts`
- Create: `src/diagnostics/location.test.ts`
- Modify: `src/taplo/types.ts`
- Modify: `src/taplo/service.ts`

**Interfaces:**
- Produces `Diagnostic`, `DiagnosticSeverity`, `DiagnosticSource`, `SourceRange`, `offsetPosition()`, `rangeFromOffsets()`, and `displayValue()`.
- `Diagnostic` contains `severity`, `source`, `ruleId`, `message`, `explanation`, offsets, line and column positions, plus optional suggestion and schema metadata.

- [ ] **Step 1: Add dependencies**

Run:

```sh
npm install ajv ajv-formats ajv-draft-04 jsonc-parser yaml prettier @codemirror/lang-json @codemirror/lang-yaml @codemirror/lint
```

- [ ] **Step 2: Write failing diagnostic location tests**

```ts
it("maps UTF-16 offsets to one based positions", () => {
  expect(rangeFromOffsets("name: Paul\nage: 42\n", 11, 14)).toMatchObject({
    from: 11,
    to: 14,
    line: 2,
    column: 1,
    endLine: 2,
    endColumn: 4,
  });
});

it("summarizes long values without vague object coercion", () => {
  expect(displayValue({ enabled: true })).toBe('{"enabled":true}');
});
```

- [ ] **Step 3: Verify the tests fail because the shared module does not exist**

Run: `npm run test:run -- src/diagnostics/location.test.ts`

- [ ] **Step 4: Implement shared types and helpers, then adapt Taplo diagnostics**

```ts
export type DiagnosticSeverity = "error" | "warning" | "info";
export type DiagnosticSource = "syntax" | "lint" | "schema" | "format" | "system";

export interface Diagnostic extends SourceRange {
  readonly severity: DiagnosticSeverity;
  readonly source: DiagnosticSource;
  readonly ruleId: string;
  readonly message: string;
  readonly explanation: string;
  readonly suggestion?: string;
  readonly dataPath?: string;
  readonly schemaPath?: string;
  readonly expected?: string;
  readonly actual?: string;
  readonly fileName?: string;
}
```

Every Taplo diagnostic must set `source`, `ruleId`, and `explanation` while preserving its exact source range.

- [ ] **Step 5: Run focused and existing tests**

Run: `npm run test:run -- src/diagnostics/location.test.ts src/taplo/service.test.ts src/editor/diagnostics.test.ts`

## Task 2: Add the 20 Rainglow palettes and language aware editor

**Files:**
- Create: `src/editor/rainglow.ts`
- Create: `src/editor/rainglow.test.ts`
- Create: `src/editor/languages.ts`
- Create: `src/editor/ConfigEditor.tsx`
- Modify: `src/editor/TomlEditor.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- Produces `RAINGLOW_THEMES`, `RainglowThemeId`, `editorThemeExtension()`, `loadEditorTheme()`, and `saveEditorTheme()`.
- `ConfigEditor` accepts `language: "json" | "yaml" | "toml"`, `themeId`, normalized diagnostics, source value, and existing validation callbacks.

- [ ] **Step 1: Write failing palette tests**

```ts
it("offers exactly ten light and ten dark Rainglow themes", () => {
  expect(RAINGLOW_THEMES).toHaveLength(20);
  expect(RAINGLOW_THEMES.filter((theme) => theme.variant === "light")).toHaveLength(10);
  expect(RAINGLOW_THEMES.filter((theme) => theme.variant === "dark")).toHaveLength(10);
});

it("restores only known persisted theme identifiers", () => {
  localStorage.setItem(EDITOR_THEME_KEY, "not-a-theme");
  expect(loadEditorTheme()).toBe(DEFAULT_EDITOR_THEME);
});
```

- [ ] **Step 2: Verify the palette tests fail**

Run: `npm run test:run -- src/editor/rainglow.test.ts`

- [ ] **Step 3: Add the adapted palette data and CodeMirror theme builder**

```ts
export interface RainglowTheme {
  readonly id: string;
  readonly name: string;
  readonly variant: "light" | "dark";
  readonly colours: {
    readonly background: string;
    readonly foreground: string;
    readonly comment: string;
    readonly property: string;
    readonly string: string;
    readonly number: string;
    readonly keyword: string;
    readonly accent: string;
  };
}
```

Use CodeMirror `EditorView.theme()` and `HighlightStyle.define()` rather than global token CSS so switching palettes updates every supported language consistently.

- [ ] **Step 4: Write a failing editor test for language and severity decorations**

Assert that JSON, YAML, and TOML editor labels change correctly and that error, warning, and information diagnostics receive separate line classes.

- [ ] **Step 5: Implement `ConfigEditor` and keep `TomlEditor` as a compatibility wrapper**

Use `@codemirror/lang-json`, `@codemirror/lang-yaml`, and the existing Taplo legacy TOML language. Preserve newline, pointer relocation, and blur validation triggers.

- [ ] **Step 6: Run editor and palette tests**

Run: `npm run test:run -- src/editor`

## Task 3: Parse and format JSON, YAML, and TOML

**Files:**
- Create: `src/formats/types.ts`
- Create: `src/formats/detect.ts`
- Create: `src/formats/detect.test.ts`
- Create: `src/formats/json.ts`
- Create: `src/formats/json.test.ts`
- Create: `src/formats/yaml.ts`
- Create: `src/formats/yaml.test.ts`
- Create: `src/formats/toml.ts`
- Create: `src/formats/toml.test.ts`
- Modify: `src/taplo/service.ts`

**Interfaces:**
- Produces `ConfigFormat`, `ParsedDocument`, `PathLocationMap`, `FormatAdapter`, `detectFormat()`, `JsonAdapter`, `YamlAdapter`, and `TomlAdapter`.
- `TomlEngine` gains `decode(toml: string): unknown` and formatter options.

- [ ] **Step 1: Write failing format detection tests**

```ts
expect(detectFormat("config.yaml", "name: Paul\n")).toEqual({ format: "yaml", confidence: "extension" });
expect(detectFormat(undefined, '{"name":"Paul"}')).toEqual({ format: "json", confidence: "content" });
expect(detectFormat(undefined, 'name = "Paul"')).toEqual({ format: "toml", confidence: "content" });
expect(detectFormat(undefined, "name: Paul").format).toBe("yaml");
```

- [ ] **Step 2: Verify format tests fail**

Run: `npm run test:run -- src/formats/detect.test.ts`

- [ ] **Step 3: Implement deterministic extension and conservative content detection**

Return `ambiguous: true` when content cannot be distinguished, allowing the UI to request an explicit format without guessing silently.

- [ ] **Step 4: Write failing adapter tests**

Cover syntax error ranges, duplicate keys, parsed values, JSON pointer or equivalent path locations, formatting, and refusing to format malformed documents.

- [ ] **Step 5: Verify each adapter test fails for the intended missing behaviour**

Run: `npm run test:run -- src/formats`

- [ ] **Step 6: Implement the adapters**

```ts
export interface ParsedDocument {
  readonly value?: unknown;
  readonly diagnostics: readonly Diagnostic[];
  readonly locations: ReadonlyMap<string, SourceRange>;
}

export interface FormatAdapter {
  readonly format: ConfigFormat;
  parse(source: string): ParsedDocument;
  formatSource(source: string, options: FormatOptions): Promise<string>;
}
```

Use `jsonc-parser` with comments and trailing commas disallowed, `yaml.parseDocument()` with `LineCounter`, strict YAML 1.2, and unique key diagnostics, and Taplo decode and format for TOML.

- [ ] **Step 7: Run all format tests**

Run: `npm run test:run -- src/formats src/taplo`

## Task 4: Build the configurable lint engine

**Files:**
- Create: `src/lint/catalog.ts`
- Create: `src/lint/catalog.test.ts`
- Create: `src/lint/engine.ts`
- Create: `src/lint/engine.test.ts`
- Create: `src/lint/settings.ts`
- Create: `src/lint/settings.test.ts`

**Interfaces:**
- Produces `LintRuleId`, `LintRuleDefinition`, `LintRuleSetting`, `LintSettings`, `DEFAULT_LINT_SETTINGS`, `lintDocument()`, `parseLintSettings()`, `loadLintSettings()`, `saveLintSettings()`, and `exportLintSettings()`.

- [ ] **Step 1: Write failing catalog completeness tests**

Assert that every rule ID is unique, every rule has a description, rationale, bad example, corrected example, supported formats, default severity, and validated option schema.

- [ ] **Step 2: Verify catalog tests fail**

Run: `npm run test:run -- src/lint/catalog.test.ts`

- [ ] **Step 3: Implement the catalog for every shared, JSON, YAML, and TOML rule from the specification**

```ts
export interface LintRuleDefinition {
  readonly id: LintRuleId;
  readonly name: string;
  readonly description: string;
  readonly rationale: string;
  readonly formats: readonly ConfigFormat[];
  readonly defaultSeverity: DiagnosticSeverity | "off";
  readonly badExample: string;
  readonly goodExample: string;
  readonly options: readonly LintOptionDefinition[];
}
```

- [ ] **Step 4: Write table driven failing rule tests**

For every rule, include one passing source, one failing source, the expected rule ID, severity, exact line, exact column, explanation, and suggested correction. Include option changes such as 80 versus 120 character line limits, two versus four space indentation, quote policies, truthy values, key naming patterns, and empty collection policies.

- [ ] **Step 5: Verify rule tests fail**

Run: `npm run test:run -- src/lint/engine.test.ts`

- [ ] **Step 6: Implement rule execution with source ranges from parsed documents**

Rules that cannot prove a reliable source range must report the containing line instead of offset zero. Syntax diagnostics suppress lint rules that depend on a valid syntax tree, while safe text rules still run.

- [ ] **Step 7: Write and verify failing settings tests**

Cover persistence, unknown rule rejection, invalid option rejection, import rollback, export round trip, and reset.

- [ ] **Step 8: Implement settings validation and persistence, then run lint tests**

Run: `npm run test:run -- src/lint`

## Task 5: Validate with uploaded JSON Schema and local references

**Files:**
- Create: `src/generic-schema/types.ts`
- Create: `src/generic-schema/references.ts`
- Create: `src/generic-schema/references.test.ts`
- Create: `src/generic-schema/diagnostics.ts`
- Create: `src/generic-schema/diagnostics.test.ts`
- Create: `src/generic-schema/worker.ts`
- Create: `src/generic-schema/worker.test.ts`
- Create: `src/generic-schema/client.ts`
- Create: `src/generic-schema/client.test.ts`

**Interfaces:**
- Produces `ReferenceMode`, `LocalSchemaFile`, `SchemaValidationRequest`, `SchemaValidationResponse`, `scanReferences()`, `validateSchemaRequest()`, `translateAjvError()`, and `SchemaWorkerClient.validate()`.

- [ ] **Step 1: Write failing reference policy tests**

```ts
expect(scanReferences({ $ref: "#/$defs/port" }, "internal")).toEqual([]);
expect(scanReferences({ $ref: "server.schema.json" }, "internal")[0]?.ruleId).toBe("schema/ref-external-blocked");
expect(resolveLocalReference("server.schema.json", bundle).fileName).toBe("server.schema.json");
```

- [ ] **Step 2: Verify reference tests fail**

Run: `npm run test:run -- src/generic-schema/references.test.ts`

- [ ] **Step 3: Implement reference scanning and local identity registration**

Register each dependency by declared `$id`, normalized filename, and `local:///filename`. Reject duplicate identifiers with a diagnostic naming both conflicting files.

- [ ] **Step 4: Write failing Ajv diagnostic translation tests**

Cover `required`, `additionalProperties`, `type`, `enum`, `format`, `minimum`, `maximum`, `minLength`, `pattern`, `oneOf`, unresolved reference, invalid schema, unsupported draft, and missing draft information.

```ts
expect(translateAjvError(requiredError, context).message).toBe(
  "Missing required property `port` at `/server`.",
);
expect(translateAjvError(requiredError, context)).toMatchObject({
  ruleId: "schema/required",
  expected: "property `port`",
  suggestion: "Add `port` to `/server` using the type required by the schema.",
});
```

- [ ] **Step 5: Verify diagnostic tests fail, then implement explicit translations**

Every translation must use the configuration location map to highlight the property, parent object, or nearest available path.

- [ ] **Step 6: Write failing draft and bundle validation tests**

Test Draft 4, 7, 2019-09, and 2020-12; a missing `$schema`; an unsupported draft; internal references; relative local references; `$id` references; missing dependencies; schema errors; and format validation through `ajv-formats`.

- [ ] **Step 7: Implement Ajv worker validation**

Select the correct Ajv class from the normalized `$schema` URI. Set `allErrors: true`, `strict: true`, `verbose: true`, and `validateFormats: true`. Validate schemas before compiling data validators. Do not install a remote `loadSchema` handler.

- [ ] **Step 8: Write failing timeout and stale result tests, then implement the worker client**

The client terminates and recreates the worker after 3000 ms, rejects the timed out request with `system/validation-timeout`, and ignores responses whose request ID is not current.

- [ ] **Step 9: Run schema tests**

Run: `npm run test:run -- src/generic-schema`

## Task 6: Build shared Problems and lint settings interfaces

**Files:**
- Create: `src/workbench/ProblemsPanel.tsx`
- Create: `src/workbench/ProblemsPanel.test.tsx`
- Create: `src/workbench/LintSettingsDrawer.tsx`
- Create: `src/workbench/LintSettingsDrawer.test.tsx`
- Create: `src/workbench/FileControls.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- `ProblemsPanel` accepts source text, diagnostics, filter state, grouping mode, and `onVisit(diagnostic)`.
- `LintSettingsDrawer` accepts current settings and emits only settings that pass `parseLintSettings()`.

- [ ] **Step 1: Write failing Problems panel tests**

Assert concise messages, severity and source filters, group modes, expanded explanation and suggestion, expected and actual values, data and schema paths, rule ID, filename, and editor navigation callback.

- [ ] **Step 2: Verify Problems tests fail**

Run: `npm run test:run -- src/workbench/ProblemsPanel.test.tsx`

- [ ] **Step 3: Implement the accessible Problems panel**

Use native buttons, selects, and `details` elements. Keep error meaning in text and icons, not colour alone.

- [ ] **Step 4: Write failing lint drawer tests**

Assert searchable rules, severity changes, typed option controls, invalid option errors, reset, JSON import rollback, and JSON export download.

- [ ] **Step 5: Implement the drawer and reusable file controls**

Only call `onChange` with a completely valid `LintSettings` object. Keep draft option text local until it validates.

- [ ] **Step 6: Run component tests**

Run: `npm run test:run -- src/workbench/ProblemsPanel.test.tsx src/workbench/LintSettingsDrawer.test.tsx`

## Task 7: Build the Generic Config workbench

**Files:**
- Create: `src/workbench/GenericWorkbench.tsx`
- Create: `src/workbench/GenericWorkbench.test.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- `GenericWorkbench` accepts initialized Taplo and schema worker engines, owns generic document and schema state, and composes shared editor, controls, lint drawer, and Problems panel.

- [ ] **Step 1: Write failing generic workflow tests**

Cover:

- auto detecting uploaded JSON, YAML, and TOML;
- requesting a format choice for ambiguous pasted content;
- rejecting unsupported and oversized files;
- primary schema upload and display;
- internal only reference rejection;
- local bundle upload, limits, and identifiers;
- syntax diagnostics before lint and schema diagnostics;
- explicit and automatic validation triggers;
- stale validation suppression;
- format, undo compatible editor replacement, copy, format aware download, and clear;
- Rainglow theme persistence;
- lint settings persistence and diagnostics severity changes.

- [ ] **Step 2: Verify workflow tests fail**

Run: `npm run test:run -- src/workbench/GenericWorkbench.test.tsx`

- [ ] **Step 3: Implement the validation pipeline**

```ts
const parsed = adapter.parse(source);
const lintDiagnostics = lintDocument(source, parsed, format, lintSettings);
const schemaDiagnostics = parsed.value === undefined || hasSyntaxErrors(parsed)
  ? []
  : await schemaClient.validate({ value: parsed.value, schema, dependencies, referenceMode });
const diagnostics = sortDiagnostics([
  ...parsed.diagnostics,
  ...lintDiagnostics,
  ...schemaDiagnostics,
]);
```

Map schema paths to source ranges on the main thread before rendering. Keep status counts separated into errors, warnings, and information.

- [ ] **Step 4: Implement formatting and uploads with exact limits**

Formatting must stop on syntax errors, update through a CodeMirror transaction so Undo restores the previous document, and immediately validate the result.

- [ ] **Step 5: Run generic workflow tests**

Run: `npm run test:run -- src/workbench/GenericWorkbench.test.tsx`

## Task 8: Extract Codex workbench and compose application tabs

**Files:**
- Create: `src/workbench/CodexWorkbench.tsx`
- Create: `src/workbench/CodexWorkbench.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- `CodexWorkbench` accepts the existing `TomlEngine` and `SchemaManifest`.
- `App` owns the selected application tab and shared application appearance only.

- [ ] **Step 1: Move existing Codex tests to a dedicated test and add failing tab state tests**

Assert Codex remains selected initially, stable and alpha still validate, each tab preserves its document while switching, and tab keyboard navigation follows the ARIA tab pattern.

- [ ] **Step 2: Verify new composition tests fail before extraction**

Run: `npm run test:run -- src/App.test.tsx src/workbench/CodexWorkbench.test.tsx`

- [ ] **Step 3: Extract Codex without changing its behaviour and compose both tabs**

Use `role="tablist"`, `role="tab"`, `aria-selected`, `aria-controls`, `role="tabpanel"`, and roving keyboard focus. Keep both workbench components mounted but hidden so editor and schema state survive tab changes.

- [ ] **Step 4: Run App, Codex, and Generic tests**

Run: `npm run test:run -- src/App.test.tsx src/workbench`

## Task 9: Responsive styling, attribution, full verification, and publication

**Files:**
- Modify: `src/styles.css`
- Modify: `README.md`
- Create: `THIRD_PARTY_NOTICES.md`
- Modify: `.github/workflows/pages.yml` only if new build requirements demand it
- Modify: relevant workflow tests only if the workflow changes

**Interfaces:**
- No new runtime interfaces. This task verifies the complete product and records third party attribution.

- [ ] **Step 1: Add failing responsive and accessibility assertions**

Test accessible names, controls, live regions, tab relationships, mobile control stacking classes, and absence of invalid nested interactive elements.

- [ ] **Step 2: Implement responsive styles**

At 760 CSS pixels and below, stack schema controls, preserve 44 pixel touch targets, keep the editor and problems panel within the viewport, and prevent page level horizontal overflow down to 320 CSS pixels.

- [ ] **Step 3: Add Rainglow attribution and update user documentation**

Document all formats, schema drafts, reference modes, limits, lint settings import and export, local only privacy, theme origin, and development commands. Copy the Rainglow MIT notice into `THIRD_PARTY_NOTICES.md`.

- [ ] **Step 4: Run the complete verification suite**

Run:

```sh
npm run check
npm run build
```

Expected: lint passes, TypeScript passes, every Vitest and Node workflow test passes, and Vite produces `dist` successfully.

- [ ] **Step 5: Run live browser QA before publishing**

Verify both workbenches at desktop and 390 by 844 mobile viewport sizes. Exercise JSON, YAML, and TOML validation, local reference modes, lint settings, formatting, theme switching, error navigation, System, Light, and Dark appearance, and confirm no application origin console errors or horizontal page overflow.

- [ ] **Step 6: Publish one guarded GitHub commit**

Fetch the current remote `main` SHA, create blobs and a tree for every changed file, create a commit with message `feat: add generic config workbench`, and update `main` without force only if the remote head still matches the guarded parent.

- [ ] **Step 7: Verify GitHub Pages deployment**

Confirm the Pages workflow attached to the published commit succeeds, load the production URL, and repeat the core JSON Schema validation and Rainglow theme checks on the deployed site.
