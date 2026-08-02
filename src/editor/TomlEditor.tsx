import { StreamLanguage } from "@codemirror/language";
import { toml } from "@codemirror/legacy-modes/mode/toml";
import { Text, type Extension } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  GutterMarker,
  gutter,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";
import CodeMirror from "@uiw/react-codemirror";
import { useMemo } from "react";

import type { Diagnostic } from "../taplo/types";
import { diagnosticLines, shouldValidateTransactions } from "./diagnostics";

class ErrorGutterMarker extends GutterMarker {
  readonly elementClass = "cm-error-gutter-marker";
}

const errorGutterMarker = new ErrorGutterMarker();

function diagnosticExtensions(
  value: string,
  diagnostics: readonly Diagnostic[],
): Extension[] {
  const lineStarts = new Set<number>();

  const doc = Text.of(value.split("\n"));
  for (const line of diagnosticLines(doc, diagnostics)) {
    lineStarts.add(line.lineFrom);
  }
  const decorations: DecorationSet = Decoration.set(
    [...lineStarts].map((from) =>
      Decoration.line({ class: "cm-invalid-line" }).range(from),
    ),
    true,
  );

  return [
    EditorView.decorations.of(decorations),
    gutter({
      class: "cm-error-gutter",
      lineMarker: (_view, line) =>
        lineStarts.has(line.from) ? errorGutterMarker : null,
    }),
  ];
}

export interface TomlEditorProps {
  readonly value: string;
  readonly diagnostics: readonly Diagnostic[];
  readonly onChange: (value: string) => void;
  readonly onValidationTrigger: () => void;
  readonly onCreateEditor: (view: EditorView) => void;
}

export function TomlEditor({
  value,
  diagnostics,
  onChange,
  onValidationTrigger,
  onCreateEditor,
}: TomlEditorProps) {
  const extensions = useMemo(
    () => [
      StreamLanguage.define(toml),
      EditorView.lineWrapping,
      EditorView.contentAttributes.of({
        "aria-label": "Codex TOML editor",
        spellcheck: "false",
      }),
      ...diagnosticExtensions(value, diagnostics),
    ],
    [diagnostics, value],
  );

  const handleUpdate = (update: ViewUpdate) => {
    if (shouldValidateTransactions(update.transactions)) {
      onValidationTrigger();
    }
  };

  return (
    <CodeMirror
      aria-label="Codex TOML editor"
      className="toml-editor"
      extensions={extensions}
      height="100%"
      indentWithTab={false}
      onBlur={onValidationTrigger}
      onChange={onChange}
      onCreateEditor={onCreateEditor}
      onUpdate={handleUpdate}
      placeholder={'# Paste your Codex config.toml here\nmodel = "gpt-5"'}
      value={value}
    />
  );
}
