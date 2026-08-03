import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import type { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { tags } from "@lezer/highlight";

export const EDITOR_THEME_KEY = "codex-config-checker.editor-theme";
export const DEFAULT_EDITOR_THEME = "azure";

export interface RainglowTheme {
  readonly id: string;
  readonly name: string;
  readonly variant: "light" | "dark";
  readonly colours: {
    readonly background: string;
    readonly foreground: string;
    readonly comment: string;
    readonly property: string;
    readonly string: string;
    readonly number: string;
    readonly keyword: string;
    readonly type: string;
    readonly accent: string;
  };
}

function palette(
  id: string,
  name: string,
  variant: "light" | "dark",
  background: string,
  foreground: string,
  comment: string,
  property: string,
  string: string,
  number: string,
  keyword: string,
  type: string,
  accent: string,
): RainglowTheme {
  return {
    id,
    name,
    variant,
    colours: { background, foreground, comment, property, string, number, keyword, type, accent },
  };
}

export const RAINGLOW_THEMES = [
  palette("azure", "Azure", "dark", "#181d26", "#ffffff", "#414d62", "#508aaa", "#64aeb3", "#64aeb3", "#508aaa", "#6ab0a3", "#52708b"),
  palette("carbonight", "Carbonight", "dark", "#2e2c2b", "#b0b0b0", "#423f3d", "#ffffff", "#ffffff", "#b0b0b0", "#eeeeee", "#c4c4c4", "#8c8c8c"),
  palette("darkside", "Darkside", "dark", "#222324", "#bababa", "#494b4d", "#68c244", "#f2d42c", "#8e69c9", "#f08d24", "#1cc3e8", "#e8341c"),
  palette("downpour", "Downpour", "dark", "#2c323d", "#d6dbdb", "#625e77", "#91b9c9", "#63a5a5", "#4eadad", "#abaab7", "#bc4331", "#908bbc"),
  palette("earthsong", "Earthsong", "dark", "#36312c", "#ebd1b7", "#7a7267", "#60a365", "#f8bb39", "#f8bb39", "#db784d", "#95cc5e", "#db784d"),
  palette("frontier", "Frontier", "dark", "#36312c", "#f8f8f2", "#7a7267", "#f8bb39", "#f8bb39", "#2ebf7e", "#fc803d", "#2ebf7e", "#f23a3a"),
  palette("gloom", "Gloom", "dark", "#2a332b", "#d8ebe5", "#4f6e64", "#bcd42a", "#bcd42a", "#bcd42a", "#26a6a6", "#26a6a6", "#ff5d38"),
  palette("glowfish", "Glowfish", "dark", "#191f13", "#6ea240", "#3c4e2d", "#60a365", "#f8bb39", "#95cc5e", "#d65940", "#95cc5e", "#db784d"),
  palette("grunge", "Grunge", "dark", "#31332c", "#f8f8f2", "#5c634f", "#ffc48c", "#d1f2a5", "#f56991", "#91a374", "#d1f2a5", "#f56991"),
  palette("halflife", "Half Life", "dark", "#222222", "#cccccc", "#555555", "#f9d423", "#f9d423", "#f9d423", "#7d8991", "#fc913a", "#7d8991"),
  palette("absent-light", "Absent Light", "light", "#ffffff", "#465360", "#aeb9c4", "#465360", "#478e5f", "#61bcc6", "#228a96", "#228a96", "#6ba77f"),
  palette("allure-light", "Allure Light", "light", "#ffffff", "#555e68", "#b5c0cc", "#555e68", "#cec86f", "#cea36f", "#5da892", "#5da892", "#e4d294"),
  palette("azure-light", "Azure Light", "light", "#ffffff", "#444444", "#aaaaaa", "#508aaa", "#64aeb3", "#64aeb3", "#508aaa", "#6ab0a3", "#8291ad"),
  palette("banner-light", "Banner Light", "light", "#ffffff", "#373247", "#d2d0db", "#373247", "#9db515", "#9db515", "#7cd827", "#7cd827", "#a25cdb"),
  palette("blink-light", "Blink Light", "light", "#ffffff", "#6a7e89", "#a6b4bc", "#43b5b3", "#84c4ce", "#529ca8", "#d4856a", "#5298c4", "#d4856a"),
  palette("brave-light", "Brave Light", "light", "#f7f9f9", "#2c2d2d", "#ccc9e0", "#6e909e", "#63a5a5", "#4eadad", "#abaab7", "#bc4331", "#7873a0"),
  palette("crisp-light", "Crisp Light", "light", "#ffffff", "#221a22", "#c6a7c6", "#fc6a0f", "#fc9a0f", "#fc9a0f", "#fc6a0f", "#99769b", "#765478"),
  palette("github-light", "GitHub Light", "light", "#ffffff", "#555555", "#b8b6b1", "#dd1144", "#dd1144", "#dd1144", "#555555", "#445588", "#008080"),
  palette("glowfish-light", "Glowfish Light", "light", "#e3eadc", "#191f13", "#3c4e2d", "#60a365", "#f8bb39", "#95cc5e", "#d65940", "#95cc5e", "#db784d"),
  palette("earthsong-light", "Earthsong Light", "light", "#ffffff", "#4d463e", "#d6cab9", "#60a365", "#f8bb39", "#f8bb39", "#db784d", "#95cc5e", "#db784d"),
] as const satisfies readonly RainglowTheme[];

export type RainglowThemeId = (typeof RAINGLOW_THEMES)[number]["id"];

export function isRainglowThemeId(value: string): value is RainglowThemeId {
  return RAINGLOW_THEMES.some((theme) => theme.id === value);
}

export function loadEditorTheme(): RainglowThemeId {
  const value = localStorage.getItem(EDITOR_THEME_KEY);
  return value && isRainglowThemeId(value) ? value : DEFAULT_EDITOR_THEME;
}

export function saveEditorTheme(themeId: RainglowThemeId): void {
  localStorage.setItem(EDITOR_THEME_KEY, themeId);
}

export function editorThemeExtension(themeId: RainglowThemeId): Extension {
  const theme = RAINGLOW_THEMES.find((candidate) => candidate.id === themeId) ?? RAINGLOW_THEMES[0];
  const { colours } = theme;
  const accentSoft = `${colours.accent}33`;
  const gutter = theme.variant === "dark" ? "#00000028" : "#0000000a";
  return [
    EditorView.theme(
      {
        "&": { color: colours.foreground, backgroundColor: colours.background },
        ".cm-content": { caretColor: colours.foreground },
        ".cm-cursor, .cm-dropCursor": { borderLeftColor: colours.foreground },
        ".cm-gutters": { color: colours.comment, backgroundColor: gutter, borderRightColor: accentSoft },
        ".cm-activeLine, .cm-activeLineGutter": { backgroundColor: accentSoft },
        ".cm-selectionBackground, .cm-content ::selection": { backgroundColor: `${colours.accent}55 !important` },
      },
      { dark: theme.variant === "dark" },
    ),
    syntaxHighlighting(
      HighlightStyle.define([
        { tag: tags.comment, color: colours.comment },
        { tag: [tags.propertyName, tags.attributeName], color: colours.property },
        { tag: [tags.string, tags.special(tags.string)], color: colours.string },
        { tag: [tags.number, tags.bool, tags.null], color: colours.number },
        { tag: [tags.keyword, tags.operatorKeyword], color: colours.keyword },
        { tag: [tags.typeName, tags.className], color: colours.type },
        { tag: [tags.punctuation, tags.bracket], color: colours.foreground },
        { tag: tags.invalid, color: "#dc322f", textDecoration: "underline" },
      ]),
    ),
  ];
}
