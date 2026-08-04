import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";

import type { TomlEngine } from "../taplo/service";
import type { SchemaManifest } from "../types/schema";
import { GenericWorkbench } from "./GenericWorkbench";

vi.mock("@uiw/react-codemirror", async () => {
  const React = await import("react");
  return { default: ({ value, onChange, onBlur, "aria-label": label }: Record<string, unknown>) => React.createElement("textarea", { "aria-label": label, value, onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => (onChange as (value: string) => void)(event.target.value), onBlur }) };
});

const engine: TomlEngine = {
  validate: vi.fn(async () => ({ diagnostics: [] })),
  format: vi.fn((source: string) => `${source.trim()}\n`),
  decode: vi.fn((source: string) => source.includes("bad") ? (() => { throw new Error("bad TOML"); })() : source.includes("max_threads") ? ({ agents: { max_threads: 8 } }) : source.includes("max_concurrent_threads_per_session") ? ({ agents: { max_concurrent_threads_per_session: 8 } }) : ({ port: 443 })),
  encode: vi.fn(() => "port = 443\n"),
};

const manifest: SchemaManifest = {
  generatedAt: "2026-08-04T12:00:00Z",
  programs: { codex: { name: "Codex CLI", defaultFormat: "toml", outputBaseName: "config", versions: [
    { id: "stable-current", label: "Current stable", channel: "stable", version: "Current stable", sha256: "a".repeat(64), sourceUrl: "https://learn.chatgpt.com/docs/config-schema.json", assetPath: "schemas/codex/stable-current/config-schema.json", syncedAt: "2026-08-04T12:00:00Z" },
    { id: "rust-v0.147.0-alpha.7", label: "v0.147.0-alpha.7", channel: "alpha", version: "v0.147.0-alpha.7", sha256: "b".repeat(64), sourceUrl: "https://example.test/alpha", assetPath: "schemas/codex/releases/rust-v0.147.0-alpha.7/config-schema.json", syncedAt: "2026-08-04T11:50:00Z" },
    { id: "rust-v0.147.0-alpha.6", label: "v0.147.0-alpha.6", channel: "archive", version: "v0.147.0-alpha.6", sha256: "c".repeat(64), sourceUrl: "https://example.test/older", assetPath: "schemas/codex/releases/rust-v0.147.0-alpha.6/config-schema.json", syncedAt: "2026-08-03T11:50:00Z" },
  ] } },
};

