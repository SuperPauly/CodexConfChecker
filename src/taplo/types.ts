export type { Diagnostic } from "../diagnostics/types";

import type { Diagnostic } from "../diagnostics/types";

export interface ValidationResult {
  readonly diagnostics: readonly Diagnostic[];
}
