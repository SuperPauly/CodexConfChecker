import { EditorState, Transaction } from "@codemirror/state";
import { describe, expect, it } from "vitest";

import { diagnosticLines, shouldValidateTransactions } from "./diagnostics";

const diagnosticDetails = {
  line: 1,
  column: 1,
  endLine: 1,
  endColumn: 1,
  explanation: "Test diagnostic.",
  ruleId: "test/diagnostic",
  source: "lint" as const,
};

describe("diagnosticLines", () => {
  it("maps each diagnostic to the complete affected line", () => {
    const state = EditorState.create({
      doc: 'model = "gpt-5"\nunknown_key = true\n',
    });

    expect(
      diagnosticLines(state.doc, [
        { ...diagnosticDetails, from: 17, to: 28, message: "Unknown key", severity: "error" },
      ]),
    ).toEqual([
      {
        lineNumber: 2,
        lineFrom: 16,
        lineTo: 34,
        message: "Unknown key",
      },
    ]);
  });

  it("clamps missing or out-of-range offsets and deduplicates a line", () => {
    const state = EditorState.create({ doc: "bad = true\n" });

    expect(
      diagnosticLines(state.doc, [
        { ...diagnosticDetails, from: 999, to: 999, message: "One", severity: "error" },
        { ...diagnosticDetails, from: 0, to: 2, message: "Two", severity: "error" },
      ]),
    ).toEqual([
      {
        lineNumber: 1,
        lineFrom: 0,
        lineTo: 10,
        message: "One\nTwo",
      },
    ]);
  });

  it("does not highlight diagnostics without a configuration source location", () => {
    const state = EditorState.create({ doc: "model = true\n" });
    expect(diagnosticLines(state.doc, [{
      ...diagnosticDetails,
      from: 0,
      to: 0,
      hasSourceLocation: false,
      message: "Schema compiler failure",
      severity: "error",
    }])).toEqual([]);
  });
});

describe("shouldValidateTransactions", () => {
  it("does not validate ordinary typing", () => {
    const state = EditorState.create({ doc: "mode" });
    const transaction = state.update({
      changes: { from: 4, insert: "l" },
      annotations: Transaction.userEvent.of("input.type"),
    });

    expect(shouldValidateTransactions([transaction])).toBe(false);
  });

  it("validates when Enter inserts a carriage return or newline", () => {
    const state = EditorState.create({ doc: "model = true" });
    const newline = state.update({
      changes: { from: state.doc.length, insert: "\n" },
      annotations: Transaction.userEvent.of("input.type"),
    });
    const carriageReturn = state.update({
      changes: { from: state.doc.length, insert: "\r\n" },
      annotations: Transaction.userEvent.of("input.type"),
    });

    expect(shouldValidateTransactions([newline])).toBe(true);
    expect(shouldValidateTransactions([carriageReturn])).toBe(true);
  });

  it("validates after pointer-driven caret movement", () => {
    const state = EditorState.create({ doc: "model = true" });
    const transaction = state.update({
      selection: { anchor: 4 },
      annotations: Transaction.userEvent.of("select.pointer"),
    });

    expect(shouldValidateTransactions([transaction])).toBe(true);
  });
});
