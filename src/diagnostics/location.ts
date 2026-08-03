import type { Diagnostic, DiagnosticSeverity, DiagnosticSource, SourceRange } from "./types";

export function offsetPosition(
  source: string,
  offset: number,
): { readonly line: number; readonly column: number } {
  const safeOffset = Math.min(Math.max(0, offset), source.length);
  const before = source.slice(0, safeOffset);
  const lineBreak = before.lastIndexOf("\n");
  return {
    line: before.split("\n").length,
    column: safeOffset - lineBreak,
  };
}

export function rangeFromOffsets(
  source: string,
  from: number,
  to: number,
): SourceRange {
  const safeFrom = Math.min(Math.max(0, from), source.length);
  const safeTo = Math.min(Math.max(safeFrom, to), source.length);
  const start = offsetPosition(source, safeFrom);
  const end = offsetPosition(source, safeTo);
  return {
    from: safeFrom,
    to: safeTo,
    line: start.line,
    column: start.column,
    endLine: end.line,
    endColumn: end.column,
  };
}

export function documentLevelDiagnostic(
  sourceText: string,
  severity: DiagnosticSeverity,
  source: DiagnosticSource,
  ruleId: string,
  message: string,
  explanation: string,
  suggestion?: string,
): Diagnostic {
  return {
    ...rangeFromOffsets(sourceText, 0, Math.min(1, sourceText.length)),
    hasSourceLocation: false,
    severity,
    source,
    ruleId,
    message,
    explanation,
    ...(suggestion ? { suggestion } : {}),
  };
}

export function displayValue(value: unknown, maximumLength = Number.POSITIVE_INFINITY): string {
  if (value === undefined) return "undefined";
  let rendered: string;
  try {
    const serialized = JSON.stringify(value);
    rendered = serialized === undefined ? String(value) : serialized;
  } catch {
    rendered = String(value);
  }
  return rendered.length <= maximumLength
    ? rendered
    : `${rendered.slice(0, maximumLength - 1)}…`;
}
