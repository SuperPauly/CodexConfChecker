import { describe, expect, it } from "vitest";

import { codexMigrationDiagnostics } from "./codex-migrations";

describe("codexMigrationDiagnostics", () => {
  it("suggests replacing the documented legacy agents.max_threads TOML key", () => {
    const source = "[agents]\nmax_threads = 8\n";
    const diagnostics = codexMigrationDiagnostics(source, "toml", { agents: { max_threads: 8 } });
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({
      kind: "unknown-key",
      ruleId: "codex/deprecated-key",
      fix: { label: "Update key", replacement: "max_concurrent_threads_per_session" },
    });
    expect(source.slice(diagnostics[0]!.fix!.from, diagnostics[0]!.fix!.to)).toBe("max_threads");
  });

  it("returns no migration when the legacy key is absent", () => {
    expect(codexMigrationDiagnostics("[agents]\nmax_depth = 2\n", "toml", { agents: { max_depth: 2 } })).toEqual([]);
  });
});
