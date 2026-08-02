export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "codex-config-checker-theme";

export function resolveTheme(
  preference: ThemePreference,
  systemPrefersDark: boolean,
): ResolvedTheme {
  return preference === "system"
    ? systemPrefersDark
      ? "dark"
      : "light"
    : preference;
}

export function loadThemePreference(
  storage: Pick<Storage, "getItem"> = localStorage,
): ThemePreference {
  const stored = storage.getItem(THEME_STORAGE_KEY);
  return stored === "light" || stored === "dark" ? stored : "system";
}

export function applyThemePreference(
  preference: ThemePreference,
  systemPrefersDark: boolean,
  root: HTMLElement = document.documentElement,
  storage: Pick<Storage, "setItem" | "removeItem"> = localStorage,
): ResolvedTheme {
  const resolved = resolveTheme(preference, systemPrefersDark);
  root.dataset.theme = resolved;
  root.style.colorScheme = resolved;
  if (preference === "system") {
    storage.removeItem(THEME_STORAGE_KEY);
  } else {
    storage.setItem(THEME_STORAGE_KEY, preference);
  }
  return resolved;
}
