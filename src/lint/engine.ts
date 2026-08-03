import { displayValue, rangeFromOffsets } from "../diagnostics/location";
import type { Diagnostic, SourceRange } from "../diagnostics/types";
import type { ConfigFormat, ParsedDocument } from "../formats/types";
import type { LintRuleId } from "./catalog";
import type { LintRuleSetting, LintSettings } from "./settings";

interface Details {
  readonly message: string;
  readonly explanation: string;
  readonly suggestion: string;
  readonly actual?: string;
  readonly expected?: string;
  readonly dataPath?: string;
}

function linesWithOffsets(source: string): readonly { text: string; from: number; to: number; number: number }[] {
  let offset = 0;
  return source.split("\n").map((text, index) => {
    const line = { text, from: offset, to: offset + text.length, number: index + 1 };
    offset += text.length + 1;
    return line;
  });
}

function valueType(value: unknown): string {
  return Array.isArray(value) ? "array" : value === null ? "null" : typeof value;
}

function setting(settings: LintSettings, ruleId: LintRuleId): LintRuleSetting {
  return settings[ruleId] ?? { severity: "off", options: {} };
}

function walkValue(value: unknown, visit: (value: unknown, path: string, depth: number) => void, path = "", depth = 0): void {
  visit(value, path, depth);
  if (Array.isArray(value)) value.forEach((item, index) => walkValue(item, visit, `${path}/${index}`, depth + 1));
  else if (value && typeof value === "object") Object.entries(value).forEach(([key, item]) => walkValue(item, visit, `${path}/${key.replace(/~/g, "~0").replace(/\//g, "~1")}`, depth + 1));
}

export function lintDocument(source: string, parsed: ParsedDocument, format: ConfigFormat, settings: LintSettings): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const lines = linesWithOffsets(source);
  const emit = (ruleId: LintRuleId, range: SourceRange, details: Details) => {
    const severity = setting(settings, ruleId).severity;
    if (severity === "off") return;
    diagnostics.push({ ...range, severity, source: "lint", ruleId, ...details });
  };
  const lineRange = (line: { from: number; to: number }) => rangeFromOffsets(source, line.from, line.to);
  const pathRange = (path: string) => parsed.locations.get(path) ?? rangeFromOffsets(source, 0, Math.min(1, source.length));

  for (const line of lines) {
    const trailing = /[ \t]+$/.exec(line.text);
    if (trailing) emit("shared/trailing-whitespace", rangeFromOffsets(source, line.from + trailing.index, line.to), { message: `Trailing whitespace on line ${line.number}.`, explanation: "Spaces or tabs appear after the final visible token on this line.", suggestion: "Remove the highlighted trailing whitespace.", actual: displayValue(trailing[0]), expected: "no trailing characters" });
    const maximum = Number(setting(settings, "shared/max-line-length").options.length);
    if (line.text.length > maximum) emit("shared/max-line-length", rangeFromOffsets(source, line.from + maximum, line.to), { message: `Line ${line.number} is ${line.text.length} characters long.`, explanation: `This exceeds the configured ${maximum} character limit.`, suggestion: "Wrap or split the value while preserving its data type.", actual: `${line.text.length} characters`, expected: `${maximum} characters or fewer` });
    const tab = /^\s*\t/.exec(line.text);
    if (tab) emit("shared/no-tab-indentation", rangeFromOffsets(source, line.from + tab[0].lastIndexOf("\t"), line.from + tab[0].length), { message: `Tab indentation on line ${line.number}.`, explanation: "A tab appears before the first visible token.", suggestion: "Replace the tab with spaces.", actual: "tab", expected: "space indentation" });
  }
  if (source && !source.endsWith("\n")) emit("shared/final-newline", rangeFromOffsets(source, source.length, source.length), { message: "Document does not end with a newline.", explanation: "The final line ends immediately after its last token.", suggestion: "Add one newline at the end of the document.", actual: "no final newline", expected: "one final newline" });
  if (!source.trim() || parsed.value === undefined && !parsed.diagnostics.length) emit("shared/no-empty-document", rangeFromOffsets(source, 0, source.length), { message: "Configuration document is empty.", explanation: "No configuration value was found after ignoring whitespace and comments.", suggestion: "Paste or upload a configuration value.", actual: "empty document", expected: "a JSON, YAML, or TOML value" });
  const maximumBlank = Number(setting(settings, "shared/max-blank-lines").options.maximum);
  const blankPattern = new RegExp(`(?:\\r?\\n[ \\t]*){${maximumBlank + 2},}`, "g");
  for (const match of source.matchAll(blankPattern)) emit("shared/max-blank-lines", rangeFromOffsets(source, match.index, match.index + match[0].length), { message: "Too many consecutive blank lines.", explanation: `The configured maximum is ${maximumBlank}.`, suggestion: `Keep no more than ${maximumBlank} consecutive blank lines.`, actual: `${match[0].split("\n").length - 1} line breaks`, expected: `${maximumBlank + 1} line breaks or fewer` });

  if (parsed.value !== undefined) {
    const maximumDepth = Number(setting(settings, "shared/max-depth").options.depth);
    walkValue(parsed.value, (value, path, depth) => {
      if (depth === maximumDepth + 1) emit("shared/max-depth", pathRange(path), { message: `Configuration nesting exceeds depth ${maximumDepth} at '${path || "/"}'.`, explanation: "This value is nested deeper than the configured maximum.", suggestion: "Flatten this configuration structure if the target program permits it.", actual: `depth ${depth}`, expected: `depth ${maximumDepth} or less`, dataPath: path });
    });
  }

  if (format === "json") lintJson(source, parsed, settings, emit, pathRange);
  if (format === "yaml") lintYaml(source, parsed, settings, emit, lineRange);
  if (format === "toml") lintToml(source, parsed, settings, emit, lineRange, pathRange);
  return diagnostics.sort((left, right) => left.from - right.from || left.ruleId.localeCompare(right.ruleId));
}

