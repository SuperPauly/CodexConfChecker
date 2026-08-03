import { getNodeValue, parseTree, printParseErrorCode, type Node, type ParseError } from "jsonc-parser";
import prettier from "prettier/standalone";
import babelPlugin from "prettier/plugins/babel";
import estreePlugin from "prettier/plugins/estree";

import { rangeFromOffsets } from "../diagnostics/location";
import type { Diagnostic, SourceRange } from "../diagnostics/types";
import type { FormatAdapter, FormatOptions, ParsedDocument } from "./types";

function pointerSegment(value: string): string {
  return value.replace(/~/g, "~0").replace(/\//g, "~1");
}

function syntaxDiagnostic(source: string, error: ParseError): Diagnostic {
  const reason = printParseErrorCode(error.error).replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
  return {
    ...rangeFromOffsets(source, error.offset, error.offset + Math.max(1, error.length)),
    severity: "error",
    source: "syntax",
    ruleId: "json/syntax",
    message: `Invalid JSON: ${reason}.`,
    explanation: `The JSON parser stopped at this location because it encountered ${reason}.`,
    suggestion: "Correct the highlighted JSON token, then validate again.",
  };
}

function visitNode(
  source: string,
  node: Node,
  path: string,
  locations: Map<string, SourceRange>,
  diagnostics: Diagnostic[],
): void {
  locations.set(path, rangeFromOffsets(source, node.offset, node.offset + node.length));
  if (node.type === "object") {
    const seen = new Map<string, Node>();
    for (const property of node.children ?? []) {
      const keyNode = property.children?.[0];
      const valueNode = property.children?.[1];
      if (!keyNode || !valueNode) continue;
      const key = String(keyNode.value);
      const childPath = `${path}/${pointerSegment(key)}`;
      if (seen.has(key)) {
        diagnostics.push({
          ...rangeFromOffsets(source, keyNode.offset, keyNode.offset + keyNode.length),
          severity: "error",
          source: "syntax",
          ruleId: "json/duplicate-key",
          message: `Duplicate JSON property \`${key}\`.`,
          explanation: `The object already defines \`${key}\`. JSON object property names must be unique for predictable configuration behaviour.`,
          suggestion: `Remove one \`${key}\` property or rename it.`,
          dataPath: childPath,
        });
      } else {
        seen.set(key, keyNode);
      }
      visitNode(source, valueNode, childPath, locations, diagnostics);
    }
  } else if (node.type === "array") {
    node.children?.forEach((child, index) => visitNode(source, child, `${path}/${index}`, locations, diagnostics));
  }
}

export class JsonAdapter implements FormatAdapter {
  readonly format = "json" as const;

  parse(source: string): ParsedDocument {
    const errors: ParseError[] = [];
    const root = parseTree(source, errors, {
      allowEmptyContent: false,
      allowTrailingComma: false,
      disallowComments: true,
    });
    const diagnostics = errors.map((error) => syntaxDiagnostic(source, error));
    const locations = new Map<string, SourceRange>();
    if (root) visitNode(source, root, "", locations, diagnostics);
    return {
      ...(root && errors.length === 0 ? { value: getNodeValue(root) } : {}),
      diagnostics,
      locations,
    };
  }

  async formatSource(source: string, options: FormatOptions): Promise<string> {
    const parsed = this.parse(source);
    if (parsed.value === undefined || parsed.diagnostics.length > 0) {
      throw new Error("Cannot format JSON until its syntax errors are corrected.");
    }
    return prettier.format(source, {
      parser: "json",
      plugins: [babelPlugin, estreePlugin],
      tabWidth: options.tabWidth,
      useTabs: options.useTabs,
      printWidth: options.printWidth,
    });
  }
}
