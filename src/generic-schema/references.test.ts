import { describe, expect, it } from "vitest";

import { prepareSchemas, scanReferences } from "./references";

describe("JSON Schema references", () => {
  it("allows internal references in both modes", () => {
    expect(scanReferences({ $ref: "#/$defs/port" }, "internal", [])).toEqual([]);
    expect(scanReferences({ $ref: "#/$defs/port" }, "bundle", [])).toEqual([]);
  });

  it("blocks external references in internal only mode", () => {
    expect(scanReferences({ $ref: "server.schema.json" }, "internal", [])[0]).toMatchObject({
      ruleId: "schema/ref-external-blocked",
      reference: "server.schema.json",
    });
  });

  it("resolves bundle references by filename or declared identifier", () => {
    const dependencies = [{
      fileName: "server.schema.json",
      schema: { $id: "https://schemas.example/server", type: "object" },
    }];
    expect(scanReferences({ $ref: "server.schema.json" }, "bundle", dependencies)).toEqual([]);
    expect(scanReferences({ $ref: "https://schemas.example/server" }, "bundle", dependencies)).toEqual([]);
    const prepared = prepareSchemas({ $ref: "server.schema.json" }, "config.schema.json", dependencies);
    expect((prepared.primary as { $ref: string }).$ref).toBe("https://schemas.example/server");
  });

  it("reports unresolved and duplicate local identifiers explicitly", () => {
    expect(scanReferences({ $ref: "missing.json" }, "bundle", [])[0]?.ruleId).toBe("schema/ref-unresolved");
    expect(() => prepareSchemas({}, "root.json", [
      { fileName: "same.json", schema: { type: "string" } },
      { fileName: "same.json", schema: { type: "number" } },
    ])).toThrow(/duplicate.*same\.json/i);
  });
});
