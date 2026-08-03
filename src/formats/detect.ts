import type { ConfigFormat } from "./types";

export interface FormatDetection {
  readonly format: ConfigFormat | undefined;
  readonly confidence: "extension" | "content" | "none";
  readonly ambiguous: boolean;
}

const EXTENSIONS: Readonly<Record<string, ConfigFormat>> = {
  json: "json",
  yaml: "yaml",
  yml: "yaml",
  toml: "toml",
};

export function detectFormat(fileName: string | undefined, source: string): FormatDetection {
  const extension = fileName?.toLowerCase().match(/\.([^.]+)$/)?.[1];
  if (extension && EXTENSIONS[extension]) {
    return { format: EXTENSIONS[extension], confidence: "extension", ambiguous: false };
  }
  const trimmed = source.trim();
  if (!trimmed) return { format: undefined, confidence: "none", ambiguous: true };
  if (/^[{[]/.test(trimmed)) {
    return { format: "json", confidence: "content", ambiguous: false };
  }
  const firstMeaningful = trimmed.split(/\r?\n/).find((line) => !/^\s*(?:#|$)/.test(line)) ?? "";
  if (/^\s*(?:\[[^\]]+\]\s*$|[A-Za-z0-9_."'-]+\s*=)/.test(firstMeaningful)) {
    return { format: "toml", confidence: "content", ambiguous: false };
  }
  if (/^\s*(?:---\s*$|[-?]?\s*[A-Za-z0-9_."']+\s*:)/.test(firstMeaningful)) {
    return { format: "yaml", confidence: "content", ambiguous: false };
  }
  return { format: undefined, confidence: "none", ambiguous: true };
}
