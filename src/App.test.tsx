import { render, screen } from "@testing-library/react";

import { ApplicationWorkbench } from "./App";
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
  it("renders one unified workbench without validator mode tabs", () => {
    render(<ApplicationWorkbench engine={engine} manifest={manifest} />);
    expect(screen.getByRole("heading", { name: "Config Schema Workbench" })).toBeVisible();
    expect(screen.getByLabelText(/program/i)).toHaveValue("codex");
    expect(screen.getByRole("button", { name: /select version/i })).toBeVisible();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
  });
});
