import { Taplo, type LintError } from "@taplo/lib";

import type { Diagnostic, ValidationResult } from "./types";

export interface TomlEngine {
  validate(toml: string, schemaUrl: string): Promise<ValidationResult>;
  format(toml: string): string;
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

function inferredSchemaRange(toml: string, message: string): [number, number] {
  const unexpectedKey = message.match(/\('([^']+)' was unexpected\)/)?.[1];
  if (unexpectedKey) {
    const escapedKey = unexpectedKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = new RegExp(`(?:^|\\n)([ \\t]*)(?:${escapedKey}|["']${escapedKey}["'])[ \\t]*=`).exec(
      toml,
    );
    if (match?.index !== undefined) {
      const lineStart = match.index + (toml[match.index] === "\n" ? 1 : 0);
      const from = lineStart + (match[1]?.length ?? 0);
      return [from, from + unexpectedKey.length];
    }
  }

  return [0, 0];
}

function toDiagnostic(toml: string, error: LintError): Diagnostic {
  const declaredRange = diagnosticRange(toml, error.range);
  const [from, to] =
    declaredRange[0] === declaredRange[1]
      ? inferredSchemaRange(toml, error.error)
      : declaredRange;
  return {
    from,
    to,
    message: error.error,
    severity: "error",
  };
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
      return { diagnostics: result.errors.map((error) => toDiagnostic(toml, error)) };
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
}
