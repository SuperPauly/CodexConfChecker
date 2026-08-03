# Generic Config Workbench Design

## Goal

Extend Codex Config Checker into a local browser configuration workbench without weakening the existing Codex workflow. The site will keep Codex stable and alpha validation as its default tab and add a separate Generic Config tab for JSON, YAML, and TOML documents validated against an uploaded JSON Schema.

OpenAPI support is explicitly excluded.

## User experience

### Application tabs

The application has two top level tabs:

1. **Codex Config** retains the current stable and alpha release schema selector, Taplo validation, formatting, upload, copy, download, and automatic validation triggers.
2. **Generic Config** provides format selection, schema upload, local reference handling, lint configuration, validation, formatting, and detailed diagnostics.

Switching tabs preserves each tab's document and settings for the current browser session.

### Generic Config controls

The generic workbench includes:

- format selection: Auto, JSON, YAML, or TOML;
- configuration upload for `.json`, `.yaml`, `.yml`, and `.toml`;
- primary JSON Schema upload;
- reference mode selection:
  - **Internal only** permits fragment references such as `#/$defs/item` and rejects external references;
  - **Local schema bundle** permits internal references and references resolved from additional uploaded JSON Schema files;
- additional schema upload shown only in bundle mode;
- Validate, Format, Copy, Download, and Clear actions;
- a Lint Settings drawer;
- a Rainglow editor theme selector.

All document and schema content remains in the browser. The application does not fetch remote `$ref` targets.

### Editor themes

The editor theme selector provides exactly 20 curated, readable palettes adapted from the MIT licensed Rainglow Atom collection: 10 light and 10 dark themes. The chosen editor palette is independent of the application System, Light, or Dark appearance setting and persists in local storage.

Each palette defines editor background, foreground, gutter, active line, selection, comment, property, string, number, boolean, keyword, punctuation, and invalid token colours. Rainglow attribution and licence information appear in the project documentation.

## Architecture

### Shared workbench shell

The Codex and generic tabs share reusable controls, editor presentation, file handling, status display, and diagnostics UI. Their validation state and engines remain isolated.

`ConfigEditor` replaces the TOML specific editor wrapper and accepts a language, a Rainglow palette, diagnostics, and validation triggers. It selects CodeMirror JSON, YAML, or TOML language support dynamically.

### Format adapters

Each format adapter implements a common interface:

```ts
interface FormatAdapter {
  parse(source: string): ParseResult;
  format(source: string, options: FormatOptions): Promise<string>;
  lint(source: string, parsed: ParsedDocument, settings: LintSettings): Diagnostic[];
  locate(path: string): SourceRange | undefined;
}
```

- **JSON** uses a location preserving JSON parser for syntax errors, duplicate keys, JSON pointer ranges, and parsed values. Prettier formats valid JSON.
- **YAML** uses the `yaml` package in YAML 1.2 strict mode with line tracking, unique key checks, parse warnings, node ranges, and conversion to JSON compatible values. Prettier formats valid YAML.
- **TOML** uses Taplo for parsing and formatting. Taplo ranges are normalized into the shared diagnostic model.

Auto detection prefers the uploaded extension. Pasted content uses conservative syntax detection and asks the user to choose when JSON, YAML, and TOML cannot be distinguished reliably.

### JSON Schema engine

Ajv validates parsed JSON compatible values and selects JSON Schema Draft 7, 2019-09, or 2020-12 from the schema `$schema` URI. Draft 4 support is included through the Ajv Draft 4 adapter. Unsupported draft declarations produce an error diagnostic. A missing declaration defaults to Draft 2020-12 and produces an informational diagnostic stating that decision.

The engine validates the schema before validating the configuration. Schema compilation problems are reported separately from configuration problems.

In internal only mode, any non-fragment `$ref` produces a clear blocked-reference diagnostic. In local bundle mode, each uploaded schema is registered by its `$id`, filename, and a deterministic local URI. Relative references resolve against the primary schema's local URI. Unresolved references list the requested target and the available local schema identifiers.

Remote HTTP and HTTPS references are never requested.

### Execution safeguards

- Configuration and primary schema files are limited to 2 MiB each.
- The combined local schema bundle is limited to 10 MiB and 50 files.
- Schema validation runs in a Web Worker with a timeout so pathological schemas or regular expressions cannot freeze the page indefinitely.
- Worker failures, timeouts, unsupported schema drafts, and cyclic or unresolved references receive distinct diagnostics.
- Previous validation runs are cancelled or ignored when newer input is validated.

