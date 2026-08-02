import { EditorSelection } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import {
  Check,
  Clipboard,
  Download,
  FileUp,
  LoaderCircle,
  Monitor,
  Moon,
  Paintbrush,
  Play,
  Sun,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { TomlEditor } from "./editor/TomlEditor";
import { parseSchemaManifest, schemaAssetUrl } from "./schema/manifest";
import type { TomlEngine } from "./taplo/service";
import type { Diagnostic } from "./taplo/types";
import type { SchemaChannel, SchemaManifest } from "./types/schema";
import {
  applyThemePreference,
  loadThemePreference,
  type ThemePreference,
} from "./theme/theme";

const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
const STARTER_TOML = '# Paste or upload your Codex config.toml\nmodel = "gpt-5"\n';

type WorkbenchStatus =
  | { readonly type: "idle"; readonly message: string }
  | { readonly type: "working"; readonly message: string }
  | { readonly type: "valid"; readonly message: string }
  | { readonly type: "invalid"; readonly message: string }
  | { readonly type: "error"; readonly message: string };

function absoluteSchemaUrl(channel: SchemaChannel, sha256: string): string {
  const url = new URL(schemaAssetUrl(channel), window.location.href);
  url.searchParams.set("sha", sha256);
  return url.href;
}

function lineAndColumn(text: string, offset: number): { line: number; column: number } {
  const safeOffset = Math.min(Math.max(0, offset), Math.max(0, text.length));
  const before = text.slice(0, safeOffset);
  const lines = before.split("\n");
  return { line: lines.length, column: (lines.at(-1)?.length ?? 0) + 1 };
}

function downloadToml(text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/toml" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "config.toml";
  anchor.click();
  URL.revokeObjectURL(url);
}

function readTextFile(file: File): Promise<string> {
  if (typeof file.text === "function") return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result ?? "")));
    reader.addEventListener("error", () => reject(reader.error ?? new Error("File read failed.")));
    reader.readAsText(file);
  });
}

export interface ValidatorWorkbenchProps {
  readonly engine: TomlEngine;
  readonly manifest: SchemaManifest;
}

