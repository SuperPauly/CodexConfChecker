import { describe, expect, it } from "vitest";

import { TaploService } from "../taplo/service";
import { TomlAdapter } from "./toml";

describe("TomlAdapter", () => {
  it("decodes, locates, and formats TOML using Taplo", async () => {
    const engine = await TaploService.initialize();
    const adapter = new TomlAdapter(engine);
    const source = "[server]\nport=8080\n";
    const parsed = adapter.parse(source);

    expect(parsed.value).toEqual({ server: { port: 8080 } });
    expect(source.slice(parsed.locations.get("/server/port")?.from, parsed.locations.get("/server/port")?.to)).toBe("8080");
    await expect(adapter.formatSource(source, { tabWidth: 2, useTabs: false, printWidth: 80 })).resolves.toBe("[server]\nport = 8080\n");
  });

  it("returns a precise syntax diagnostic and blocks formatting", async () => {
    const adapter = new TomlAdapter(await TaploService.initialize());
    const parsed = adapter.parse('name = "unterminated\n');

    expect(parsed.diagnostics[0]).toMatchObject({ source: "syntax", ruleId: "toml/syntax", severity: "error" });
    await expect(adapter.formatSource('name = "unterminated\n', { tabWidth: 2, useTabs: false, printWidth: 80 })).rejects.toThrow();
  });
});
