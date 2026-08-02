import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TaploService } from "./service";

const schema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  type: "object",
  additionalProperties: false,
  properties: {
    model: { type: "string", enum: ["gpt-5", "gpt-5-mini"] },
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

  it("formats valid TOML and refuses malformed TOML", async () => {
    const service = await TaploService.initialize();

    expect(service.format('model="gpt-5"\n')).toBe('model = "gpt-5"\n');
    expect(() => service.format('model = "unterminated\n')).toThrow();
  });
});
