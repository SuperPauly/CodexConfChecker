import { rangeFromOffsets } from "../diagnostics/location";
import type { Diagnostic } from "../diagnostics/types";
import type { ConfigFormat } from "../formats/types";

function hasLegacyAgentThreads(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const agents = (value as Record<string, unknown>).agents;
  return Boolean(agents && typeof agents === "object" && !Array.isArray(agents) && Object.hasOwn(agents, "max_threads"));
}

function keyRange(source: string, format: ConfigFormat): readonly [number, number] | undefined {
  if (format === "json") {
    const match = /"max_threads"\s*:/u.exec(source);
    if (match?.index !== undefined) return [match.index + 1, match.index + 1 + "max_threads".length];
  }
  if (format === "yaml") {
    const match = /^\s*max_threads\s*:/mu.exec(source);
    if (match?.index !== undefined) { const relative = match[0].indexOf("max_threads"); return [match.index + relative, match.index + relative + "max_threads".length]; }
  }
  if (format === "toml") {
    let table = "";
    let offset = 0;
    for (const line of source.split("\n")) {
      const heading = /^\s*\[([^\]]+)\]/u.exec(line);
      if (heading?.[1]) table = heading[1].trim();
      if (table === "agents") {
        const match = /^\s*max_threads\s*=/u.exec(line);
        if (match) { const relative = line.indexOf("max_threads"); return [offset + relative, offset + relative + "max_threads".length]; }
      }
      offset += line.length + 1;
    }
  }
  return undefined;
}

export function codexMigrationDiagnostics(source: string, format: ConfigFormat, value: unknown): readonly Diagnostic[] {
  if (!hasLegacyAgentThreads(value)) return [];
  const range = keyRange(source, format);
  if (!range) return [];
  return [{
    ...rangeFromOffsets(source, range[0], range[1]),
    severity: "error",
    source: "schema",
    ruleId: "codex/deprecated-key",
    kind: "unknown-key",
    message: "Deprecated key `agents.max_threads` is not declared by the selected schema.",
    explanation: "This older key is absent from the selected schema. The current replacement is `agents.max_concurrent_threads_per_session`.",
    suggestion: "Update the key to the current canonical name. Its numeric value will be preserved.",
    dataPath: "/agents/max_threads",
    fix: { label: "Update key", from: range[0], to: range[1], replacement: "max_concurrent_threads_per_session" },
  }];
}
