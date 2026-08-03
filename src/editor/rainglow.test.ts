import { beforeEach, describe, expect, it } from "vitest";

import {
  DEFAULT_EDITOR_THEME,
  EDITOR_THEME_KEY,
  RAINGLOW_THEMES,
  loadEditorTheme,
  saveEditorTheme,
} from "./rainglow";

describe("Rainglow editor themes", () => {
  beforeEach(() => localStorage.clear());

  it("offers exactly ten light and ten dark themes", () => {
    expect(RAINGLOW_THEMES).toHaveLength(20);
    expect(RAINGLOW_THEMES.filter((theme) => theme.variant === "light")).toHaveLength(10);
    expect(RAINGLOW_THEMES.filter((theme) => theme.variant === "dark")).toHaveLength(10);
  });

  it("restores a persisted known theme", () => {
    saveEditorTheme("github-light");
    expect(loadEditorTheme()).toBe("github-light");
  });

  it("rejects unknown persisted values", () => {
    localStorage.setItem(EDITOR_THEME_KEY, "not-a-theme");
    expect(loadEditorTheme()).toBe(DEFAULT_EDITOR_THEME);
  });

  it("defines readable foreground and background colours for every theme", () => {
    for (const theme of RAINGLOW_THEMES) {
      expect(theme.colours.background).toMatch(/^#[0-9a-f]{6}$/i);
      expect(theme.colours.foreground).toMatch(/^#[0-9a-f]{6}$/i);
      expect(theme.colours.foreground).not.toBe(theme.colours.background);
    }
  });
});
