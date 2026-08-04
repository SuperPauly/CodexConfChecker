export type DiagnosticSeverity = "error" | "warning" | "info";

export type DiagnosticSource =
  | "syntax"
  | "lint"
  | "schema"
  | "format"
  | "system";

export type DiagnosticKind = "unknown-key" | "wrong-table" | "wrong-type" | "deprecated";

export interface DiagnosticFix {
  readonly label: string;
  readonly from: number;
  readonly to: number;
  readonly replacement: string;
}

export interface SourceRange {
  readonly from: number;
  readonly to: number;
  readonly line: number;
  readonly column: number;
  readonly endLine: number;
  readonly endColumn: number;
}

export interface Diagnostic extends SourceRange {
  readonly hasSourceLocation?: boolean;
  readonly severity: DiagnosticSeverity;
  readonly source: DiagnosticSource;
  readonly ruleId: string;
  readonly message: string;
  readonly explanation: string;
  readonly suggestion?: string;
  readonly dataPath?: string;
  readonly schemaPath?: string;
  readonly expected?: string;
  readonly actual?: string;
  readonly fileName?: string;
  readonly kind?: DiagnosticKind;
  readonly fix?: DiagnosticFix;
}
