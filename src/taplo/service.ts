import { Taplo, type LintError } from "@taplo/lib";

import { rangeFromOffsets } from "../diagnostics/location";
import type { Diagnostic } from "../diagnostics/types";
import type { ValidationResult } from "./types";

export interface TomlEngine {
  validate(toml: string, schemaUrl: string): Promise<ValidationResult>;
  format(toml: string): string;
  decode(toml: string): unknown;
  encode(value: object): string;
}

interface RangeObject {
  readonly start?: number | { readonly line?: number; readonly character?: number };
  readonly end?: number | { readonly line?: number; readonly character?: number };
}

function positionOffset(
  toml: string,
  position: number | { readonly line?: number; readonly character?: number } | undefined,
): number {
  if (typeof position === "number") {
    return position;
  }
  if (!position || typeof position.line !== "number") {
    return 0;
  }
  const lines = toml.split("\n");
  let offset = 0;
  for (let index = 0; index < position.line; index += 1) {
    offset += (lines[index]?.length ?? 0) + 1;
  }
  return offset + (position.character ?? 0);
}

function diagnosticRange(toml: string, range: unknown): [number, number] {
  if (Array.isArray(range) && range.length >= 2) {
    return [Number(range[0]) || 0, Number(range[1]) || 0];
  }
  if (range && typeof range === "object") {
    const value = range as RangeObject;
    const from = positionOffset(toml, value.start);
    return [from, Math.max(from, positionOffset(toml, value.end))];
  }
  return [0, 0];
}

interface TomlAssignment {
  readonly key: string;
  readonly path: string;
  readonly value: string;
  readonly from: number;
  readonly to: number;
}

function unquote(value: string): string {
  return value.replace(/^(?:"(.*)"|'(.*)')$/, "$1$2");
}

function assignments(toml: string): readonly TomlAssignment[] {
  const result: TomlAssignment[] = [];
  let table = "";
  let offset = 0;
  for (const line of toml.split("\n")) {
    const tableMatch = /^\s*\[\[?([^\]]+)\]\]?\s*(?:#.*)?$/.exec(line);
    if (tableMatch?.[1]) {
      table = tableMatch[1].trim();
    } else if (!/^\s*#/.test(line)) {
      const match = /^\s*((?:[A-Za-z0-9_.-]+)|(?:"[^"]+")|(?:'[^']+'))\s*=\s*(.*?)\s*$/.exec(line);
      if (match?.[1] && match[2] !== undefined) {
        const key = unquote(match[1]);
        const keyStart = line.indexOf(match[1]);
        const value = match[2].replace(/\s+#.*$/, "").trim();
        result.push({ key, path: table ? `${table}.${key}` : key, value, from: offset + keyStart, to: offset + line.length });
      }
    }
    offset += line.length + 1;
  }
  return result;
}

function uniqueAssignment(items: readonly TomlAssignment[]): TomlAssignment | undefined {
  return items.length === 1 ? items[0] : undefined;
}

function unexpectedProperties(message: string): readonly string[] {
  if (!/additional properties are not allowed/i.test(message)) return [];
  return [...message.matchAll(/'([^']+)'/g)].flatMap((match) => match[1] ? [match[1]] : []);
}

function diagnostic(
  toml: string,
  message: string,
  range: readonly [number, number],
  suggestion?: string,
): Diagnostic {
  const schemaFailure = /schema|additional properties|required|is not of type|must be .*received/i.test(message);
  return {
    ...rangeFromOffsets(toml, range[0], range[1]),
    message,
    explanation: schemaFailure
      ? "The TOML value does not satisfy the selected JSON Schema constraint."
      : "Taplo could not parse this TOML structure or found conflicting keys.",
    ...(suggestion ? { suggestion } : {}),
    ruleId: schemaFailure ? "taplo/schema" : "taplo/syntax",
    source: schemaFailure ? "schema" : "syntax",
    severity: "error",
  };
}

function toDiagnostics(toml: string, error: LintError): Diagnostic[] {
  const declaredRange = diagnosticRange(toml, error.range);
  if (declaredRange[0] !== declaredRange[1]) return [diagnostic(toml, error.error, declaredRange)];

  const documentAssignments = assignments(toml);
  const unexpected = unexpectedProperties(error.error);
  if (unexpected.length) return unexpected.map((key) => {
    const assignment = uniqueAssignment(documentAssignments.filter((item) => item.key === key));
    const range: [number, number] = assignment ? [assignment.from, assignment.to] : [0, 0];
    return diagnostic(
      toml,
      `Property \`${assignment?.path ?? key}\` is not allowed by the selected Codex schema.`,
      range,
      `Remove \`${assignment?.path ?? key}\` or select a Codex release whose schema declares it.`,
    );
  });

  const typeFailure = /^(.*?) is not of type "([^"]+)"$/.exec(error.error);
  if (typeFailure?.[1] && typeFailure[2]) {
    const assignment = uniqueAssignment(documentAssignments.filter((item) => item.value === typeFailure[1]));
    if (assignment) return [diagnostic(
      toml,
      `Value for \`${assignment.path}\` must be ${typeFailure[2]}; received ${typeFailure[1]}.`,
      [assignment.from, assignment.to],
      `Remove \`${assignment.path}\` or replace it with a TOML ${typeFailure[2]} accepted by the selected Codex schema.`,
    )];
  }

  return [diagnostic(toml, error.error, [0, 0])];
}

function normalizeError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }
  return new Error(String(error));
}

export class TaploService implements TomlEngine {
  static #initializing: Promise<TaploService> | undefined;

  readonly #taplo: Taplo;

  private constructor(taplo: Taplo) {
    this.#taplo = taplo;
  }

  static initialize(): Promise<TaploService> {
    TaploService.#initializing ??= Taplo.initialize().then(
      (taplo) => new TaploService(taplo),
    );
    return TaploService.#initializing;
  }

  async validate(toml: string, schemaUrl: string): Promise<ValidationResult> {
    try {
      const result = await this.#taplo.lint(toml, {
        config: { schema: { enabled: true, url: schemaUrl } },
      });
      return { diagnostics: result.errors.flatMap((error) => toDiagnostics(toml, error)) };
    } catch (error) {
      throw normalizeError(error);
    }
  }

  format(toml: string): string {
    try {
      this.#taplo.decode(toml);
      return this.#taplo.format(toml);
    } catch (error) {
      throw normalizeError(error);
    }
  }

  decode(toml: string): unknown {
    try {
      return this.#taplo.decode(toml);
    } catch (error) {
      throw normalizeError(error);
    }
  }

  encode(value: object): string {
    try {
      return this.#taplo.encode(value);
    } catch (error) {
      throw normalizeError(error);
    }
  }
}
