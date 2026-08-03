import type { EditorView } from "@codemirror/view";

import type { Diagnostic } from "../taplo/types";
import { ConfigEditor } from "./ConfigEditor";
import type { RainglowThemeId } from "./rainglow";

export interface TomlEditorProps {
  readonly value: string;
  readonly diagnostics: readonly Diagnostic[];
  readonly onChange: (value: string) => void;
  readonly onValidationTrigger: () => void;
  readonly onCreateEditor: (view: EditorView) => void;
  readonly themeId?: RainglowThemeId;
}

export function TomlEditor({
  value,
  diagnostics,
  onChange,
  onValidationTrigger,
  onCreateEditor,
  themeId = "azure",
}: TomlEditorProps) {
  return (
    <ConfigEditor
      ariaLabel="Codex TOML editor"
      diagnostics={diagnostics}
      language="toml"
      onChange={onChange}
      onCreateEditor={onCreateEditor}
      onValidationTrigger={onValidationTrigger}
      placeholder={'# Paste your Codex config.toml here\nmodel = "gpt-5"'}
      themeId={themeId}
      value={value}
    />
  );
}
