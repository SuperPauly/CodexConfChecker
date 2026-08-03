import type { Diagnostic } from "./types";

const severityOrder = ["error", "warning", "info"] as const;

export function diagnosticCountSummary(diagnostics: readonly Diagnostic[]): string {
  const counts = severityOrder.map((severity) => ({ severity, count: diagnostics.filter((item) => item.severity === severity).length }));
  const parts = counts.filter(({ count }) => count > 0).map(({ severity, count }) => {
    const singular = severity === "info" ? "information" : severity;
    const plural = severity === "info" ? "information" : `${severity}s`;
    return `${count} ${count === 1 ? singular : plural}`;
  });
  return parts.join(", ") || "No problems";
}

export function diagnosticReport(diagnostics: readonly Diagnostic[]): string {
  return diagnostics.map((diagnostic) => {
    const location = diagnostic.hasSourceLocation === false ? "Schema-level finding" : `Ln ${diagnostic.line}:${diagnostic.column}`;
    return [
      `${diagnostic.severity.toUpperCase()} · ${diagnostic.source} · ${diagnostic.ruleId} · ${location}`,
      diagnostic.message,
      `Why: ${diagnostic.explanation}`,
      ...(diagnostic.suggestion ? [`Fix: ${diagnostic.suggestion}`] : []),
      ...(diagnostic.expected ? [`Expected: ${diagnostic.expected}`] : []),
      ...(diagnostic.actual ? [`Actual: ${diagnostic.actual}`] : []),
      ...(diagnostic.dataPath !== undefined ? [`Data path: ${diagnostic.dataPath || "/"}`] : []),
      ...(diagnostic.schemaPath ? [`Schema path: ${diagnostic.schemaPath}`] : []),
    ].join("\n");
  }).join("\n\n");
}
