import { type Text, type Transaction } from "@codemirror/state";

import type { Diagnostic } from "../taplo/types";

export interface DiagnosticLine {
  readonly lineNumber: number;
  readonly lineFrom: number;
  readonly lineTo: number;
  readonly message: string;
}

export function diagnosticLines(
  doc: Text,
  diagnostics: readonly Diagnostic[],
): readonly DiagnosticLine[] {
  const lines = new Map<number, Omit<DiagnosticLine, "message"> & { messages: string[] }>();
  const maximumOffset = Math.max(0, doc.length - 1);

  for (const diagnostic of diagnostics) {
    if (diagnostic.hasSourceLocation === false) continue;
    const offset = Math.min(Math.max(0, diagnostic.from), maximumOffset);
    const line = doc.lineAt(offset);
    const existing = lines.get(line.number);

    if (existing) {
      if (!existing.messages.includes(diagnostic.message)) {
        existing.messages.push(diagnostic.message);
      }
      continue;
    }

    lines.set(line.number, {
      lineNumber: line.number,
      lineFrom: line.from,
      lineTo: line.to,
      messages: [diagnostic.message],
    });
  }

  return [...lines.values()]
    .sort((left, right) => left.lineNumber - right.lineNumber)
    .map(({ messages, ...line }) => ({ ...line, message: messages.join("\n") }));
}

export function shouldValidateTransactions(
  transactions: readonly Transaction[],
): boolean {
  return transactions.some((transaction) => {
    if (transaction.isUserEvent("select.pointer")) {
      return true;
    }
    if (!transaction.docChanged || !transaction.isUserEvent("input.type")) {
      return false;
    }

    let insertedLineBreak = false;
    transaction.changes.iterChanges((_fromA, _toA, _fromB, _toB, inserted) => {
      if (/[\r\n]/.test(inserted.toString())) {
        insertedLineBreak = true;
      }
    });
    return insertedLineBreak;
  });
}
