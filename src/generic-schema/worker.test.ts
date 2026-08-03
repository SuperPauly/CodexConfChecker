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
});
