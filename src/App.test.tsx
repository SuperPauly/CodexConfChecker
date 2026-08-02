import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";

import { ValidatorWorkbench } from "./App";
import type { TomlEngine } from "./taplo/service";
import type { SchemaManifest } from "./types/schema";

vi.mock("@uiw/react-codemirror", async () => {
  const React = await import("react");
  return {
    default: ({ value, onChange, onBlur }: Record<string, unknown>) =>
      React.createElement("textarea", {
        "aria-label": "Codex TOML editor",
        value,
        onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) =>
          (onChange as (nextValue: string) => void)(event.target.value),
        onBlur,
      }),
  };
});

const manifest: SchemaManifest = {
  generatedAt: "2026-08-02T22:15:00Z",
  channels: {
    stable: {
      version: "v0.146.0",
      tag: "rust-v0.146.0",
      sha256: "a".repeat(64),
      sourceUrl: "https://example.test/stable.json",
    },
    alpha: {
      version: "v0.147.0-alpha.4",
      tag: "rust-v0.147.0-alpha.4",
      sha256: "b".repeat(64),
      sourceUrl: "https://example.test/alpha.json",
    },
  },
};

function createEngine() {
  return {
    validate: vi.fn(async () => ({ diagnostics: [] })),
    format: vi.fn((toml: string) => `${toml.trim()}\n`),
  } satisfies TomlEngine;
}