type Emit = (ruleId: LintRuleId, range: SourceRange, details: Details) => void;

function lintJson(source: string, parsed: ParsedDocument, settings: LintSettings, emit: Emit, pathRange: (path: string) => SourceRange): void {
  for (const match of source.matchAll(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g)) emit("json/no-comments", rangeFromOffsets(source, match.index, match.index + match[0].length), { message: "JSON comments are not allowed.", explanation: "The JSON standard does not define line or block comments.", suggestion: "Remove the comment or store the explanation in a normal property.", actual: match[0], expected: "strict JSON" });
  for (const match of source.matchAll(/,(\s*[}\]])/g)) emit("json/no-trailing-commas", rangeFromOffsets(source, match.index, match.index + 1), { message: "Trailing comma in JSON.", explanation: "A comma appears after the final property or array item.", suggestion: "Remove the highlighted comma.", actual: "trailing comma", expected: "no comma before the closing token" });
  const spaces = Number(setting(settings, "json/indentation").options.spaces);
  for (const line of linesWithOffsets(source).slice(1)) {
    const indent = /^ +/.exec(line.text)?.[0].length ?? 0;
    if (indent && indent % spaces !== 0) emit("json/indentation", rangeFromOffsets(source, line.from, line.from + indent), { message: `JSON indentation on line ${line.number} is ${indent} spaces.`, explanation: `Indentation must be a multiple of ${spaces} spaces.`, suggestion: `Use ${spaces} spaces for each nesting level.`, actual: `${indent} spaces`, expected: `a multiple of ${spaces}` });
  }
  if (parsed.value !== undefined) walkValue(parsed.value, (value, path) => {
    if (Array.isArray(value) && value.length === 0 && setting(settings, "json/empty-collections").options.allowArrays === false) emit("json/empty-collections", pathRange(path), { message: `Empty array at '${path || "/"}'.`, explanation: "The active lint setting forbids empty arrays.", suggestion: "Add an item or remove the unused property.", actual: "[]", expected: "a non-empty array", dataPath: path });
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const keys = Object.keys(value);
      if (!keys.length && setting(settings, "json/empty-collections").options.allowObjects === false) emit("json/empty-collections", pathRange(path), { message: `Empty object at '${path || "/"}'.`, explanation: "The active lint setting forbids empty objects.", suggestion: "Add a property or remove the unused object.", actual: "{}", expected: "a non-empty object", dataPath: path });
      const order = String(setting(settings, "json/key-ordering").options.order);
      const sorted = [...keys].sort((a, b) => a.localeCompare(b));
      if (order === "descending") sorted.reverse();
      if (keys.some((key, index) => key !== sorted[index])) emit("json/key-ordering", pathRange(path), { message: `JSON properties at '${path || "/"}' are not in ${order} order.`, explanation: "The active lint setting requires deterministic alphabetical property ordering.", suggestion: `Reorder properties as: ${sorted.join(", ")}.`, actual: keys.join(", "), expected: sorted.join(", "), dataPath: path });
    }
  });
}

