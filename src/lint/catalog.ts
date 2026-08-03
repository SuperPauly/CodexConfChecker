import type { DiagnosticSeverity } from "../diagnostics/types";
import type { ConfigFormat } from "../formats/types";

export type LintSeverity = DiagnosticSeverity | "off";

export interface LintOptionDefinition {
  readonly key: string;
  readonly label: string;
  readonly type: "number" | "boolean" | "string" | "select";
  readonly defaultValue: string | number | boolean;
  readonly minimum?: number;
  readonly maximum?: number;
  readonly choices?: readonly string[];
}

export interface LintRuleDefinition {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly rationale: string;
  readonly formats: readonly ConfigFormat[];
  readonly defaultSeverity: LintSeverity;
  readonly badExample: string;
  readonly goodExample: string;
  readonly options: readonly LintOptionDefinition[];
}

const allFormats = ["json", "yaml", "toml"] as const;
const numberOption = (key: string, label: string, defaultValue: number, minimum: number, maximum: number): LintOptionDefinition => ({ key, label, type: "number", defaultValue, minimum, maximum });
const booleanOption = (key: string, label: string, defaultValue: boolean): LintOptionDefinition => ({ key, label, type: "boolean", defaultValue });
const selectOption = (key: string, label: string, defaultValue: string, choices: readonly string[]): LintOptionDefinition => ({ key, label, type: "select", defaultValue, choices });

function rule(definition: LintRuleDefinition): LintRuleDefinition {
  return definition;
}

