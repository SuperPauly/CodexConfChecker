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

import type { Diagnostic, DiagnosticKind, DiagnosticSeverity } from "../diagnostics/types";
import { shouldValidateTransactions } from "./diagnostics";
import { languageExtension, languageLabel, type EditorLanguage } from "./languages";
import { editorThemeExtension, type RainglowThemeId } from "./rainglow";

class DiagnosticGutterMarker extends GutterMarker {
  readonly elementClass: string;

  constructor(readonly severity: DiagnosticSeverity) {
    super();
    this.elementClass = `cm-diagnostic-gutter-marker cm-${severity}-gutter-marker`;
  }
}

const markerBySeverity = {
  error: new DiagnosticGutterMarker("error"),
  warning: new DiagnosticGutterMarker("warning"),
  info: new DiagnosticGutterMarker("info"),
} satisfies Record<DiagnosticSeverity, DiagnosticGutterMarker>;

const severityRank: Record<DiagnosticSeverity, number> = {
  error: 3,
  warning: 2,
  info: 1,
};

function diagnosticExtensions(
  value: string,
  diagnostics: readonly Diagnostic[],
): Extension[] {
  const doc = Text.of(value.split("\n"));
  const lines = new Map<number, { severity: DiagnosticSeverity; kind?: DiagnosticKind }>();
  const maximumOffset = Math.max(0, doc.length - 1);
  for (const diagnostic of diagnostics) {
    if (diagnostic.hasSourceLocation === false) continue;
    const line = doc.lineAt(Math.min(Math.max(0, diagnostic.from), maximumOffset));
    const current = lines.get(line.from);
    if (!current || severityRank[diagnostic.severity] > severityRank[current.severity] || (diagnostic.kind && !current.kind)) {
      lines.set(line.from, { severity: diagnostic.severity, ...(diagnostic.kind ? { kind: diagnostic.kind } : {}) });
    }
  }
  const decorations: DecorationSet = Decoration.set(
    [...lines].map(([from, diagnostic]) =>
      Decoration.line({ class: `cm-diagnostic-line cm-${diagnostic.kind ?? diagnostic.severity}-line` }).range(from),
    ),
    true,
  );
  return [
    EditorView.decorations.of(decorations),
    gutter({
      class: "cm-diagnostic-gutter",
      lineMarker: (_view, line) => {
        const diagnostic = lines.get(line.from);
        return diagnostic ? markerBySeverity[diagnostic.severity] : null;
      },
    }),
  ];
}

export interface ConfigEditorProps {
  readonly value: string;
  readonly language: EditorLanguage;
  readonly themeId: RainglowThemeId;
  readonly diagnostics: readonly Diagnostic[];
  readonly onChange: (value: string) => void;
  readonly onValidationTrigger: () => void;
  readonly onCreateEditor: (view: EditorView) => void;
  readonly ariaLabel?: string;
  readonly placeholder?: string;
}

export function ConfigEditor({
  value,
  language,
  themeId,
  diagnostics,
  onChange,
  onValidationTrigger,
  onCreateEditor,
  ariaLabel = `${languageLabel(language)} configuration editor`,
  placeholder,
}: ConfigEditorProps) {
  const extensions = useMemo(
    () => [
      languageExtension(language),
      editorThemeExtension(themeId),
      EditorView.lineWrapping,
      EditorView.contentAttributes.of({ "aria-label": ariaLabel, spellcheck: "false" }),
      ...diagnosticExtensions(value, diagnostics),
    ],
    [ariaLabel, diagnostics, language, themeId, value],
  );

  const handleUpdate = (update: ViewUpdate) => {
    if (shouldValidateTransactions(update.transactions)) onValidationTrigger();
  };

  return (
    <CodeMirror
      aria-label={ariaLabel}
      className="config-editor"
      extensions={extensions}
      height="100%"
      indentWithTab={false}
      onBlur={onValidationTrigger}
      onChange={onChange}
      onCreateEditor={onCreateEditor}
      onUpdate={handleUpdate}
      {...(placeholder === undefined ? {} : { placeholder })}
      value={value}
    />
  );
}
