import prettier from "prettier/standalone";
import yamlPlugin from "prettier/plugins/yaml";
import {
  LineCounter,
  isMap,
  isNode,
  isSeq,
  parseDocument,
  type Node,
  type Pair,
  type YAMLMap,
  type YAMLSeq,
} from "yaml";

import { rangeFromOffsets } from "../diagnostics/location";
import type { Diagnostic, SourceRange } from "../diagnostics/types";
import type { FormatAdapter, FormatOptions, ParsedDocument } from "./types";

function pointerSegment(value: string): string {
  return value.replace(/~/g, "~0").replace(/\//g, "~1");
}

function yamlRange(node: Node): readonly [number, number] {
  const range = node.range;
  return range ? [range[0], range[1]] : [0, 0];
}

function visitNode(source: string, node: Node, path: string, locations: Map<string, SourceRange>): void {
  const [from, to] = yamlRange(node);
  locations.set(path, rangeFromOffsets(source, from, to));
  if (isMap(node)) {
    for (const pair of (node as YAMLMap).items as Pair[]) {
      if (!isNode(pair.key) || !isNode(pair.value)) continue;
      const key = String((pair.key as { value?: unknown }).value ?? "");
      visitNode(source, pair.value, `${path}/${pointerSegment(key)}`, locations);
    }
  } else if (isSeq(node)) {
    (node as YAMLSeq).items.forEach((item, index) => {
      if (isNode(item)) visitNode(source, item, `${path}/${index}`, locations);
    });
  }
}

export class YamlAdapter implements FormatAdapter {
  readonly format = "yaml" as const;

  parse(source: string): ParsedDocument {
    const lineCounter = new LineCounter();
    const document = parseDocument(source, {
      lineCounter,
      logLevel: "silent",
      prettyErrors: false,
      strict: true,
      uniqueKeys: true,
      version: "1.2",
    });
    const diagnostics: Diagnostic[] = [...document.errors, ...document.warnings].map((error) => {
      const from = error.pos?.[0] ?? 0;
      const to = error.pos?.[1] ?? from + 1;
      const duplicate = error.code === "DUPLICATE_KEY";
      return {
        ...rangeFromOffsets(source, from, Math.max(from + 1, to)),
        severity: error.name === "YAMLWarning" ? "warning" : "error",
        source: "syntax",
        ruleId: duplicate ? "yaml/duplicate-key" : `yaml/${String(error.code).toLowerCase().replaceAll("_", "-")}`,
        message: duplicate ? "Duplicate YAML mapping key." : error.message.replace(/\s+at line[\s\S]*$/i, ""),
        explanation: duplicate
          ? "A YAML mapping defines the same key more than once, so parsers may disagree about which value wins."
          : "The YAML 1.2 parser could not interpret the highlighted structure safely.",
        suggestion: duplicate ? "Remove or rename one of the duplicate keys." : "Correct the highlighted YAML syntax, then validate again.",
      };
    });
    const locations = new Map<string, SourceRange>();
    if (isNode(document.contents)) visitNode(source, document.contents, "", locations);
    let value: unknown;
    if (!document.errors.length) {
      try {
        value = document.toJS({ mapAsMap: false, maxAliasCount: 100 });
      } catch (error) {
        diagnostics.push({
          ...rangeFromOffsets(source, 0, 0),
          severity: "error",
          source: "syntax",
          ruleId: "yaml/conversion",
          message: "YAML could not be converted to configuration data.",
          explanation: error instanceof Error ? error.message : String(error),
          suggestion: "Reduce alias expansion or replace unsupported YAML values.",
        });
      }
    }
    return { ...(value === undefined ? {} : { value }), diagnostics, locations };
  }

  async formatSource(source: string, options: FormatOptions): Promise<string> {
    const parsed = this.parse(source);
    if (parsed.value === undefined || parsed.diagnostics.some((item) => item.severity === "error")) {
      throw new Error("Cannot format YAML until its syntax errors are corrected.");
    }
    return prettier.format(source, {
      parser: "yaml",
      plugins: [yamlPlugin],
      tabWidth: options.tabWidth,
      useTabs: false,
      printWidth: options.printWidth,
      singleQuote: options.singleQuote ?? false,
    });
  }
}
