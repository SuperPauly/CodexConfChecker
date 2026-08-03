import { describe, expect, it } from "vitest";

import { JsonAdapter } from "./json";

describe("JsonAdapter", () => {
  const adapter = new JsonAdapter();

  it("parses values and maps JSON pointers to exact property ranges", () => {
    const source = '{"server":{"port":8080}}';
    const parsed = adapter.parse(source);

    expect(parsed.value).toEqual({ server: { port: 8080 } });
    expect(parsed.diagnostics).toEqual([]);
    expect(source.slice(parsed.locations.get("/server/port")?.from, parsed.locations.get("/server/port")?.to)).toBe("8080");
  });

  it("reports duplicate keys and malformed syntax with explicit rule identifiers", () => {
    expect(adapter.parse('{"port":1,"port":2}').diagnostics.some((item) => item.ruleId === "json/duplicate-key")).toBe(true);
    expect(adapter.parse('{"port":}').diagnostics[0]).toMatchObject({ severity: "error", source: "syntax", ruleId: "json/syntax" });
  });

  it("formats valid JSON and refuses malformed JSON", async () => {
    await expect(adapter.formatSource('{"port":8080}', { tabWidth: 2, useTabs: false, printWidth: 80 })).resolves.toBe('{ "port": 8080 }\n');
    await expect(adapter.formatSource('{"port":}', { tabWidth: 2, useTabs: false, printWidth: 80 })).rejects.toThrow(/cannot format/i);
  });
});
