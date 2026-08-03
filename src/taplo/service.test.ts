import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TaploService } from "./service";

const schema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  type: "object",
  additionalProperties: false,
  properties: {
    model: { type: "string", enum: ["gpt-5", "gpt-5-mini"] },
    agents: {
      type: "object",
      properties: { max_depth: { type: "integer" } },
      additionalProperties: { type: "object" },
    },
  },
};

describe("TaploService", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const response = new Response(JSON.stringify(schema), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
        Object.defineProperty(response, "url", {
          value:
            typeof input === "string"
              ? input
              : input instanceof Request
                ? input.url
                : input.toString(),
        });
        return response;
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("accepts TOML that complies with the selected schema", async () => {
    const service = await TaploService.initialize();

    const result = await service.validate(
      'model = "gpt-5"\n',
      "https://schema.test/config.schema.json",
    );

    expect(result.diagnostics).toEqual([]);
  });

  it("reports an unknown top level key with a source range", async () => {
    const service = await TaploService.initialize();

    const result = await service.validate(
      "unknown_key = true\n",
      "https://schema.test/config.schema.json",
    );

    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]).toMatchObject({
      severity: "error",
      from: 0,
    });
    expect(result.diagnostics[0]?.to).toBeGreaterThan(0);
    expect(result.diagnostics[0]?.message.toLowerCase()).toContain("unknown");
  });

  it("reports syntax and duplicate key errors", async () => {
    const service = await TaploService.initialize();

    const syntax = await service.validate(
      'model = "unterminated\n',
      "https://schema.test/config.schema.json",
    );
    const duplicate = await service.validate(
      'model = "gpt-5"\nmodel = "gpt-5-mini"\n',
      "https://schema.test/config.schema.json",
    );

    expect(syntax.diagnostics.length).toBeGreaterThan(0);
    expect(duplicate.diagnostics.length).toBeGreaterThan(0);
  });

  it("infers real lines when Taplo omits ranges for schema diagnostics", async () => {
    const service = await TaploService.initialize();
    const toml = [
      "legacy_one = true",
      "legacy_two = false",
      "[agents]",
      "max_threads = 8",
      "job_max_runtime_seconds = 1800",
      "",
    ].join("\n");

    const result = await service.validate(toml, "https://schema.test/config.schema.json");

    expect(result.diagnostics).toHaveLength(4);
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ message: expect.stringContaining("legacy_one"), line: 1 }),
      expect.objectContaining({ message: expect.stringContaining("legacy_two"), line: 2 }),
      expect.objectContaining({ message: expect.stringContaining("agents.max_threads"), line: 4, source: "schema" }),
      expect.objectContaining({ message: expect.stringContaining("agents.job_max_runtime_seconds"), line: 5, source: "schema" }),
    ]));
    expect(result.diagnostics.every((diagnostic) => diagnostic.from > 0 || diagnostic.line === 1)).toBe(true);
  });

  it("formats valid TOML and refuses malformed TOML", async () => {
    const service = await TaploService.initialize();

    expect(service.format('model="gpt-5"\n')).toBe('model = "gpt-5"\n');
    expect(() => service.format('model = "unterminated\n')).toThrow();
  });
});
