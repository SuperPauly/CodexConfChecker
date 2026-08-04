import { describe, expect, it } from "vitest";

import { validateSchemaRequest } from "./worker";

describe("validateSchemaRequest", () => {
  it.each([
    "http://json-schema.org/draft-04/schema#",
    "http://json-schema.org/draft-07/schema#",
    "https://json-schema.org/draft/2019-09/schema",
    "https://json-schema.org/draft/2020-12/schema",
  ])("validates supported schema draft %s", ($schema) => {
    const result = validateSchemaRequest({
      requestId: 1,
      value: { port: "wrong" },
      primary: { fileName: "config.schema.json", schema: { $schema, type: "object", properties: { port: { type: "integer" } } } },
      dependencies: [],
      referenceMode: "internal",
    });
    expect(result.problems.some((problem) => problem.keyword === "type")).toBe(true);
  });

  it("defaults a missing draft to 2020-12 with an information notice", () => {
    const result = validateSchemaRequest({ requestId: 2, value: "ok", primary: { fileName: "schema.json", schema: { type: "string" } }, dependencies: [], referenceMode: "internal" });
    expect(result.notices[0]).toMatchObject({ ruleId: "schema/draft-default", severity: "info" });
    expect(result.valid).toBe(true);
  });

  it("rejects unsupported drafts and invalid schemas without vague exceptions", () => {
    const unsupported = validateSchemaRequest({ requestId: 3, value: {}, primary: { fileName: "schema.json", schema: { $schema: "https://example.test/draft", type: "object" } }, dependencies: [], referenceMode: "internal" });
    const invalid = validateSchemaRequest({ requestId: 4, value: {}, primary: { fileName: "schema.json", schema: { type: 42 } }, dependencies: [], referenceMode: "internal" });
    expect(unsupported.problems[0]).toMatchObject({ keyword: "schema-draft", instancePath: "" });
    expect(invalid.problems[0]?.message).toMatch(/schema.*invalid|type/i);
  });

  it("validates through uploaded local dependencies and never fetches them", () => {
    const result = validateSchemaRequest({
      requestId: 5,
      value: { server: { port: "wrong" } },
      primary: { fileName: "config.schema.json", schema: { type: "object", properties: { server: { $ref: "server.schema.json" } } } },
      dependencies: [{ fileName: "server.schema.json", schema: { type: "object", properties: { port: { type: "integer" } } } }],
      referenceMode: "bundle",
    });
    expect(result.problems.some((problem) => problem.instancePath === "/server/port" && problem.keyword === "type")).toBe(true);
  });

  it("compiles the Codex uint format instead of returning a schema compiler error", () => {
    const result = validateSchemaRequest({
      requestId: 6,
      value: { max_concurrent_threads_per_session: 8 },
      primary: {
        fileName: "config.schema.json",
        schema: {
          $schema: "https://json-schema.org/draft/2020-12/schema",
          type: "object",
          properties: {
            max_concurrent_threads_per_session: { type: "integer", format: "uint" },
          },
        },
      },
      dependencies: [],
      referenceMode: "internal",
    });

    expect(result.valid).toBe(true);
    expect(result.problems).toEqual([]);
  });

  it("compiles Codex exclusion guards without treating strictRequired lint as a schema error", () => {
    const result = validateSchemaRequest({
      requestId: 10,
      value: {},
      primary: {
        fileName: "config-schema.json",
        schema: {
          $schema: "https://json-schema.org/draft/2020-12/schema",
          type: "object",
          allOf: [{ not: { required: ["exclude"] } }],
        },
      },
      dependencies: [],
      referenceMode: "internal",
    });

    expect(result.problems.some((problem) => problem.keyword === "schema-compile")).toBe(false);
    expect(result.valid).toBe(true);
  });

  it.each([
    ["uint", 0, -1],
    ["uint16", 65_535, 65_536],
    ["uint32", 4_294_967_295, 4_294_967_296],
    ["uint64", Number.MAX_SAFE_INTEGER, -1],
    ["int32", 2_147_483_647, 2_147_483_648],
    ["int64", Number.MIN_SAFE_INTEGER, Number.MIN_SAFE_INTEGER - 1],
    ["double", 1.25, Number.POSITIVE_INFINITY],
  ])("enforces the Codex numeric format %s", (format, accepted, rejected) => {
    const schema = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: format === "double" ? "number" : "integer",
      format,
    };
    const valid = validateSchemaRequest({ requestId: 7, value: accepted, primary: { fileName: "schema.json", schema }, dependencies: [], referenceMode: "internal" });
    const invalid = validateSchemaRequest({ requestId: 8, value: rejected, primary: { fileName: "schema.json", schema }, dependencies: [], referenceMode: "internal" });

    expect(valid.valid).toBe(true);
    expect(valid.problems).toEqual([]);
    expect(invalid.valid).toBe(false);
    expect(invalid.problems[0]).toMatchObject(format === "double"
      ? { keyword: "type", params: { type: "number" } }
      : { keyword: "format", params: { format } });
  });

  it("treats an unknown custom format as an annotation and still validates structure", () => {
    const result = validateSchemaRequest({
      requestId: 9,
      value: "ab",
      primary: {
        fileName: "schema.json",
        schema: {
          $schema: "https://json-schema.org/draft/2020-12/schema",
          type: "string",
          format: "project-slug",
          minLength: 3,
        },
      },
      dependencies: [],
      referenceMode: "internal",
    });

    expect(result.problems.some((problem) => problem.keyword === "schema-compile")).toBe(false);
    expect(result.problems.some((problem) => problem.keyword === "minLength")).toBe(true);
    expect(result.notices).toContainEqual(expect.objectContaining({
      ruleId: "schema/format-annotation",
      severity: "info",
      message: expect.stringContaining("project-slug"),
    }));
  });
});
