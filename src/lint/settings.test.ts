import { beforeEach, describe, expect, it } from "vitest";

import {
  DEFAULT_LINT_SETTINGS,
  LINT_SETTINGS_KEY,
  exportLintSettings,
  loadLintSettings,
  parseLintSettings,
  saveLintSettings,
} from "./settings";

describe("lint settings", () => {
  beforeEach(() => localStorage.clear());

  it("round trips validated settings", () => {
    const settings = structuredClone(DEFAULT_LINT_SETTINGS);
    settings["shared/max-line-length"] = { severity: "error", options: { length: 100 } };
    saveLintSettings(settings);

    expect(loadLintSettings()["shared/max-line-length"]).toEqual({ severity: "error", options: { length: 100 } });
    expect(parseLintSettings(exportLintSettings(settings))).toEqual(settings);
  });

  it("rejects unknown rules, severities, and invalid options", () => {
    expect(() => parseLintSettings({ "unknown/rule": { severity: "error", options: {} } })).toThrow(/unknown rule/i);
    expect(() => parseLintSettings({ "shared/max-line-length": { severity: "fatal", options: { length: 80 } } })).toThrow(/severity/i);
    expect(() => parseLintSettings({ "shared/max-line-length": { severity: "warning", options: { length: 2 } } })).toThrow(/length/i);
  });

  it("falls back without replacing storage when saved JSON is invalid", () => {
    localStorage.setItem(LINT_SETTINGS_KEY, "not json");
    expect(loadLintSettings()).toEqual(DEFAULT_LINT_SETTINGS);
    expect(localStorage.getItem(LINT_SETTINGS_KEY)).toBe("not json");
  });
});
