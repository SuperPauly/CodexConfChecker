# Rainglow Application Theme and Schema Diagnostics Design

## Goal

Apply the selected Rainglow preset to the complete application, compile the Codex JSON Schema without false `schema-compile` failures, and make lint, syntax, and schema findings easier to understand without truncating their content.

## Confirmed root cause

The generic JSON Schema workbench creates AJV with strict schema checking. The Codex schema uses the application formats `uint`, `uint16`, `uint32`, `uint64`, `int32`, `int64`, and `double`. `ajv-formats` does not define these formats, so AJV throws while compiling the schema. The catch block converts that compiler exception into a root diagnostic, which is why changing or deleting configuration line 1 cannot remove it.

## Design

### Complete Rainglow theming

The selected Rainglow theme becomes application state shared by both workbenches. A semantic token function derives page, surface, raised surface, border, text, muted text, accent, button, editor, and shadow colours from the selected palette. It writes those tokens to the root element and sets the native colour scheme from the preset variant. The editor continues using the exact syntax colours from the same preset.

The separate System, Light, and Dark control is removed because it can contradict the selected Rainglow preset. Light and dark remain available through the ten Rainglow presets of each variant. The existing saved editor theme key remains compatible and now restores the complete site theme.

### JSON Schema formats

AJV remains strict for malformed schemas and unsupported keywords. Before schema compilation, the validator registers the Codex numeric formats with numeric semantics:

* `uint`, `uint64`, and `int64` require safe JavaScript integers, with unsigned variants requiring zero or greater.
* `uint16`, `uint32`, and `int32` enforce their exact numeric ranges.
* `double` accepts finite numbers.

Other custom formats discovered in an uploaded schema are registered as annotation only and returned as one information notice listing their names. This prevents a custom annotation from disabling all structural validation while telling the user that the custom format itself was not asserted.

Schema compilation errors are schema level findings, not source line findings. They display without a line jump or a misleading highlighted configuration value.

### Diagnostics presentation

Problems are grouped into Errors, Warnings, and Information. Empty groups are omitted. Each group is a native collapsible section showing its count. Error groups open by default; warning and information groups start collapsed. Expand all and Collapse all controls operate on all visible groups.

Every individual finding always displays the complete message, explanation, fix, expected value, actual value, data path, and schema path. Long metadata wraps and scrolls where required rather than being shortened. A line button is shown only when the finding points to a real source location.

The status summary reports separate error, warning, and information counts. Filters remain available and update the grouped results.

### Additional usability feature

Add a Copy report control that copies a plain text diagnostic report containing severity, message, location, explanation, fix, and metadata. This is useful when filing issues or sending validation results to another developer and does not expose files automatically.

## Testing

* Reproduce the exact Codex `uint` schema compiler failure before implementing the format registry.
* Test every Codex numeric format, including boundary failures.
* Test that an unknown custom format becomes a nonblocking notice while structural constraints still run.
* Test that the selected Rainglow preset writes complete application tokens and persists across both workbenches.
* Test grouped diagnostics, complete metadata, group controls, source navigation, and copied report content.
* Run lint, TypeScript, all Vitest tests, workflow tests, and the production build.
* Verify the deployed desktop and mobile UI, theme selection, Codex schema upload, configuration validation, diagnostics grouping, line navigation, and browser console.

## Scope

No server component, network schema resolution, automatic configuration rewriting, or new dependency is added.
