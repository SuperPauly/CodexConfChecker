import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";

import type { TomlEngine } from "../taplo/service";
import { GenericWorkbench } from "./GenericWorkbench";

vi.mock("@uiw/react-codemirror", async () => {
  const React = await import("react");
  return { default: ({ value, onChange, onBlur, "aria-label": label }: Record<string, unknown>) => React.createElement("textarea", { "aria-label": label, value, onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => (onChange as (value: string) => void)(event.target.value), onBlur }) };
});

const engine: TomlEngine = {
  validate: vi.fn(async () => ({ diagnostics: [] })),
  format: vi.fn((source: string) => `${source.trim()}\n`),
  decode: vi.fn((source: string) => source.includes("bad") ? (() => { throw new Error("bad TOML"); })() : ({ port: 443 })),
};

describe("GenericWorkbench", () => {
  beforeEach(() => localStorage.clear());

  it("selects JSON, YAML, TOML, or automatic detection and offers all 20 themes", async () => {
    render(<GenericWorkbench engine={engine} />);
    expect(screen.getByLabelText(/configuration format/i)).toHaveValue("auto");
    expect(screen.getByLabelText(/website theme/i).querySelectorAll("option")).toHaveLength(20);
    await userEvent.selectOptions(screen.getByLabelText(/configuration format/i), "yaml");
    expect(screen.getByRole("textbox", { name: /yaml configuration editor/i })).toBeVisible();
  });

  it("validates a JSON value against an uploaded JSON Schema with precise detail", async () => {
    render(<GenericWorkbench engine={engine} />);
    const editor = screen.getByRole("textbox", { name: /json configuration editor/i });
    fireEvent.change(editor, { target: { value: '{"port":"443"}' } });
    await userEvent.upload(screen.getByLabelText(/upload primary json schema/i), new File([JSON.stringify({ $schema: "https://json-schema.org/draft/2020-12/schema", type: "object", properties: { port: { type: "integer" } } })], "config.schema.json", { type: "application/json" }));
    await userEvent.click(screen.getByRole("button", { name: /^validate$/i }));
    expect(await screen.findByText(/wrong value type.*expected integer/i)).toBeVisible();
    expect(screen.getByText(/replace the value with a valid integer/i)).toBeVisible();
  });

  it("loads a configuration file, detects YAML, and formats it", async () => {
    render(<GenericWorkbench engine={engine} />);
    await userEvent.upload(screen.getByLabelText(/upload configuration/i), new File(["port: 443\nname: test\n"], "config.yaml"));
    expect(await screen.findByRole("textbox", { name: /yaml configuration editor/i })).toHaveValue("port: 443\nname: test\n");
    await userEvent.click(screen.getByRole("button", { name: /format/i }));
    await waitFor(() => expect((screen.getByRole("textbox", { name: /yaml configuration editor/i }) as HTMLTextAreaElement).value).toContain("port: 443"));
  });

  it("supports uploaded local reference bundles and blocks them in internal mode", async () => {
    render(<GenericWorkbench engine={engine} />);
    await userEvent.upload(screen.getByLabelText(/upload primary json schema/i), new File([JSON.stringify({ $ref: "port.schema.json" })], "root.schema.json", { type: "application/json" }));
    await userEvent.upload(screen.getByLabelText(/upload schema dependencies/i), new File([JSON.stringify({ type: "object" })], "port.schema.json", { type: "application/json" }));
    await userEvent.click(screen.getByRole("button", { name: /^validate$/i }));
    expect(await screen.findByText(/blocked in internal only mode/i)).toBeVisible();
    fireEvent.click(screen.getByRole("radio", { name: /uploaded local bundle/i }));
    await userEvent.click(screen.getByRole("button", { name: /^validate$/i }));
    await waitFor(() => expect(screen.queryByText(/blocked in internal only mode/i)).not.toBeInTheDocument());
  });
});
