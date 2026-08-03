import { describe, expect, it } from "vitest";

import { displayValue, rangeFromOffsets } from "./location";

describe("diagnostic locations", () => {
  it("maps UTF-16 offsets to one based line and column positions", () => {
    expect(rangeFromOffsets("name: Paul\nage: 42\n", 11, 14)).toEqual({
      from: 11,
      to: 14,
      line: 2,
      column: 1,
      endLine: 2,
      endColumn: 4,
    });
  });

  it("clamps invalid offsets instead of reporting impossible positions", () => {
    expect(rangeFromOffsets("abc", -4, 99)).toEqual({
      from: 0,
      to: 3,
      line: 1,
      column: 1,
      endLine: 1,
      endColumn: 4,
    });
  });

  it("summarizes structured values without vague object coercion", () => {
    expect(displayValue({ enabled: true })).toBe('{"enabled":true}');
    expect(displayValue(undefined)).toBe("undefined");
  });

  it("does not truncate diagnostic values by default", () => {
    const value = { content: "x".repeat(300) };
    expect(displayValue(value)).toBe(JSON.stringify(value));
    expect(displayValue(value)).not.toContain("…");
  });
});