describe("ValidatorWorkbench", () => {
  afterEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.theme;
  });

  it("shows release versions and selects stable by default", () => {
    render(<ValidatorWorkbench engine={createEngine()} manifest={manifest} />);

    expect(screen.getByRole("radio", { name: /stable.*v0\.146\.0/i })).toBeChecked();
    expect(screen.getByRole("radio", { name: /alpha.*v0\.147\.0-alpha\.4/i })).not.toBeChecked();
  });

  it("does not validate ordinary typing, then validates on blur", async () => {
    const user = userEvent.setup();
    const engine = createEngine();
    render(<ValidatorWorkbench engine={engine} manifest={manifest} />);

    const editor = screen.getByRole("textbox", { name: /codex toml editor/i });
    await user.type(editor, "x");
    expect(engine.validate).not.toHaveBeenCalled();

    fireEvent.blur(editor);
    await waitFor(() => expect(engine.validate).toHaveBeenCalled());
  });

  it("validates against alpha immediately when its radio is selected", async () => {
    const user = userEvent.setup();
    const engine = createEngine();
    render(<ValidatorWorkbench engine={engine} manifest={manifest} />);

    await user.click(screen.getByRole("radio", { name: /alpha/i }));

    await waitFor(() => {
      expect(engine.validate).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining("/schemas/alpha/config.schema.json"),
      );
    });
  });

  it("formats with Taplo and validates the formatted result", async () => {
    const user = userEvent.setup();
    const engine = createEngine();
    render(<ValidatorWorkbench engine={engine} manifest={manifest} />);

    const editor = screen.getByRole("textbox", { name: /codex toml editor/i });
    await user.clear(editor);
    await user.type(editor, 'model="gpt-5"');
    await user.click(screen.getByRole("button", { name: /format/i }));

    expect(engine.format).toHaveBeenCalledWith('model="gpt-5"');
    expect(editor).toHaveValue('model="gpt-5"\n');
    await waitFor(() => expect(engine.validate).toHaveBeenCalled());
  });

  it("preserves malformed TOML when Taplo refuses to format it", async () => {
    const user = userEvent.setup();
    const engine = createEngine();
    engine.format.mockImplementation(() => {
      throw new Error("unexpected end of string");
    });
    render(<ValidatorWorkbench engine={engine} manifest={manifest} />);

    const editor = screen.getByRole("textbox", { name: /codex toml editor/i });
    await user.clear(editor);
    await user.type(editor, 'model = "unterminated');
    await user.click(screen.getByRole("button", { name: /format/i }));

    expect(editor).toHaveValue('model = "unterminated');
    expect(screen.getByRole("alert")).toHaveTextContent(/unexpected end/i);
  });

  it("uploads a TOML file, validates it, and rejects another extension", async () => {
    const user = userEvent.setup();
    const engine = createEngine();
    render(<ValidatorWorkbench engine={engine} manifest={manifest} />);

    const input = screen.getByLabelText(/upload toml/i);
    await user.upload(input, new File(['model = "gpt-5"\n'], "config.toml"));
    await waitFor(() => expect(engine.validate).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("textbox", { name: /codex toml editor/i })).toHaveValue(
      'model = "gpt-5"\n',
    );

    fireEvent.change(input, {
      target: {
        files: [new File(["{}"], "config.json", { type: "application/json" })],
      },
    });
    expect(await screen.findByRole("alert")).toHaveTextContent(/\.toml/i);
    expect(engine.validate).toHaveBeenCalledTimes(1);
  });

  it("rejects an oversized TOML file without reading or validating it", () => {
    const engine = createEngine();
    render(<ValidatorWorkbench engine={engine} manifest={manifest} />);
    const oversized = new File([new Uint8Array(2 * 1024 * 1024 + 1)], "config.toml");

    fireEvent.change(screen.getByLabelText(/upload toml/i), {
      target: { files: [oversized] },
    });

    expect(screen.getByRole("alert")).toHaveTextContent(/2 MiB/i);
    expect(engine.validate).not.toHaveBeenCalled();
  });

  it("copies the current TOML and clears the editor", async () => {
    const user = userEvent.setup();
    render(<ValidatorWorkbench engine={createEngine()} manifest={manifest} />);
    const editor = screen.getByRole("textbox", { name: /codex toml editor/i });
    await user.clear(editor);
    await user.type(editor, 'model = "gpt-5"');

    await user.click(screen.getByRole("button", { name: /copy/i }));
    expect(await navigator.clipboard.readText()).toBe('model = "gpt-5"');
    await user.click(screen.getByRole("button", { name: /clear/i }));
    expect(editor).toHaveValue("");
  });

  it("does not let an older validation overwrite the newest result", async () => {
    const user = userEvent.setup();
    let resolveFirst!: (value: Awaited<ReturnType<TomlEngine["validate"]>>) => void;
    let resolveSecond!: (value: Awaited<ReturnType<TomlEngine["validate"]>>) => void;
    const first = new Promise<Awaited<ReturnType<TomlEngine["validate"]>>>((resolve) => {
      resolveFirst = resolve;
    });
    const second = new Promise<Awaited<ReturnType<TomlEngine["validate"]>>>((resolve) => {
      resolveSecond = resolve;
    });
    const engine: TomlEngine = {
      validate: vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(second),
      format: vi.fn((toml: string) => toml),
    };
    render(<ValidatorWorkbench engine={engine} manifest={manifest} />);

    await user.click(screen.getByRole("button", { name: /^validate$/i }));
    await user.click(screen.getByRole("radio", { name: /alpha/i }));
    resolveSecond({ diagnostics: [] });
    expect(await screen.findByText(/valid for v0\.147\.0-alpha\.4/i)).toBeVisible();

    resolveFirst({
      diagnostics: [{ from: 0, to: 4, message: "Old result", severity: "error" }],
    });
    await Promise.resolve();
    expect(screen.queryByText("Old result")).not.toBeInTheDocument();
    expect(screen.getByText(/valid for v0\.147\.0-alpha\.4/i)).toBeVisible();
  });

  it("switches between System, Light, and Dark themes and persists an explicit choice", async () => {
    const user = userEvent.setup();
    render(<ValidatorWorkbench engine={createEngine()} manifest={manifest} />);

    const theme = screen.getByRole("group", { name: /theme/i });
    expect(theme).toBeVisible();
    await user.click(screen.getByRole("button", { name: /dark/i }));

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem("codex-config-checker-theme")).toBe("dark");
    expect(screen.getByRole("button", { name: /dark/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});
