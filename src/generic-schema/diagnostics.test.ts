import { describe, expect, it } from "vitest";

import { rangeFromOffsets } from "../diagnostics/location";
import { translateSchemaProblem } from "./diagnostics";

const source = '{"server":{"host":"localhost"}}';
const locations = new Map([
  ["", rangeFromOffsets(source, 0, source.length)],
  ["/server", rangeFromOffsets(source, 10, source.length - 1)],
  ["/server/host", rangeFromOffsets(source, 19, source.length - 2)],
]);

describe("schema diagnostics", () => {
  it("explains missing required properties with paths and a correction", () => {
    const diagnostic = translateSchemaProblem({
      keyword: "required",
      instancePath: "/server",
      schemaPath: "#/properties/server/required",
      message: "must have required property 'port'",
      params: { missingProperty: "port" },
    }, { source, value: { server: { host: "localhost" } }, locations });

    expect(diagnostic).toMatchObject({
      ruleId: "schema/required",
      message: "Missing required property `port` at `/server`.",
      expected: "property `port`",
      dataPath: "/server",
      schemaPath: "#/properties/server/required",
    });
    expect(diagnostic.suggestion).toContain("Add `port`");
    expect(diagnostic.from).toBe(locations.get("/server")?.from);
  });

  it("names unexpected properties and type mismatches", () => {
    const additional = translateSchemaProblem({ keyword: "additionalProperties", instancePath: "/server", schemaPath: "#/additionalProperties", message: "must NOT have additional properties", params: { additionalProperty: "debug" } }, { source, value: { server: { debug: true } }, locations });
    const type = translateSchemaProblem({ keyword: "type", instancePath: "/server/host", schemaPath: "#/properties/host/type", message: "must be string", params: { type: "string" }, data: 42 }, { source, value: { server: { host: 42 } }, locations });

    expect(additional.message).toContain("Unexpected property `debug`");
    expect(additional.suggestion).toContain("Remove `debug`");
    expect(type).toMatchObject({ expected: "string", actual: "42", ruleId: "schema/type" });
  });

  it("does not attach schema compiler failures to configuration line 1", () => {
    const diagnostic = translateSchemaProblem({
      keyword: "schema-compile",
      instancePath: "",
      schemaPath: "",
      message: "JSON Schema could not be compiled: unknown format uint",
      params: {},
    }, { source, value: { server: { host: "localhost" } }, locations });

    expect(diagnostic).toMatchObject({
      ruleId: "schema/schema-compile",
      hasSourceLocation: false,
      message: "JSON Schema could not be compiled: unknown format uint",
    });
    expect(diagnostic.actual).toBeUndefined();
    expect(diagnostic.suggestion).toMatch(/schema/i);
  });
});
