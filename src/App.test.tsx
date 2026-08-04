import { render, screen } from "@testing-library/react";

import { ApplicationWorkbench, DEFAULT_GA_MEASUREMENT_ID } from "./App";
import type { TomlEngine } from "./taplo/service";
import type { SchemaManifest } from "./types/schema";

const manifest: SchemaManifest = {
  generatedAt: "2026-08-04T12:00:00Z",
  programs: {
    codex: {
      name: "Codex CLI",
      defaultFormat: "toml",
      outputBaseName: "config",
      versions: [{
        id: "stable-current", label: "Current stable", channel: "stable", version: "Current stable",
        sha256: "a".repeat(64), sourceUrl: "https://learn.chatgpt.com/docs/config-schema.json",
        assetPath: "schemas/codex/stable-current/config-schema.json", syncedAt: "2026-08-04T12:00:00Z",
      }],
    },
  },
};

const engine: TomlEngine = {
  validate: async () => ({ diagnostics: [] }),
  format: (source) => source,
  decode: () => ({ model: "gpt-5" }),
  encode: () => 'model = "gpt-5"\n',
};

describe("ApplicationWorkbench", () => {
  it("uses the requested Google Analytics property by default", () => {
    expect(DEFAULT_GA_MEASUREMENT_ID).toBe("G-CET6VNKSBL");
  });

  it("renders one unified workbench without validator mode tabs", () => {
    render(<ApplicationWorkbench engine={engine} manifest={manifest} />);
    expect(screen.getByRole("heading", { name: "Check your config" })).toBeVisible();
    expect(screen.getByLabelText(/schema source/i)).toHaveValue("none");
    expect(screen.queryByLabelText(/^program$/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /select version/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
  });
});
