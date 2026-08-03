import { displayValue, rangeFromOffsets } from "../diagnostics/location";
import type { Diagnostic, SourceRange } from "../diagnostics/types";
import type { SchemaProblem } from "./types";

export interface SchemaDiagnosticContext {
  readonly source: string;
  readonly value: unknown;
  readonly locations: ReadonlyMap<string, SourceRange>;
}

function escapePointer(value: string): string {
  return value.replace(/~/g, "~0").replace(/\//g, "~1");
}

function valueAtPointer(value: unknown, pointer: string): unknown {
  if (!pointer) return value;
  return pointer.split("/").slice(1).reduce<unknown>((current, segment) => {
    if (current === null || current === undefined || typeof current !== "object") return undefined;
    const key = segment.replace(/~1/g, "/").replace(/~0/g, "~");
    return (current as Record<string, unknown>)[key];
  }, value);
}

function nearestRange(context: SchemaDiagnosticContext, path: string): SourceRange {
  let candidate = path;
  while (candidate) {
    const range = context.locations.get(candidate);
    if (range) return range;
    candidate = candidate.slice(0, candidate.lastIndexOf("/"));
  }
  return context.locations.get("") ?? rangeFromOffsets(context.source, 0, Math.min(1, context.source.length));
}

function expectation(problem: SchemaProblem): string | undefined {
  if (problem.keyword === "type") return String(problem.params.type ?? "the required type");
  if (problem.keyword === "enum") return `one of ${displayValue(problem.params.allowedValues ?? problem.params)}`;
  if (problem.keyword === "format") return `format ${String(problem.params.format ?? "required by the schema")}`;
  if (["minimum", "maximum", "minLength", "maxLength", "minItems", "maxItems"].includes(problem.keyword)) return `${problem.keyword} ${String(problem.params.limit ?? "")}`.trim();
  return undefined;
}

export function translateSchemaProblem(problem: SchemaProblem, context: SchemaDiagnosticContext): Diagnostic {
  const additional = typeof problem.params.additionalProperty === "string" ? problem.params.additionalProperty : undefined;
  const missing = typeof problem.params.missingProperty === "string" ? problem.params.missingProperty : undefined;
  const dataPath = additional ? `${problem.instancePath}/${escapePointer(additional)}` : problem.instancePath;
  const range = nearestRange(context, dataPath);
  const actualValue = problem.data ?? valueAtPointer(context.value, dataPath);
  const base = {
    ...range,
    severity: "error" as const,
    source: "schema" as const,
    ruleId: `schema/${problem.keyword}`,
    dataPath,
    schemaPath: problem.schemaPath,
  };
  if (problem.keyword === "required" && missing) return {
    ...base,
    message: `Missing required property \`${missing}\` at \`${problem.instancePath || "/"}\`.`,
    explanation: `The JSON Schema lists \`${missing}\` as mandatory for this object.`,
    suggestion: `Add \`${missing}\` to \`${problem.instancePath || "/"}\` using the type required by the schema.`,
    expected: `property \`${missing}\``,
    actual: "property is absent",
  };
  if (problem.keyword === "additionalProperties" && additional) return {
    ...base,
    message: `Unexpected property \`${additional}\` at \`${problem.instancePath || "/"}\`.`,
    explanation: "The schema forbids properties that are not declared for this object.",
    suggestion: `Remove \`${additional}\` or add it to the JSON Schema if it is intentional.`,
    expected: "only properties declared by the schema",
    actual: additional,
  };
  const expected = expectation(problem);
  if (problem.keyword === "type") return {
    ...base,
    message: `Wrong value type at \`${dataPath || "/"}\`: expected ${expected}.`,
    explanation: `The value is ${actualValue === null ? "null" : Array.isArray(actualValue) ? "an array" : `a ${typeof actualValue}`}, but the schema requires ${expected}.`,
    suggestion: `Replace the value with ${expected === "string" ? "quoted text" : `a valid ${expected} value`}.`,
    ...(expected ? { expected } : {}),
    actual: displayValue(actualValue),
  };
  return {
    ...base,
    message: `Schema rule \`${problem.keyword}\` failed at \`${dataPath || "/"}\`: ${problem.message}.`,
    explanation: `The value does not satisfy the JSON Schema keyword \`${problem.keyword}\`.`,
    suggestion: expected ? `Change the value to satisfy ${expected}.` : "Review the linked schema path and correct the highlighted value.",
    ...(expected ? { expected } : {}),
    actual: displayValue(actualValue),
  };
}
