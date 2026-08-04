# Unified Codex schema registry design

## Goal

Replace the two workbench tabs with one local configuration workbench that validates JSON, YAML, or TOML against a selected program schema and exports a valid configuration in any of those formats.

## Schema sources and retention

The Codex program has a current stable schema fetched from `https://learn.chatgpt.com/docs/config-schema.json`. Alpha schemas come only from the newest non draft GitHub prerelease whose tag contains `alpha`; the updater must select its release asset named exactly `config-schema.json`. The updater runs every 30 minutes and keeps immutable prior alpha assets in the repository so older versions remain selectable.

The manifest is a program registry. Each program owns a display name, default configuration format, output base name, and ordered schema versions. Each version records its identifier, label, channel, source URL, repository asset path, SHA 256 digest, and last successful synchronization time. The registry structure allows later programs without changing the page layout.

## Unified page

The page keeps the accepted Rainglow theme system and current editor layout. Its header contains compact Program, Configuration format, and Website theme selects plus a Select Version button. Program currently contains only Codex CLI. Select Version opens an accessible modal scoped to the selected program. The modal has direct Latest Stable and Latest Alpha buttons, a searchable datalist autocomplete, a scrollable version list, and an explicit Load button.

Tracked schema selections load their repository JSON automatically. The existing JSON Schema upload is available on the same page. Uploading a custom schema selects it immediately and disables Select Version until the custom schema is removed, preventing a tracked release from silently replacing a user supplied schema. Custom mode reveals the existing dependency bundle and reference policy controls. All schema processing and configuration processing stay in the browser.

Validation retains the current explicit trigger behaviour: ordinary typing only marks the document dirty; validation runs on Enter, pointer movement, blur, schema selection, upload, Format, or the Validate button. Full diagnostics stay visible without truncation.

## Download conversion

Download is a menu button with JSON, YAML, and TOML choices. A download is allowed only after the current document revision has passed syntax, lint, and schema validation. The parsed value is serialized with JSON indentation, YAML document serialization, or Taplo encoding and formatting. The filename is `config.json`, `config.yaml`, or `config.toml` unless an uploaded filename provides a safer base name.

## Failure handling

The updater fails without replacing repository assets if the stable response is invalid JSON, GitHub has no eligible alpha release, the alpha release lacks `config-schema.json`, or any schema is not an object. The UI reports a schema load error explicitly and never silently validates without the selected tracked schema.

## Tests

Script tests cover source selection, exact alpha asset selection, archive retention, unchanged runs, malformed responses, and the missing asset error. Unit and component tests cover registry parsing, dependent selects, custom schema mode, validation invalidation after edits, and each export format. The complete lint, type check, unit test, script test, production build, desktop browser, and mobile browser checks must pass before publication.
