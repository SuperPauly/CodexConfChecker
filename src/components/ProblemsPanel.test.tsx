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

it("shows actionable diagnostic detail and navigates to the source", async () => {
  const onVisit = vi.fn();
  render(<ProblemsPanel diagnostics={diagnostics} onVisit={onVisit} />);
  expect(screen.getByText(/wrong value type/i)).toBeVisible();
  expect(screen.getByText(/replace the quoted text/i)).toBeVisible();
  expect(screen.getByText(/expected: integer/i)).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: /go to line 2/i }));
  expect(onVisit).toHaveBeenCalledWith(diagnostics[0]);
});

it("filters by severity", async () => {
  render(<ProblemsPanel diagnostics={diagnostics} onVisit={() => undefined} />);
  await userEvent.selectOptions(screen.getByLabelText(/severity filter/i), "warning");
  expect(screen.getByText(/no problems match/i)).toBeVisible();
});
