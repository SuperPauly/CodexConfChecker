import { describe, expect, it } from "vitest";

import { parseSchemaManifest, schemaAssetUrl } from "./manifest";

const version = {
  id: "stable-current",
  label: "Current stable",
  channel: "stable",
  version: "Current stable",
  sha256: "a".repeat(64),
  sourceUrl: "https://learn.chatgpt.com/docs/config-schema.json",
  assetPath: "schemas/codex/stable-current/config-schema.json",
  syncedAt: "2026-08-04T12:00:00Z",
};

describe("parseSchemaManifest", () => {
  it("accepts a program registry with ordered schema versions", () => {
    const manifest = parseSchemaManifest({
      generatedAt: "2026-08-04T12:00:00Z",
      programs: {
        codex: {
          name: "Codex CLI",
          defaultFormat: "toml",
          outputBaseName: "config",
          versions: [version, { ...version, id: "rust-v0.147.0-alpha.7", label: "v0.147.0-alpha.7", channel: "alpha", version: "v0.147.0-alpha.7", sha256: "b".repeat(64) }],
        },
      },
    });

    expect(manifest.programs.codex!.name).toBe("Codex CLI");
    expect(manifest.programs.codex!.versions[1]?.channel).toBe("alpha");
  });

  it("rejects unsafe or duplicate version asset paths", () => {
    const base = {
      generatedAt: "2026-08-04T12:00:00Z",
      programs: { codex: { name: "Codex CLI", defaultFormat: "toml", outputBaseName: "config", versions: [version] } },
    };
    expect(() => parseSchemaManifest({ ...base, programs: { codex: { ...base.programs.codex, versions: [{ ...version, assetPath: "../secret.json" }] } } })).toThrow(/assetPath/u);
    expect(() => parseSchemaManifest({ ...base, programs: { codex: { ...base.programs.codex, versions: [version, { ...version }] } } })).toThrow(/duplicate/u);
  });

  it("builds a GitHub Pages safe URL from a registry asset path", () => {
    expect(schemaAssetUrl(version)).toBe(`${import.meta.env.BASE_URL}schemas/codex/stable-current/config-schema.json`);
  });
});