function lintYaml(source: string, parsed: ParsedDocument, settings: LintSettings, emit: Emit, lineRange: (line: { from: number; to: number }) => SourceRange): void {
  const lines = linesWithOffsets(source);
  const allowedStart = Number(setting(settings, "yaml/empty-lines").options.start);
  const allowedEnd = Number(setting(settings, "yaml/empty-lines").options.end);
  const leading = /^(?:[ \t]*\r?\n)*/.exec(source)?.[0] ?? "";
  const trailing = /(?:\r?\n[ \t]*)*$/.exec(source)?.[0] ?? "";
  const leadingCount = (leading.match(/\n/g) ?? []).length;
  const trailingCount = (trailing.match(/\n/g) ?? []).length;
  if (leadingCount > allowedStart) emit("yaml/empty-lines", rangeFromOffsets(source, 0, leading.length), { message: `YAML starts with ${leadingCount} empty lines.`, explanation: `The active rule allows ${allowedStart} empty lines before the document.`, suggestion: `Remove ${leadingCount - allowedStart} empty ${leadingCount - allowedStart === 1 ? "line" : "lines"} from the start.`, actual: `${leadingCount} empty lines`, expected: `${allowedStart} or fewer` });
  if (trailingCount > allowedEnd) emit("yaml/empty-lines", rangeFromOffsets(source, source.length - trailing.length, source.length), { message: `YAML ends with ${trailingCount} line endings.`, explanation: `The active rule allows ${allowedEnd} line endings after the final value.`, suggestion: `Remove ${trailingCount - allowedEnd} empty ${trailingCount - allowedEnd === 1 ? "line" : "lines"} from the end.`, actual: `${trailingCount} line endings`, expected: `${allowedEnd} or fewer` });
  const anchors = new Map<string, number>();
  const aliases = new Set<string>();
  for (const match of source.matchAll(/&([A-Za-z0-9_-]+)/g)) {
    const name = match[1];
    if (!name) continue;
    if (anchors.has(name)) emit("yaml/anchors", rangeFromOffsets(source, match.index, match.index + match[0].length), { message: `Duplicate YAML anchor '${name}'.`, explanation: "An anchor name must identify only one node in a document.", suggestion: "Rename this anchor and its aliases.", actual: name, expected: "a unique anchor name" });
    anchors.set(name, match.index);
  }
  for (const match of source.matchAll(/\*([A-Za-z0-9_-]+)/g)) {
    const name = match[1];
    if (!name) continue;
    aliases.add(name);
    if (!anchors.has(name)) emit("yaml/anchors", rangeFromOffsets(source, match.index, match.index + match[0].length), { message: `Undefined YAML anchor alias '${name}'.`, explanation: "This alias refers to an anchor that is not defined earlier in the document.", suggestion: `Define '&${name}' before this alias or correct the name.`, actual: name, expected: "a previously defined anchor" });
  }
  if (setting(settings, "yaml/anchors").options.forbidUnused === true) for (const [name, from] of anchors) if (!aliases.has(name)) emit("yaml/anchors", rangeFromOffsets(source, from, from + name.length + 1), { message: `Unused YAML anchor '${name}'.`, explanation: "The anchor is defined but no alias refers to it.", suggestion: "Remove the anchor or use it through an alias.", actual: name, expected: "an anchor referenced by an alias" });
  const braceSpaces = Number(setting(settings, "yaml/braces").options.spaces);
  const bracketSpaces = Number(setting(settings, "yaml/brackets").options.spaces);
  for (const match of source.matchAll(/\{([^\n{}]*)}/g)) if ((match[1]?.match(/^ */)?.[0].length ?? 0) !== braceSpaces || (match[1]?.match(/ *$/)?.[0].length ?? 0) !== braceSpaces) emit("yaml/braces", rangeFromOffsets(source, match.index, match.index + match[0].length), { message: "Incorrect spacing inside YAML braces.", explanation: `The active rule requires ${braceSpaces} spaces inside flow mapping braces.`, suggestion: braceSpaces ? "Add one space immediately inside each brace." : "Remove spaces immediately inside the braces.", actual: match[0], expected: braceSpaces ? "{ key: value }" : "{key: value}" });
  for (const match of source.matchAll(/\[([^\n[\]]*)]/g)) if ((match[1]?.match(/^ */)?.[0].length ?? 0) !== bracketSpaces || (match[1]?.match(/ *$/)?.[0].length ?? 0) !== bracketSpaces) emit("yaml/brackets", rangeFromOffsets(source, match.index, match.index + match[0].length), { message: "Incorrect spacing inside YAML brackets.", explanation: `The active rule requires ${bracketSpaces} spaces inside flow sequence brackets.`, suggestion: bracketSpaces ? "Add one space immediately inside each bracket." : "Remove spaces immediately inside the brackets.", actual: match[0], expected: bracketSpaces ? "[ item ]" : "[item]" });
  const requireStart = setting(settings, "yaml/document-markers").options.start === true;
  const requireEnd = setting(settings, "yaml/document-markers").options.end === true;
  if (requireStart && !/^---(?:\s|$)/.test(source)) emit("yaml/document-markers", rangeFromOffsets(source, 0, 0), { message: "Missing YAML document start marker.", explanation: "The active lint setting requires `---` before document content.", suggestion: "Add `---` on the first line.", actual: "no start marker", expected: "---" });
  if (requireEnd && !/\.\.\.\s*$/.test(source)) emit("yaml/document-markers", rangeFromOffsets(source, source.length, source.length), { message: "Missing YAML document end marker.", explanation: "The active lint setting requires `...` after document content.", suggestion: "Add `...` on the final line.", actual: "no end marker", expected: "..." });
  const spaces = Number(setting(settings, "yaml/indentation").options.spaces);
  for (const line of lines) {
    const indent = /^ +/.exec(line.text)?.[0].length ?? 0;
    if (indent && indent % spaces !== 0) emit("yaml/indentation", rangeFromOffsets(source, line.from, line.from + indent), { message: `YAML indentation on line ${line.number} is ${indent} spaces.`, explanation: `Indentation must be a multiple of ${spaces} spaces.`, suggestion: `Use ${spaces} spaces for each nesting level.`, actual: `${indent} spaces`, expected: `a multiple of ${spaces}` });
    const truthy = /:\s*(yes|no|on|off)\s*(?:#.*)?$/i.exec(line.text);
    if (truthy) {
      const value = truthy[1] ?? "";
      const valueIndex = truthy[0].indexOf(value);
      emit("yaml/truthy", rangeFromOffsets(source, line.from + truthy.index + valueIndex, line.from + truthy.index + valueIndex + value.length), { message: `Ambiguous YAML truthy value '${value}'.`, explanation: "This is a string in YAML 1.2 but a boolean in YAML 1.1.", suggestion: value.toLowerCase() === "yes" || value.toLowerCase() === "on" ? "Use `true` for a boolean or quote the word for a string." : "Use `false` for a boolean or quote the word for a string.", actual: value, expected: "true, false, or a quoted string" });
    }
    if (/^\s*-\s{2,}\S/.test(line.text)) emit("yaml/hyphen-spacing", lineRange(line), { message: `Too many spaces after the sequence hyphen on line ${line.number}.`, explanation: "A block sequence hyphen should be followed by one space.", suggestion: "Keep exactly one space after the hyphen.", actual: "multiple spaces", expected: "one space" });
    if (/^[^#\n]+:\s*(?:#.*)?$/.test(line.text.trimEnd())) emit("yaml/no-empty-values", lineRange(line), { message: `Empty YAML value on line ${line.number}.`, explanation: "This mapping key resolves to null because no value follows its colon.", suggestion: "Add an explicit value or remove the incomplete key.", actual: "null", expected: "an explicit value" });
    if (/\S\s+:/.test(line.text) || /:\S/.test(line.text.replace(/https?:\/\//g, ""))) emit("yaml/colon-spacing", lineRange(line), { message: `Incorrect colon spacing on line ${line.number}.`, explanation: "YAML mappings require no space before and one space after a colon.", suggestion: "Write the mapping as `key: value`.", actual: line.text.trim(), expected: "key: value" });
    if (/,(?=\S)/.test(line.text)) emit("yaml/comma-spacing", lineRange(line), { message: `Missing space after a comma on line ${line.number}.`, explanation: "Flow collection commas should be followed by one space.", suggestion: "Add one space after each comma.", actual: line.text.trim(), expected: "item, item" });
  }
  const order = String(setting(settings, "yaml/key-ordering").options.order);
  if (parsed.value && typeof parsed.value === "object") walkValue(parsed.value, (value, path) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return;
    const keys = Object.keys(value);
    const sorted = [...keys].sort((a, b) => a.localeCompare(b));
    if (order === "descending") sorted.reverse();
    if (keys.some((key, index) => key !== sorted[index])) emit("yaml/key-ordering", parsed.locations.get(path) ?? rangeFromOffsets(source, 0, 0), { message: `YAML keys at '${path || "/"}' are not in ${order} order.`, explanation: "The active lint setting requires deterministic alphabetical key ordering.", suggestion: `Reorder keys as: ${sorted.join(", ")}.`, actual: keys.join(", "), expected: sorted.join(", "), dataPath: path });
  });
  const quoteStyle = String(setting(settings, "yaml/quoted-strings").options.style);
  for (const match of source.matchAll(/:\s*(["'])(.*?)\1\s*(?:#.*)?$/gm)) {
    const quote = match[1] ?? "\"";
    const actual = quote === "\"" ? "double" : "single";
    if (quoteStyle !== "needed" && actual !== quoteStyle) emit("yaml/quoted-strings", rangeFromOffsets(source, match.index + match[0].indexOf(quote), match.index + match[0].lastIndexOf(quote) + 1), { message: `YAML string uses ${actual} quotes.`, explanation: `The active lint setting requires ${quoteStyle} quotes.`, suggestion: `Rewrite this string with ${quoteStyle} quotes.`, actual: `${actual} quotes`, expected: `${quoteStyle} quotes` });
  }
}

function lintToml(source: string, parsed: ParsedDocument, settings: LintSettings, emit: Emit, lineRange: (line: { from: number; to: number }) => SourceRange, pathRange: (path: string) => SourceRange): void {
  const pattern = new RegExp(String(setting(settings, "toml/key-naming").options.pattern));
  const tables: { name: string; line: ReturnType<typeof linesWithOffsets>[number] }[] = [];
  for (const line of linesWithOffsets(source)) {
    const table = /^\s*\[([^\]]+)]/.exec(line.text);
    if (table?.[1]) tables.push({ name: table[1], line });
    const key = /^\s*([A-Za-z0-9_-]+)\s*=/.exec(line.text)?.[1];
    if (key && !pattern.test(key)) emit("toml/key-naming", lineRange(line), { message: `TOML key '${key}' does not match the naming pattern.`, explanation: `The active pattern is '${pattern.source}'.`, suggestion: "Rename the key to match the configured convention.", actual: key, expected: pattern.source });
  }
  const order = String(setting(settings, "toml/table-ordering").options.order);
  const names = tables.map((table) => table.name);
  const sorted = [...names].sort((a, b) => a.localeCompare(b));
  if (order === "descending") sorted.reverse();
  const firstWrong = names.findIndex((name, index) => name !== sorted[index]);
  const wrongTable = tables[firstWrong];
  if (wrongTable) emit("toml/table-ordering", lineRange(wrongTable.line), { message: `TOML table '${wrongTable.name}' is out of ${order} order.`, explanation: "The active lint setting requires deterministic alphabetical table ordering.", suggestion: `Order tables as: ${sorted.join(", ")}.`, actual: names.join(", "), expected: sorted.join(", ") });
  if (parsed.value !== undefined) walkValue(parsed.value, (value, path) => {
    if (!Array.isArray(value) || value.length < 2) return;
    const types = [...new Set(value.map(valueType))];
    if (types.length > 1) emit("toml/homogeneous-arrays", pathRange(path), { message: `TOML array at '${path || "/"}' mixes ${types.join(" and ")}.`, explanation: "The active rule requires every array element to use the same value type.", suggestion: "Convert all array items to one type or split them into separate keys.", actual: types.join(", "), expected: "one value type", dataPath: path });
  });
}

export function applyLintSeverities(diagnostics: readonly Diagnostic[], settings: LintSettings): Diagnostic[] {
  return diagnostics.flatMap((diagnostic) => {
    const setting = settings[diagnostic.ruleId as LintRuleId];
    if (!setting) return [diagnostic];
    if (setting.severity === "off") return [];
    return [{ ...diagnostic, severity: setting.severity }];
  });
}
