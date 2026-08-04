import { beforeEach, describe, expect, it } from "vitest";

import {
  DEFAULT_EDITOR_THEME,
  EDITOR_THEME_KEY,
  RAINGLOW_THEMES,
  applyRainglowTheme,
  loadEditorTheme,
  saveEditorTheme,
} from "./rainglow";

describe("Rainglow editor themes", () => {
  beforeEach(() => localStorage.clear());

  it("offers ten light and twenty-two dark themes", () => {
    expect(RAINGLOW_THEMES).toHaveLength(32);
    expect(RAINGLOW_THEMES.filter((theme) => theme.variant === "light")).toHaveLength(10);
    expect(RAINGLOW_THEMES.filter((theme) => theme.variant === "dark")).toHaveLength(22);
    expect(RAINGLOW_THEMES.map((theme) => theme.name)).toEqual(expect.arrayContaining(["Peacock", "Peacocks in Space", "Rainbow", "Solarflare", "Mint Chocolate", "Horizon"]));
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

  it("applies Azure colours to the complete application token set", () => {
    const root = document.documentElement;
    const theme = applyRainglowTheme("azure", root);

    expect(theme.id).toBe("azure");
    expect(root.dataset.rainglowTheme).toBe("azure");
    expect(root.style.colorScheme).toBe("dark");
    expect(root.style.getPropertyValue("--page")).toBe("#181d26");
    expect(root.style.getPropertyValue("--text")).toBe("#ffffff");
    expect(root.style.getPropertyValue("--focus")).toBe("#52708b");
    expect(root.style.getPropertyValue("--surface")).toContain("#181d26");
    expect(root.style.getPropertyValue("--danger")).toBe("#ff8585");
    expect(root.style.getPropertyValue("--warning")).toBe("#f0bd55");
    expect(root.style.getPropertyValue("--info")).toBe("#7dbbfa");
  });

  it("applies a light Rainglow preset to the complete application", () => {
    const root = document.documentElement;
    applyRainglowTheme("github-light", root);

    expect(root.dataset.rainglowTheme).toBe("github-light");
    expect(root.style.colorScheme).toBe("light");
    expect(root.style.getPropertyValue("--page")).toBe("#ffffff");
    expect(root.style.getPropertyValue("--text")).toBe("#555555");
    expect(root.style.getPropertyValue("--focus")).toBe("#008080");
  });
});
