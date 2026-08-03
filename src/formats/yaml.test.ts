import { describe, expect, it } from "vitest";

import { YamlAdapter } from "./yaml";

describe("YamlAdapter", () => {
  const adapter = new YamlAdapter();

  it("parses YAML 1.2 and maps paths to scalar ranges", () => {
    const source = "server:\n  port: 8080\n";
    const parsed = adapter.parse(source);
    const range = parsed.locations.get("/server/port");

    expect(parsed.value).toEqual({ server: { port: 8080 } });
    expect(source.slice(range?.from, range?.to)).toBe("8080");
  });

  it("reports duplicate keys and syntax errors with locations", () => {
    const duplicate = adapter.parse("port: 1\nport: 2\n");
    const malformed = adapter.parse("server: [one, two\n");

    expect(duplicate.diagnostics.some((item) => item.ruleId === "yaml/duplicate-key")).toBe(true);
    expect(malformed.diagnostics[0]).toMatchObject({ source: "syntax", severity: "error" });
    expect(malformed.diagnostics[0]?.line).toBe(2);
  });

  it("formats valid YAML and refuses malformed YAML", async () => {
    await expect(adapter.formatSource("server: {port: 8080}\n", { tabWidth: 2, useTabs: false, printWidth: 80 })).resolves.toContain("port: 8080");
    await expect(adapter.formatSource("server: [one\n", { tabWidth: 2, useTabs: false, printWidth: 80 })).rejects.toThrow(/cannot format/i);
  });
});
