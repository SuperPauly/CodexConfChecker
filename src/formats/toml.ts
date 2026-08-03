import { rangeFromOffsets } from "../diagnostics/location";
import type { Diagnostic, SourceRange } from "../diagnostics/types";
import type { TomlEngine } from "../taplo/service";
import type { FormatAdapter, FormatOptions, ParsedDocument } from "./types";

function pointerSegment(value: string): string {
  return value.replace(/~/g, "~0").replace(/\//g, "~1");
}

function locateTomlValues(source: string): ReadonlyMap<string, SourceRange> {
  const locations = new Map<string, SourceRange>();
  let table: string[] = [];
  let offset = 0;
  for (const line of source.split("\n")) {
    const tableMatch = /^\s*\[([^\]]+)]/.exec(line);
    if (tableMatch) {
      table = (tableMatch[1] ?? "").split(".").map((part) => part.trim().replace(/^['"]|['"]$/g, ""));
    } else {
      const equals = line.indexOf("=");
      if (equals > 0 && !/^\s*#/.test(line)) {
        const key = line.slice(0, equals).trim().replace(/^['"]|['"]$/g, "");
        let relativeFrom = equals + 1;
        while (/\s/.test(line[relativeFrom] ?? "")) relativeFrom += 1;
        let relativeTo = line.length;
        const comment = line.indexOf("#", relativeFrom);
        if (comment >= 0) relativeTo = comment;
        while (relativeTo > relativeFrom && /\s/.test(line[relativeTo - 1] ?? "")) relativeTo -= 1;
        const path = [...table, ...key.split(".").map((part) => part.trim())]
          .map(pointerSegment)
          .reduce((result, part) => `${result}/${part}`, "");
        locations.set(path, rangeFromOffsets(source, offset + relativeFrom, offset + relativeTo));
      }
    }
    offset += line.length + 1;
  }
  return locations;
}

export class TomlAdapter implements FormatAdapter {
  readonly format = "toml" as const;

  constructor(private readonly engine: TomlEngine) {}

  parse(source: string): ParsedDocument {
    const locations = locateTomlValues(source);
    try {
      return { value: this.engine.decode(source), diagnostics: [], locations };
    } catch (error) {
      const diagnostic: Diagnostic = {
        ...rangeFromOffsets(source, 0, Math.min(1, source.length)),
        severity: "error",
        source: "syntax",
        ruleId: "toml/syntax",
        message: "Invalid TOML syntax.",
        explanation: error instanceof Error ? error.message : String(error),
        suggestion: "Correct the TOML syntax described here, then validate again.",
      };
      return { diagnostics: [diagnostic], locations };
    }
  }

  async formatSource(source: string, options: FormatOptions): Promise<string> {
    void options;
    return this.engine.format(source);
  }
}