describe("GenericWorkbench", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ type: "object" }), { status: 200 })));
  });

  afterEach(() => vi.unstubAllGlobals());

  it("selects JSON, YAML, TOML, or automatic detection and offers all 20 themes", async () => {
    render(<GenericWorkbench engine={engine} manifest={manifest} />);
    expect(screen.getByLabelText(/configuration format/i)).toHaveValue("toml");
    expect(screen.getByLabelText(/website theme/i).querySelectorAll("option")).toHaveLength(20);
    await userEvent.selectOptions(screen.getByLabelText(/configuration format/i), "yaml");
    expect(screen.getByRole("textbox", { name: /yaml configuration editor/i })).toBeVisible();
  });

  it("validates a JSON value against an uploaded JSON Schema with precise detail", async () => {
    render(<GenericWorkbench engine={engine} manifest={manifest} />);
    await userEvent.selectOptions(screen.getByLabelText(/configuration format/i), "json");
    const editor = screen.getByRole("textbox", { name: /json configuration editor/i });
    fireEvent.change(editor, { target: { value: '{"port":"443"}' } });
    await userEvent.upload(screen.getByLabelText(/upload json schema/i), new File([JSON.stringify({ $schema: "https://json-schema.org/draft/2020-12/schema", type: "object", properties: { port: { type: "integer" } } })], "config.schema.json", { type: "application/json" }));
    await userEvent.click(screen.getByRole("button", { name: /^validate$/i }));
    expect(await screen.findByText(/wrong value type.*expected integer/i)).toBeVisible();
    expect(screen.getByText(/replace the value with a valid integer/i)).toBeVisible();
  });

  it("loads a configuration file, detects YAML, and formats it", async () => {
    render(<GenericWorkbench engine={engine} manifest={manifest} />);
    await userEvent.upload(screen.getByLabelText(/upload configuration/i), new File(["port: 443\nname: test\n"], "config.yaml"));
    expect(await screen.findByRole("textbox", { name: /yaml configuration editor/i })).toHaveValue("port: 443\nname: test\n");
    await userEvent.click(screen.getByRole("button", { name: /format/i }));
    await waitFor(() => expect((screen.getByRole("textbox", { name: /yaml configuration editor/i }) as HTMLTextAreaElement).value).toContain("port: 443"));
  });

  it("supports uploaded local reference bundles and blocks them in internal mode", async () => {
    render(<GenericWorkbench engine={engine} manifest={manifest} />);
    await userEvent.upload(screen.getByLabelText(/upload json schema/i), new File([JSON.stringify({ $ref: "port.schema.json" })], "root.schema.json", { type: "application/json" }));
    await userEvent.upload(screen.getByLabelText(/upload schema dependencies/i), new File([JSON.stringify({ type: "object" })], "port.schema.json", { type: "application/json" }));
    await userEvent.click(screen.getByRole("button", { name: /^validate$/i }));
    expect(await screen.findByText(/blocked in internal only mode/i)).toBeVisible();
    fireEvent.click(screen.getByRole("radio", { name: /uploaded local bundle/i }));
    await userEvent.click(screen.getByRole("button", { name: /^validate$/i }));
    await waitFor(() => expect(screen.queryByText(/blocked in internal only mode/i)).not.toBeInTheDocument());
  });

  it("opens a searchable version modal and loads the chosen archived schema", async () => {
    render(<GenericWorkbench engine={engine} manifest={manifest} />);
    await userEvent.click(screen.getByRole("button", { name: /select version/i }));
    expect(screen.getByRole("dialog", { name: /select codex cli schema version/i })).toBeVisible();
    expect(screen.getByRole("button", { name: /latest stable/i })).toBeVisible();
    expect(screen.getByRole("button", { name: /latest alpha/i })).toBeVisible();
    await userEvent.type(screen.getByLabelText(/search versions/i), "alpha.6");
    await userEvent.click(screen.getByRole("radio", { name: /v0\.147\.0-alpha\.6/i }));
    await userEvent.click(screen.getByRole("button", { name: /^load$/i }));
    expect(screen.getByText("v0.147.0-alpha.6", { selector: ".active-schema strong" })).toBeVisible();
  });

  it("disables tracked version selection while a custom schema is uploaded", async () => {
    render(<GenericWorkbench engine={engine} manifest={manifest} />);
    await userEvent.upload(screen.getByLabelText(/upload json schema/i), new File([JSON.stringify({ type: "object" })], "mine.schema.json", { type: "application/json" }));
    expect(screen.getByRole("button", { name: /select version/i })).toBeDisabled();
    expect(screen.getByText("mine.schema.json", { selector: ".active-schema strong" })).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: /remove custom schema/i }));
    expect(screen.getByRole("button", { name: /select version/i })).toBeEnabled();
  });

  it("enables converted downloads only after the current revision validates", async () => {
    render(<GenericWorkbench engine={engine} manifest={manifest} />);
    await userEvent.click(screen.getByRole("button", { name: /^download$/i }));
    expect(screen.getByRole("menuitem", { name: /json/i })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: /^validate$/i }));
    await waitFor(() => expect(screen.getByText(/valid against/i)).toBeVisible());
    expect(screen.getByRole("menuitem", { name: /json/i })).toBeEnabled();
    fireEvent.change(screen.getByRole("textbox", { name: /toml configuration editor/i }), { target: { value: 'model = "changed"\n' } });
    expect(screen.getByRole("menuitem", { name: /json/i })).toBeDisabled();
  });

  it("marks removed agents.max_threads as an unknown key and updates it in one click", async () => {
    const codexSchema = {
      $schema: "http://json-schema.org/draft-07/schema#",
      type: "object",
      properties: { agents: { $ref: "#/definitions/AgentsToml" } },
      definitions: {
        AgentRoleToml: { type: "object", properties: { description: { type: "string" } }, additionalProperties: false },
        AgentsToml: { type: "object", properties: { max_concurrent_threads_per_session: { type: "integer", minimum: 1 } }, additionalProperties: { $ref: "#/definitions/AgentRoleToml" } },
      },
      additionalProperties: false,
    };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(codexSchema), { status: 200 })));
    render(<GenericWorkbench engine={engine} manifest={manifest} />);
    const editor = screen.getByRole("textbox", { name: /toml configuration editor/i });
    fireEvent.change(editor, { target: { value: "[agents]\nmax_threads = 8\n" } });
    await userEvent.click(screen.getByRole("button", { name: /^validate$/i }));
    expect(await screen.findByText(/not declared by the selected schema/i)).toBeVisible();
    expect(screen.getByText(/not declared by the selected schema/i).closest("li")).toHaveClass("problem-kind-unknown-key");
    await userEvent.click(screen.getByRole("button", { name: /update key/i }));
    expect(editor).toHaveValue("[agents]\nmax_concurrent_threads_per_session = 8\n");
    await waitFor(() => expect(screen.queryByText(/not declared by the selected schema/i)).not.toBeInTheDocument());
  });
});
