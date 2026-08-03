import { json } from "@codemirror/lang-json";
import { yaml } from "@codemirror/lang-yaml";
import { StreamLanguage } from "@codemirror/language";
import { toml } from "@codemirror/legacy-modes/mode/toml";
import type { Extension } from "@codemirror/state";

export type EditorLanguage = "json" | "yaml" | "toml";

export function languageExtension(language: EditorLanguage): Extension {
  if (language === "json") return json();
  if (language === "yaml") return yaml();
  return StreamLanguage.define(toml);
}

export function languageLabel(language: EditorLanguage): string {
  return language === "json" ? "JSON" : language === "yaml" ? "YAML" : "TOML";
}
