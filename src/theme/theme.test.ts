import { describe, expect, it } from "vitest";

import {
  applyThemePreference,
  loadThemePreference,
  resolveTheme,
  THEME_STORAGE_KEY,
} from "./theme";

describe("theme preferences", () => {
  it("resolves System from the current operating system preference", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  it("loads an explicit theme and rejects invalid stored values", () => {
    const storage = { getItem: () => "dark" } as Pick<Storage, "getItem">;
    const invalidStorage = { getItem: () => "sepia" } as Pick<Storage, "getItem">;

    expect(loadThemePreference(storage)).toBe("dark");
    expect(loadThemePreference(invalidStorage)).toBe("system");
  });

  it("applies and stores explicit themes, while System removes the override", () => {
    const root = document.documentElement;
    const storage = {
      setItem: vi.fn(),
      removeItem: vi.fn(),
    } as unknown as Pick<Storage, "setItem" | "removeItem">;

    applyThemePreference("dark", false, root, storage);
    expect(root.dataset.theme).toBe("dark");
    expect(root.style.colorScheme).toBe("dark");
    expect(storage.setItem).toHaveBeenCalledWith(THEME_STORAGE_KEY, "dark");

    applyThemePreference("system", false, root, storage);
    expect(root.dataset.theme).toBe("light");
    expect(storage.removeItem).toHaveBeenCalledWith(THEME_STORAGE_KEY);
  });
});
