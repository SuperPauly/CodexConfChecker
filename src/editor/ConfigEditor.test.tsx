import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ConfigEditor } from "./ConfigEditor";

describe("ConfigEditor", () => {
  it("labels the selected language and decorates each diagnostic severity", () => {
    const { container, rerender } = render(
      <ConfigEditor
        diagnostics={[{
          from: 0,
          to: 4,
          line: 1,
          column: 1,
          endLine: 1,
          endColumn: 5,
          severity: "warning",
          source: "lint",
          ruleId: "shared/trailing-whitespace",
          message: "Trailing whitespace.",
          explanation: "Whitespace appears after the final token.",
        }]}
        language="yaml"
        onChange={vi.fn()}
        onCreateEditor={vi.fn()}
        onValidationTrigger={vi.fn()}
        themeId="azure"
        value={'name: "Paul"'}
      />,
    );

    expect(screen.getByRole("textbox", { name: "YAML configuration editor" })).toBeInTheDocument();
    expect(container.querySelector(".cm-warning-line")).toBeInTheDocument();

    rerender(
      <ConfigEditor
        diagnostics={[]}
        language="json"
        onChange={vi.fn()}
        onCreateEditor={vi.fn()}
        onValidationTrigger={vi.fn()}
        themeId="github-light"
        value='{"name":"Paul"}'
      />,
    );
    expect(screen.getByRole("textbox", { name: "JSON configuration editor" })).toBeInTheDocument();
  });
});