export function ValidatorWorkbench({ engine, manifest }: ValidatorWorkbenchProps) {
  const [toml, setToml] = useState(STARTER_TOML);
  const [channel, setChannel] = useState<SchemaChannel>("stable");
  const [diagnostics, setDiagnostics] = useState<readonly Diagnostic[]>([]);
  const [status, setStatus] = useState<WorkbenchStatus>({
    type: "idle",
    message: "Ready. Your configuration stays in this browser.",
  });
  const editorRef = useRef<EditorView | null>(null);
  const validationSequence = useRef(0);
  const tomlRef = useRef(toml);

  const validate = useCallback(
    async (nextToml = tomlRef.current, nextChannel = channel) => {
      const sequence = ++validationSequence.current;
      setStatus({ type: "working", message: "Validating with Taplo..." });
      try {
        const result = await engine.validate(
          nextToml,
          absoluteSchemaUrl(nextChannel, manifest.channels[nextChannel].sha256),
        );
        if (sequence !== validationSequence.current) return;
        setDiagnostics(result.diagnostics);
        if (result.diagnostics.length === 0) {
          setStatus({
            type: "valid",
            message: `Valid for ${manifest.channels[nextChannel].version}`,
          });
        } else {
          setStatus({
            type: "invalid",
            message: `${result.diagnostics.length} ${result.diagnostics.length === 1 ? "problem" : "problems"} found`,
          });
        }
      } catch (error) {
        if (sequence !== validationSequence.current) return;
        setDiagnostics([]);
        setStatus({
          type: "error",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    },
    [channel, engine, manifest.channels],
  );

  const updateToml = (nextToml: string) => {
    tomlRef.current = nextToml;
    setToml(nextToml);
    setStatus({ type: "idle", message: "Edited. Validation waits for Enter, a pointer move, or blur." });
  };

  const selectChannel = (nextChannel: SchemaChannel) => {
    setChannel(nextChannel);
    void validate(tomlRef.current, nextChannel);
  };

  const format = () => {
    try {
      const formatted = engine.format(tomlRef.current);
      updateToml(formatted);
      void validate(formatted, channel);
    } catch (error) {
      setStatus({
        type: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const upload = async (file: File | undefined) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".toml")) {
      setStatus({ type: "error", message: "Choose a file with the .toml extension." });
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setStatus({ type: "error", message: "The TOML file must be 2 MiB or smaller." });
      return;
    }
    try {
      const contents = await readTextFile(file);
      updateToml(contents);
      void validate(contents, channel);
    } catch {
      setStatus({ type: "error", message: "The selected file could not be read." });
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(tomlRef.current);
      setStatus({ type: "idle", message: "Copied to clipboard." });
    } catch {
      setStatus({ type: "error", message: "Clipboard access was not available." });
    }
  };

  const clear = () => {
    validationSequence.current += 1;
    updateToml("");
    setDiagnostics([]);
    editorRef.current?.focus();
  };

  const affectedLineCount = new Set(
    diagnostics.map((diagnostic) => lineAndColumn(toml, diagnostic.from).line),
  ).size;

  const visitDiagnostic = (diagnostic: Diagnostic) => {
    const editor = editorRef.current;
    if (!editor) return;
    const from = Math.min(diagnostic.from, editor.state.doc.length);
    const to = Math.min(Math.max(from, diagnostic.to), editor.state.doc.length);
    editor.dispatch({
      selection: EditorSelection.range(from, to),
      effects: EditorView.scrollIntoView(from, { y: "center" }),
    });
    editor.focus();
  };

  return (
    <main className="app-shell">
      <section className="tool-card" aria-labelledby="checker-title">
        <div className="tool-heading">
          <div>
            <p className="eyebrow">Local browser tool</p>
            <h1 id="checker-title">Codex Config Checker</h1>
            <p className="lede">Validate and format Codex CLI TOML without uploading it.</p>
          </div>
          <ThemeControl />
        </div>

        <fieldset className="schema-picker">
          <legend>Codex schema</legend>
          {(["stable", "alpha"] as const).map((option) => (
            <label className="schema-option" key={option}>
              <input
                checked={channel === option}
                name="schema-channel"
                onChange={() => selectChannel(option)}
                type="radio"
                value={option}
              />
              <span>
                <strong>{option === "stable" ? "Stable" : "Alpha"}</strong>
                <small>{manifest.channels[option].version}</small>
              </span>
            </label>
          ))}
        </fieldset>

        <div className="action-bar" aria-label="Configuration actions">
          <label className="button button-secondary" title="Upload a local TOML file">
            <FileUp aria-hidden="true" size={17} /> Upload
            <input
              accept=".toml,application/toml,text/plain"
              aria-label="Upload TOML"
              className="visually-hidden"
              onChange={(event) => {
                void upload(event.currentTarget.files?.[0]);
                event.currentTarget.value = "";
              }}
              type="file"
            />
          </label>
          <button className="button button-primary" onClick={() => void validate()} title="Validate now" type="button">
            <Play aria-hidden="true" size={17} /> Validate
          </button>
          <button className="button button-secondary" onClick={format} title="Format with Taplo" type="button">
            <Paintbrush aria-hidden="true" size={17} /> Format
          </button>
          <span className="action-spacer" />
          <button className="button button-quiet" onClick={() => void copy()} title="Copy TOML" type="button">
            <Clipboard aria-hidden="true" size={17} /> Copy
          </button>
          <button className="button button-quiet" onClick={() => downloadToml(tomlRef.current)} title="Download config.toml" type="button">
            <Download aria-hidden="true" size={17} /> Download
          </button>
          <button className="button button-danger" onClick={clear} title="Clear editor" type="button">
            <Trash2 aria-hidden="true" size={17} /> Clear
          </button>
        </div>

        <div className="editor-frame">
          <TomlEditor
            diagnostics={diagnostics}
            onChange={updateToml}
            onCreateEditor={(editor) => {
              editorRef.current = editor;
            }}
            onValidationTrigger={() => void validate()}
            value={toml}
          />
        </div>

        <div className={`validation-status status-${status.type}`} role={status.type === "error" ? "alert" : "status"}>
          {status.type === "working" ? <LoaderCircle className="spin" aria-hidden="true" size={18} /> : null}
          {status.type === "valid" ? <Check aria-hidden="true" size={18} /> : null}
          {status.type === "invalid" || status.type === "error" ? <TriangleAlert aria-hidden="true" size={18} /> : null}
          <span>{status.message}</span>
        </div>

        <section className="problems" aria-labelledby="problems-title">
          <div className="problems-heading">
            <h2 id="problems-title">Problems</h2>
            <span>{diagnostics.length}</span>
          </div>
          {diagnostics.length === 0 ? (
            <p className="empty-problems">No reported problems.</p>
          ) : (
            <ol>
              {diagnostics.map((diagnostic, index) => {
                const position = lineAndColumn(toml, diagnostic.from);
                return (
                  <li key={`${diagnostic.from}-${diagnostic.message}-${index}`}>
                    <button onClick={() => visitDiagnostic(diagnostic)} type="button">
                      <span>Ln {position.line}, Col {position.column}</span>
                      {diagnostic.message}
                    </button>
                  </li>
                );
              })}
            </ol>
          )}
          <span className="visually-hidden">{affectedLineCount} affected lines</span>
        </section>

        <p className="privacy-note">Everything runs locally in your browser. No TOML is sent to a server.</p>
      </section>
    </main>
  );
}

function ThemeControl() {
  const [preference, setPreference] = useState<ThemePreference>(() =>
    loadThemePreference(),
  );
  const [systemPrefersDark, setSystemPrefersDark] = useState(
    () => window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false,
  );

  useEffect(() => {
    applyThemePreference(preference, systemPrefersDark);
  }, [preference, systemPrefersDark]);

  useEffect(() => {
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!media) return undefined;
    const update = (event: MediaQueryListEvent) => setSystemPrefersDark(event.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  const choices = [
    { value: "system", label: "System", icon: Monitor },
    { value: "light", label: "Light", icon: Sun },
    { value: "dark", label: "Dark", icon: Moon },
  ] as const;

  return (
    <div aria-label="Theme" className="theme-control" role="group">
      {choices.map(({ value, label, icon: Icon }) => (
        <button
          aria-pressed={preference === value}
          key={value}
          onClick={() => setPreference(value)}
          title={`${label} theme`}
          type="button"
        >
          <Icon aria-hidden="true" size={15} />
          <span>{label}</span>
        </button>
      ))}
    </div>
  );
}

export default function App() {
  const [state, setState] = useState<
    | { readonly type: "loading" }
    | { readonly type: "ready"; readonly engine: TomlEngine; readonly manifest: SchemaManifest }
    | { readonly type: "error"; readonly message: string }
  >({ type: "loading" });

  useEffect(() => {
    let active = true;
    Promise.all([
      import("./taplo/service").then(({ TaploService }) => TaploService.initialize()),
      fetch(`${import.meta.env.BASE_URL}schemas/manifest.json`, { cache: "no-cache" }).then(async (response) => {
        if (!response.ok) throw new Error(`Schema manifest returned ${response.status}.`);
        return parseSchemaManifest(await response.json());
      }),
    ]).then(
      ([engine, manifest]) => {
        if (active) setState({ type: "ready", engine, manifest });
      },
      (error: unknown) =>
        active &&
        setState({
            type: "error",
            message: error instanceof Error ? error.message : String(error),
          }),
    );
    return () => {
      active = false;
    };
  }, []);

  if (state.type === "loading") {
    return <div className="app-loading"><LoaderCircle className="spin" aria-hidden="true" /> Loading Taplo...</div>;
  }
  if (state.type === "error") {
    return <main className="fatal-error"><h1>Codex Config Checker</h1><p role="alert">{state.message}</p></main>;
  }
  return <ValidatorWorkbench engine={state.engine} manifest={state.manifest} />;
}
