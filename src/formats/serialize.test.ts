import { describe, expect, it, vi } from "vitest";

import type { TomlEngine } from "../taplo/service";
import { serializeConfig } from "./serialize";

const engine: TomlEngine = {
  validate: vi.fn(async () => ({ diagnostics: [] })),
  format: vi.fn((source: string) => source),
  decode: vi.fn(() => ({})),
  encode: vi.fn(() => 'model = "gpt-5"\n'),
};

describe("serializeConfig", () => {
  it("serializes indented JSON with a final newline", () => {
    expect(serializeConfig({ model: "gpt-5" }, "json", engine)).toBe('{\n  "model": "gpt-5"\n}\n');
  });

  it("serializes YAML with a final newline", () => {
    expect(serializeConfig({ model: "gpt-5" }, "yaml", engine)).toBe("model: gpt-5\n");
  });

  it("uses Taplo to encode and format TOML", () => {
    expect(serializeConfig({ model: "gpt-5" }, "toml", engine)).toBe('model = "gpt-5"\n');
    expect(engine.encode).toHaveBeenCalledWith({ model: "gpt-5" });
  });
});
