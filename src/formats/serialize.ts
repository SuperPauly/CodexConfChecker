import { stringify as stringifyYaml } from "yaml";

import type { TomlEngine } from "../taplo/service";
import type { ConfigFormat } from "./types";

function finalNewline(value: string): string {
  return value.endsWith("\n") ? value : `${value}\n`;
}

export function serializeConfig(value: unknown, format: ConfigFormat, engine: TomlEngine): string {
  if (format === "json") return `${JSON.stringify(value, null, 2)}\n`;
  if (format === "yaml") return finalNewline(stringifyYaml(value, { lineWidth: 100 }));
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new TypeError("TOML output requires an object at the document root.");
  return finalNewline(engine.format(engine.encode(value)));
}
