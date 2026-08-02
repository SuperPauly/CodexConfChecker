export interface Diagnostic {
  readonly from: number;
  readonly to: number;
  readonly message: string;
  readonly severity: "error";
}

export interface ValidationResult {
  readonly diagnostics: readonly Diagnostic[];
}
