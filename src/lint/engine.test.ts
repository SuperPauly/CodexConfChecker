import { describe, expect, it } from "vitest";

import { JsonAdapter } from "../formats/json";
import { YamlAdapter } from "../formats/yaml";
import { lintDocument } from "./engine";
import { DEFAULT_LINT_SETTINGS } from "./settings";

describe("lintDocument", () => {
  it("reports shared whitespace, final newline, and line length precisely", () => {
    const source = `name: ${"x".repeat(20)}  `;
    const settings = structuredClone(DEFAULT_LINT_SETTINGS);
    settings["shared/max-line-length"] = { severity: "warning", options: { length: 12 } };
    const diagnostics = lintDocument(source, new YamlAdapter().parse(source), "yaml", settings);

    expect(diagnostics.map((item) => item.ruleId)).toEqual(expect.arrayContaining([
      "shared/trailing-whitespace",
      "shared/final-newline",
      "shared/max-line-length",
    ]));
    expect(diagnostics.every((item) => item.explanation && item.suggestion)).toBe(true);
  });

  it("checks JSON object ordering and empty collections with configured severity", () => {
    const source = '{"z":{},"a":[]}\n';
    const parsed = new JsonAdapter().parse(source);
    const settings = structuredClone(DEFAULT_LINT_SETTINGS);
    settings["json/key-ordering"] = { severity: "error", options: { order: "ascending" } };
    settings["json/empty-collections"] = { severity: "info", options: { allowObjects: false, allowArrays: false } };
    const diagnostics = lintDocument(source, parsed, "json", settings);

    expect(diagnostics.find((item) => item.ruleId === "json/key-ordering")?.severity).toBe("error");
    expect(diagnostics.filter((item) => item.ruleId === "json/empty-collections")).toHaveLength(2);
  });

  it("explains risky YAML truthy values, missing document markers, and indentation", () => {
    const source = "enabled: YES\n child: value\n";
    const parsed = new YamlAdapter().parse(source);
    const settings = structuredClone(DEFAULT_LINT_SETTINGS);
    settings["yaml/document-markers"] = { severity: "warning", options: { start: true, end: false } };
    const diagnostics = lintDocument(source, parsed, "yaml", settings);

    expect(diagnostics.some((item) => item.ruleId === "yaml/truthy" && item.actual === "YES")).toBe(true);
    expect(diagnostics.some((item) => item.ruleId === "yaml/document-markers")).toBe(true);
    expect(diagnostics.some((item) => item.ruleId === "yaml/indentation")).toBe(true);
  });

  it("enforces configured YAML boundary empty lines", () => {
    const source = "\n\nname: Paul\n\n\n";
    const parsed = new YamlAdapter().parse(source);
    const settings = structuredClone(DEFAULT_LINT_SETTINGS);
    settings["yaml/empty-lines"] = { severity: "warning", options: { start: 0, end: 1 } };
    const diagnostics = lintDocument(source, parsed, "yaml", settings).filter((item) => item.ruleId === "yaml/empty-lines");
    expect(diagnostics).toHaveLength(2);
    expect(diagnostics.every((item) => item.suggestion?.includes("Remove"))).toBe(true);
  });

  it("checks TOML key naming and mixed array element types", () => {
    const source = 'BadKey = [1, "two"]\n';
    const parsed = {
      value: { BadKey: [1, "two"] },
      diagnostics: [],
      locations: new Map(),
    };
    const settings = structuredClone(DEFAULT_LINT_SETTINGS);
    settings["toml/key-naming"] = { severity: "warning", options: { pattern: "^[a-z][a-z0-9_]*$" } };
    settings["toml/homogeneous-arrays"] = { severity: "error", options: {} };
    const diagnostics = lintDocument(source, parsed, "toml", settings);

    expect(diagnostics.find((item) => item.ruleId === "toml/key-naming")?.actual).toBe("BadKey");
    expect(diagnostics.find((item) => item.ruleId === "toml/homogeneous-arrays")?.expected).toContain("one value type");
  });
});
