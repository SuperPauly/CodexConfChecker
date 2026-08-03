import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";

import { DEFAULT_LINT_SETTINGS } from "../lint/settings";
import { LintSettingsDrawer } from "./LintSettingsDrawer";

it("edits rule severity and resets all rules", async () => {
  const onChange = vi.fn();
  render(<LintSettingsDrawer settings={DEFAULT_LINT_SETTINGS} onChange={onChange} />);
  await userEvent.click(screen.getByRole("button", { name: /lint rules/i }));
  const severity = screen.getByLabelText(/trailing whitespace severity/i);
  await userEvent.selectOptions(severity, "error");
  expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
    "shared/trailing-whitespace": expect.objectContaining({ severity: "error" }),
  }));
  await userEvent.click(screen.getByRole("button", { name: /reset rules/i }));
  expect(onChange).toHaveBeenLastCalledWith(DEFAULT_LINT_SETTINGS);
});

it("searches rules and exposes the documented options", async () => {
  render(<LintSettingsDrawer settings={DEFAULT_LINT_SETTINGS} onChange={() => undefined} />);
  await userEvent.click(screen.getByRole("button", { name: /lint rules/i }));
  await userEvent.type(screen.getByRole("searchbox", { name: /search lint rules/i }), "line length");
  expect(screen.getByText("Maximum line length")).toBeVisible();
  expect(screen.getByLabelText(/maximum characters/i)).toBeVisible();
  expect(screen.queryByText("Duplicate JSON keys")).not.toBeInTheDocument();
});
