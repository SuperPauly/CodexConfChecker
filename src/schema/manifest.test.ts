import { describe, expect, it } from "vitest";

import { parseSchemaManifest, schemaAssetUrl } from "./manifest";

describe("parseSchemaManifest", () => {
  it("accepts stable and alpha entries", () => {
    const manifest = parseSchemaManifest({
      generatedAt: "2026-08-02T12:00:00Z",
      channels: {
        stable: {
          version: "0.146.0",
          tag: "rust-v0.146.0",
          sha256: "a".repeat(64),
          sourceUrl: "https://github.com/openai/codex",
        },
        alpha: {
          version: "0.147.0-alpha.4",
          tag: "rust-v0.147.0-alpha.4",
          sha256: "b".repeat(64),
          sourceUrl: "https://github.com/openai/codex",
        },
      },
    });

    expect(manifest.channels.alpha.version).toBe("0.147.0-alpha.4");
  });

  it("rejects a manifest without both channels", () => {
    expect(() =>
      parseSchemaManifest({ generatedAt: "x", channels: {} }),
    ).toThrow("stable");
  });

  it("builds a GitHub Pages safe schema URL", () => {
    expect(schemaAssetUrl("stable")).toBe(
      `${import.meta.env.BASE_URL}schemas/stable/config.schema.json`,
    );
  });
});
