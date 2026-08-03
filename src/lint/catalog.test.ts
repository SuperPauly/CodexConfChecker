import { describe, expect, it } from "vitest";

import { LINT_RULES } from "./catalog";

describe("lint rule catalog", () => {
  it("exposes every promised shared and format rule with actionable help", () => {
    const ids = new Set(LINT_RULES.map((rule) => rule.id));
    expect(ids.size).toBe(LINT_RULES.length);
    for (const required of [
      "shared/trailing-whitespace",
      "shared/final-newline",
      "shared/max-line-length",
      "json/duplicate-key",
      "json/key-ordering",
      "yaml/anchors",
      "yaml/truthy",
      "yaml/quoted-strings",
      "toml/key-naming",
      "toml/homogeneous-arrays",
    ]) expect(ids).toContain(required);
    for (const rule of LINT_RULES) {
      expect(rule.description.length).toBeGreaterThan(12);
      expect(rule.rationale.length).toBeGreaterThan(12);
      expect(rule.badExample).not.toBe("");
      expect(rule.goodExample).not.toBe("");
    }
  });
});