export const LINT_RULES = [
  rule({ id: "shared/trailing-whitespace", name: "Trailing whitespace", description: "Reports spaces or tabs after the final visible token on a line.", rationale: "Invisible trailing characters create noisy diffs and inconsistent formatting.", formats: allFormats, defaultSeverity: "warning", badExample: "name: Paul  ", goodExample: "name: Paul", options: [] }),
  rule({ id: "shared/final-newline", name: "Final newline", description: "Requires the document to end with exactly one line ending.", rationale: "A final newline improves command line interoperability and version control diffs.", formats: allFormats, defaultSeverity: "warning", badExample: "name: Paul", goodExample: "name: Paul\n", options: [] }),
  rule({ id: "shared/max-line-length", name: "Maximum line length", description: "Reports lines that exceed the configured character limit.", rationale: "Bounded line lengths keep configuration readable on mobile screens and in review tools.", formats: allFormats, defaultSeverity: "warning", badExample: "description: a very long value", goodExample: "description: >\n  wrapped value", options: [numberOption("length", "Maximum characters", 120, 20, 500)] }),
  rule({ id: "shared/no-tab-indentation", name: "Tab indentation", description: "Reports tab characters used before the first visible token.", rationale: "Tabs render at different widths and are invalid indentation in YAML.", formats: allFormats, defaultSeverity: "error", badExample: "\tname: Paul", goodExample: "  name: Paul", options: [] }),
  rule({ id: "shared/max-depth", name: "Maximum depth", description: "Reports configuration structures nested beyond the configured depth.", rationale: "Deeply nested configuration is harder to inspect and easier to misconfigure.", formats: allFormats, defaultSeverity: "warning", badExample: "a: {b: {c: {d: true}}}", goodExample: "feature_enabled: true", options: [numberOption("depth", "Maximum depth", 20, 2, 100)] }),
  rule({ id: "shared/no-empty-document", name: "Empty document", description: "Reports a configuration document containing no usable value.", rationale: "An empty configuration is usually an accidental upload or incomplete paste.", formats: allFormats, defaultSeverity: "warning", badExample: "# only a comment", goodExample: "enabled: true", options: [] }),
  rule({ id: "shared/max-blank-lines", name: "Consecutive blank lines", description: "Limits repeated empty lines between configuration sections.", rationale: "Excessive vertical whitespace obscures relationships between nearby settings.", formats: allFormats, defaultSeverity: "warning", badExample: "a: 1\n\n\n\nb: 2", goodExample: "a: 1\n\nb: 2", options: [numberOption("maximum", "Maximum blank lines", 2, 0, 10)] }),
  rule({ id: "json/duplicate-key", name: "Duplicate JSON keys", description: "Reports repeated property names within the same JSON object.", rationale: "JSON consumers may keep different duplicate values, making behaviour unpredictable.", formats: ["json"], defaultSeverity: "error", badExample: '{"port":80,"port":443}', goodExample: '{"port":443}', options: [] }),
  rule({ id: "json/no-comments", name: "JSON comments", description: "Reports JavaScript style comments because standard JSON does not allow them.", rationale: "Strict JSON compatibility prevents a file working in one parser and failing in another.", formats: ["json"], defaultSeverity: "error", badExample: '{"port":443 // TLS}', goodExample: '{"port":443}', options: [] }),
  rule({ id: "json/no-trailing-commas", name: "JSON trailing commas", description: "Reports commas after the final object property or array item.", rationale: "Trailing commas are not valid in the JSON standard and break strict parsers.", formats: ["json"], defaultSeverity: "error", badExample: '{"port":443,}', goodExample: '{"port":443}', options: [] }),
  rule({ id: "json/indentation", name: "JSON indentation", description: "Requires nested JSON lines to use the configured indentation width.", rationale: "Consistent indentation makes object ownership and array structure immediately visible.", formats: ["json"], defaultSeverity: "warning", badExample: "{\n   \"port\": 443\n}", goodExample: "{\n  \"port\": 443\n}", options: [numberOption("spaces", "Spaces per level", 2, 1, 8)] }),
  rule({ id: "json/empty-collections", name: "Empty JSON collections", description: "Optionally reports empty JSON objects and arrays.", rationale: "Empty collections can indicate a forgotten configuration block rather than an intentional value.", formats: ["json"], defaultSeverity: "off", badExample: '{"servers":[]}', goodExample: '{"servers":["local"]}', options: [booleanOption("allowObjects", "Allow empty objects", true), booleanOption("allowArrays", "Allow empty arrays", true)] }),
  rule({ id: "json/key-ordering", name: "JSON key ordering", description: "Optionally requires object properties to be ordered alphabetically.", rationale: "Stable ordering makes large generated configurations easier to scan and compare.", formats: ["json"], defaultSeverity: "off", badExample: '{"z":1,"a":2}', goodExample: '{"a":2,"z":1}', options: [selectOption("order", "Order", "ascending", ["ascending", "descending"])] }),
  rule({ id: "yaml/anchors", name: "YAML anchors", description: "Reports undefined, duplicate, or optionally unused YAML anchors.", rationale: "Broken or unused anchors hide configuration duplication and may fail during expansion.", formats: ["yaml"], defaultSeverity: "error", badExample: "value: *missing", goodExample: "base: &base value\nvalue: *base", options: [booleanOption("forbidUnused", "Report unused anchors", false)] }),
  rule({ id: "yaml/braces", name: "YAML brace spacing", description: "Controls spaces inside flow mapping braces.", rationale: "Consistent flow mapping spacing prevents dense and difficult to read inline objects.", formats: ["yaml"], defaultSeverity: "warning", badExample: "value: { key: 1 }", goodExample: "value: {key: 1}", options: [numberOption("spaces", "Spaces inside braces", 0, 0, 1)] }),
  rule({ id: "yaml/brackets", name: "YAML bracket spacing", description: "Controls spaces inside flow sequence brackets.", rationale: "Consistent flow sequence spacing keeps inline arrays compact and predictable.", formats: ["yaml"], defaultSeverity: "warning", badExample: "ports: [ 80, 443 ]", goodExample: "ports: [80, 443]", options: [numberOption("spaces", "Spaces inside brackets", 0, 0, 1)] }),
  rule({ id: "yaml/colon-spacing", name: "YAML colon spacing", description: "Requires one space after mapping colons and none before them.", rationale: "Incorrect colon spacing can change a mapping into a plain scalar unexpectedly.", formats: ["yaml"], defaultSeverity: "warning", badExample: "port :443", goodExample: "port: 443", options: [] }),
  rule({ id: "yaml/comma-spacing", name: "YAML comma spacing", description: "Requires one space after commas in flow collections.", rationale: "Consistent comma spacing makes inline mappings and sequences readable.", formats: ["yaml"], defaultSeverity: "warning", badExample: "ports: [80,443]", goodExample: "ports: [80, 443]", options: [] }),
  rule({ id: "yaml/document-markers", name: "YAML document markers", description: "Optionally requires YAML document start and end markers.", rationale: "Explicit markers disambiguate documents when files are concatenated or streamed.", formats: ["yaml"], defaultSeverity: "off", badExample: "name: Paul", goodExample: "---\nname: Paul\n...", options: [booleanOption("start", "Require start marker", false), booleanOption("end", "Require end marker", false)] }),
  rule({ id: "yaml/empty-lines", name: "YAML empty lines", description: "Limits empty lines at the beginning and end of YAML documents.", rationale: "Unnecessary boundary whitespace produces noisy diffs and confusing document separation.", formats: ["yaml"], defaultSeverity: "warning", badExample: "\n\nname: Paul\n\n", goodExample: "name: Paul\n", options: [numberOption("start", "Allowed at start", 0, 0, 5), numberOption("end", "Allowed at end", 1, 0, 5)] }),
  rule({ id: "yaml/no-empty-values", name: "YAML empty values", description: "Reports mapping keys that have no explicit value.", rationale: "An omitted YAML value becomes null and is often an accidental incomplete setting.", formats: ["yaml"], defaultSeverity: "warning", badExample: "port:", goodExample: "port: 443", options: [] }),
  rule({ id: "yaml/hyphen-spacing", name: "YAML sequence spacing", description: "Requires one space after a block sequence hyphen.", rationale: "Missing or repeated spacing after a hyphen can alter YAML parsing and readability.", formats: ["yaml"], defaultSeverity: "warning", badExample: "-  first", goodExample: "- first", options: [] }),
  rule({ id: "yaml/indentation", name: "YAML indentation", description: "Requires indentation to use a consistent number of spaces.", rationale: "YAML structure is defined by indentation, so inconsistent widths can change meaning.", formats: ["yaml"], defaultSeverity: "warning", badExample: "server:\n   port: 443", goodExample: "server:\n  port: 443", options: [numberOption("spaces", "Spaces per level", 2, 1, 8), booleanOption("indentSequences", "Indent sequences", true)] }),
  rule({ id: "yaml/duplicate-key", name: "Duplicate YAML keys", description: "Reports repeated keys within the same YAML mapping.", rationale: "Duplicate YAML keys are rejected by strict parsers and may silently replace values elsewhere.", formats: ["yaml"], defaultSeverity: "error", badExample: "port: 80\nport: 443", goodExample: "port: 443", options: [] }),
  rule({ id: "yaml/key-ordering", name: "YAML key ordering", description: "Optionally requires mapping keys to be ordered alphabetically.", rationale: "Stable ordering improves scanning and version control comparisons in generated files.", formats: ["yaml"], defaultSeverity: "off", badExample: "z: 1\na: 2", goodExample: "a: 2\nz: 1", options: [selectOption("order", "Order", "ascending", ["ascending", "descending"])] }),
  rule({ id: "yaml/quoted-strings", name: "YAML quoted strings", description: "Controls whether YAML strings should use single quotes, double quotes, or only necessary quotes.", rationale: "A consistent quoting policy prevents ambiguous scalars and makes escaping predictable.", formats: ["yaml"], defaultSeverity: "off", badExample: "name: 'Paul'", goodExample: 'name: "Paul"', options: [selectOption("style", "Quote style", "double", ["double", "single", "needed"]), booleanOption("checkKeys", "Check mapping keys", false)] }),
  rule({ id: "yaml/truthy", name: "YAML truthy values", description: "Reports YAML 1.1 boolean spellings such as yes, no, on, and off.", rationale: "Those words are strings in YAML 1.2 but booleans in YAML 1.1, creating portability bugs.", formats: ["yaml"], defaultSeverity: "warning", badExample: "enabled: YES", goodExample: "enabled: true", options: [] }),
  rule({ id: "toml/duplicate-key", name: "Duplicate TOML keys", description: "Reports repeated keys or conflicting tables in a TOML document.", rationale: "TOML requires unique keys and tables, so duplicates make the document invalid.", formats: ["toml"], defaultSeverity: "error", badExample: "port = 80\nport = 443", goodExample: "port = 443", options: [] }),
  rule({ id: "toml/key-naming", name: "TOML key naming", description: "Optionally requires TOML keys to match a configurable regular expression.", rationale: "A shared naming convention makes configuration APIs predictable across tables.", formats: ["toml"], defaultSeverity: "off", badExample: "BadKey = true", goodExample: "bad_key = true", options: [{ key: "pattern", label: "Regular expression", type: "string", defaultValue: "^[a-z][a-z0-9_]*$" }] }),
  rule({ id: "toml/table-ordering", name: "TOML table ordering", description: "Optionally requires TOML table headers to appear alphabetically.", rationale: "Stable table ordering makes long configuration documents easier to navigate and compare.", formats: ["toml"], defaultSeverity: "off", badExample: "[z]\n[a]", goodExample: "[a]\n[z]", options: [selectOption("order", "Order", "ascending", ["ascending", "descending"])] }),
  rule({ id: "toml/homogeneous-arrays", name: "TOML homogeneous arrays", description: "Reports arrays containing values with different data types.", rationale: "Homogeneous arrays are portable across TOML consumers and easier to validate reliably.", formats: ["toml"], defaultSeverity: "warning", badExample: 'values = [1, "two"]', goodExample: "values = [1, 2]", options: [] }),
] as const;

export type LintRuleId = (typeof LINT_RULES)[number]["id"];

export const LINT_RULE_BY_ID = new Map(LINT_RULES.map((definition) => [definition.id, definition]));
