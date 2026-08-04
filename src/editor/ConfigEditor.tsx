import { StateEffect, StateField, Text, type Extension } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  GutterMarker,
  gutter,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";
import CodeMirror from "@uiw/react-codemirror";
import { useCallback, useEffect, useMemo, useRef } from "react";

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

interface EditorDiagnostics {
  readonly diagnostics: readonly Diagnostic[];
  readonly decorations: DecorationSet;
  readonly lines: ReadonlyMap<number, { severity: DiagnosticSeverity; kind?: DiagnosticKind }>;
}

const setDiagnostics = StateEffect.define<readonly Diagnostic[]>();

function buildDiagnostics(doc: Text, diagnostics: readonly Diagnostic[]): EditorDiagnostics {
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
  return { diagnostics, decorations, lines };
}

const diagnosticState = StateField.define<EditorDiagnostics>({
  create: (state) => buildDiagnostics(state.doc, []),
  update: (current, transaction) => {
    const effect = transaction.effects.find((candidate) => candidate.is(setDiagnostics));
    if (effect) return buildDiagnostics(transaction.state.doc, effect.value);
    return transaction.docChanged ? buildDiagnostics(transaction.state.doc, current.diagnostics) : current;
  },
  provide: (field) => EditorView.decorations.from(field, (value) => value.decorations),
});

const diagnosticExtension: Extension = [
  diagnosticState,
  gutter({
    class: "cm-diagnostic-gutter",
    lineMarker: (view, line) => {
      const diagnostic = view.state.field(diagnosticState).lines.get(line.from);
      return diagnostic ? markerBySeverity[diagnostic.severity] : null;
    },
  }),
];

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
  const editorRef = useRef<EditorView | undefined>(undefined);
  const extensions = useMemo(
    () => [
      languageExtension(language),
      editorThemeExtension(themeId),
      EditorView.lineWrapping,
      EditorView.contentAttributes.of({ "aria-label": ariaLabel, spellcheck: "false" }),
      diagnosticExtension,
    ],
    [ariaLabel, language, themeId],
  );

  useEffect(() => {
    editorRef.current?.dispatch({ effects: setDiagnostics.of(diagnostics) });
  }, [diagnostics]);

  const handleCreateEditor = useCallback((view: EditorView) => {
    editorRef.current = view;
    view.dispatch({ effects: setDiagnostics.of(diagnostics) });
    onCreateEditor(view);
  }, [diagnostics, onCreateEditor]);

  const handleUpdate = (update: ViewUpdate) => {
    if (shouldValidateTransactions(update.transactions)) onValidationTrigger();
  };

  return (
    <CodeMirror
      className="config-editor"
      data-editor-label={ariaLabel}
      extensions={extensions}
      height="100%"
      indentWithTab={false}
      onBlur={onValidationTrigger}
      onChange={onChange}
      onCreateEditor={handleCreateEditor}
      onUpdate={handleUpdate}
      {...(placeholder === undefined ? {} : { placeholder })}
      value={value}
    />
  );
}