## Diagnostics

Every diagnostic uses this normalized shape:

```ts
interface Diagnostic {
  severity: "error" | "warning" | "info";
  source: "syntax" | "lint" | "schema" | "format" | "system";
  ruleId: string;
  message: string;
  explanation: string;
  suggestion?: string;
  from: number;
  to: number;
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
  dataPath?: string;
  schemaPath?: string;
  expected?: string;
  actual?: string;
  fileName?: string;
}
```

Messages avoid raw validator wording where a more specific explanation is possible. For example, an Ajv `required` failure becomes:

> Missing required property `port` at `/server`. Add `port`. The schema requires an integer value.

The Problems panel shows the concise message first and expands to explanation, suggestion, actual versus expected values, data path, schema path, rule ID, and source file. Selecting a problem highlights and scrolls to the exact source range. Errors use a full red line highlight, warnings amber, and information blue.

Diagnostics can be filtered by severity and source, then grouped by file, rule, or source line.

## Linting

Linting is fully configurable. Each rule has:

- enabled state;
- severity: Off, Info, Warning, or Error;
- rule specific options with validated inputs;
- description, rationale, failing example, and corrected example.

Settings persist locally and can be imported, exported, or reset. Invalid imported settings are rejected without replacing the active configuration.

### Shared rules

- trailing whitespace;
- final newline;
- maximum line length;
- forbidden tab indentation;
- maximum document depth;
- empty document;
- excessive consecutive blank lines.

### JSON rules

- duplicate keys;
- comments forbidden;
- trailing commas forbidden;
- configurable indentation width;
- empty object and empty array policy;
- optional alphabetical object key ordering.

### YAML rules

The initial rule set follows the useful behaviour of yamllint where it can be implemented reliably in the browser:

- anchors: undefined, duplicated, and optionally unused;
- braces and brackets spacing;
- colon and comma spacing;
- document start and document end markers;
- empty lines and empty values;
- hyphen spacing;
- indentation and sequence indentation;
- duplicate keys;
- key ordering;
- quoted string policy;
- truthy value policy for YAML 1.1 compatibility risks;
- line length and trailing spaces;
- newline at end of file.

### TOML rules

- Taplo syntax diagnostics;
- duplicate key and duplicate table diagnostics;
- trailing whitespace and final newline;
- maximum line length;
- indentation tabs;
- configurable key naming convention;
- optional table ordering;
- arrays containing inconsistent value types.

Formatting is never reported as a destructive automatic fix. The Format action previews the resulting text through editor history, allowing normal undo.

## Formatting

- Taplo formats TOML.
- Prettier standalone formats JSON and YAML.
- Formatting is blocked when the source has syntax errors.
- Formatting options include indentation width, tabs versus spaces where supported, line width, final newline, and YAML quote style.
- After formatting, the application validates the new document and preserves undo history.

## Testing

Development follows test first implementation.

Unit tests cover:

- format detection;
- JSON, YAML, and TOML parsing and source ranges;
- every lint rule and configurable option;
- lint settings import, export, validation, persistence, and reset;
- JSON Schema draft selection;
- internal and local bundle reference resolution;
- detailed Ajv diagnostic translation;
- schema compilation errors and validation timeouts;
- formatting behaviour and syntax error protection;
- Rainglow palette selection and persistence.

Integration tests cover:

- preserving the existing Codex workflow;
- switching between Codex and Generic tabs without losing state;
- uploading each supported configuration format;
- uploading primary and dependency schemas;
- filtering and navigating diagnostics;
- changing lint rules and severities;
- formatting, copying, downloading, and clearing;
- responsive behaviour and application themes.

The existing release synchronization and GitHub Pages workflow tests remain. The production workflow continues to require lint, type checks, all tests, and a successful build before deployment.

## Accessibility and responsive behaviour

- Tabs, drawers, filters, selects, and diagnostic disclosures use semantic controls and keyboard navigation.
- Status and error changes use appropriate live regions without announcing every keystroke.
- Error meaning never depends on colour alone.
- The generic control panel collapses into a vertical layout on narrow screens.
- The editor and Problems panel remain usable at 320 CSS pixels without horizontal page overflow.
- Touch targets are at least 44 CSS pixels on mobile layouts.

## Attribution

The README will credit Rainglow and include its MIT copyright and licence notice for the adapted editor palettes.
