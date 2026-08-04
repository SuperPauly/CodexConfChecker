import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";

import type { Diagnostic } from "../diagnostics/types";
import { ProblemsPanel } from "./ProblemsPanel";

const diagnostics: Diagnostic[] = [{
  from: 7, to: 12, line: 2, column: 3, endLine: 2, endColumn: 8,
  severity: "error", source: "schema", ruleId: "schema/type",
  message: "Wrong value type at `/port`: expected integer.",
  explanation: "The value is text but the schema requires an integer.",
  suggestion: "Replace the quoted text with a whole number.",
  expected: "integer", actual: '"443"', dataPath: "/port", schemaPath: "#/properties/port/type",
}];

const warning: Diagnostic = {
  from: 20, to: 21, line: 3, column: 1, endLine: 3, endColumn: 2,
  severity: "warning", source: "lint", ruleId: "lint/example",
  message: "Warning message", explanation: "Complete warning explanation.",
};

const information: Diagnostic = {
  from: 0, to: 0, line: 1, column: 1, endLine: 1, endColumn: 1,
  hasSourceLocation: false,
  severity: "info", source: "schema", ruleId: "schema/format-annotation",
  message: "Custom format treated as annotation", explanation: "Complete information explanation.",
};

it("shows actionable diagnostic detail and navigates to the source", async () => {
  const onVisit = vi.fn();
  render(<ProblemsPanel diagnostics={diagnostics} onVisit={onVisit} />);
  expect(screen.getByText(/wrong value type/i)).toBeVisible();
  expect(screen.getByText(/replace the quoted text/i)).toBeVisible();
  expect(screen.getByText(/expected: integer/i)).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: /go to line 2/i }));
  expect(onVisit).toHaveBeenCalledWith(diagnostics[0]);
});

it("offers a one click source update for deprecated keys", async () => {
  const deprecated: Diagnostic = {
    ...diagnostics[0]!,
    severity: "error",
    ruleId: "codex/deprecated-key",
    kind: "unknown-key",
    message: "Deprecated key `agents.max_threads`.",
    fix: { label: "Update key", from: 7, to: 18, replacement: "max_concurrent_threads_per_session" },
  };
  const onFix = vi.fn();
  render(<ProblemsPanel diagnostics={[deprecated]} onFix={onFix} onVisit={() => undefined} />);
  await userEvent.click(screen.getByRole("button", { name: /update key/i }));
  expect(onFix).toHaveBeenCalledWith(deprecated);
});

it("filters by severity", async () => {
  render(<ProblemsPanel diagnostics={diagnostics} onVisit={() => undefined} />);
  await userEvent.selectOptions(screen.getByLabelText(/severity filter/i), "warning");
  expect(screen.getByText(/no problems match/i)).toBeVisible();
});

it("groups findings by severity with errors open and other groups collapsible", async () => {
  render(<ProblemsPanel diagnostics={[...diagnostics, warning, information]} onVisit={() => undefined} />);

  expect(screen.getByRole("button", { name: /errors.*1/i })).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByText(/value is text/i)).toBeVisible();
  expect(screen.getByRole("button", { name: /warnings.*1/i })).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByText(/complete warning explanation/i)).not.toBeInTheDocument();

  await userEvent.click(screen.getByRole("button", { name: /expand all/i }));
  expect(screen.getByText(/complete warning explanation/i)).toBeVisible();
  expect(screen.getByText(/complete information explanation/i)).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: /collapse all/i }));
  expect(screen.queryByText(/value is text/i)).not.toBeInTheDocument();
});

it("shows complete metadata without truncation and omits false source locations", async () => {
  const actual = `{"content":"${"x".repeat(300)}"}`;
  render(<ProblemsPanel diagnostics={[{ ...diagnostics[0]!, actual }, information]} onVisit={() => undefined} />);

  expect(screen.getByText(`Actual: ${actual}`)).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: /expand all/i }));
  expect(screen.queryByRole("button", { name: /go to line 1/i })).not.toBeInTheDocument();
});

it("copies a complete plain text diagnostic report", async () => {
  const writes: string[] = [];
  const writeText = vi.fn(async (value: string) => { writes.push(value); });
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  render(<ProblemsPanel diagnostics={[...diagnostics, warning]} onVisit={() => undefined} />);
  await userEvent.click(screen.getByRole("button", { name: /copy report/i }));

  expect(writeText).toHaveBeenCalledOnce();
  const report = writes[0] ?? "";
  expect(report).toContain("ERROR · schema · schema/type · Ln 2:3");
  expect(report).toContain("Why: The value is text but the schema requires an integer.");
  expect(report).toContain("Fix: Replace the quoted text with a whole number.");
  expect(report).toContain("WARNING · lint · lint/example · Ln 3:1");
});
