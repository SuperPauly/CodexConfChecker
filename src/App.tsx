import { EditorSelection } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import {
  Check,
  Clipboard,
  Download,
  FileUp,
  LoaderCircle,
  Paintbrush,
  Palette,
  Play,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { TomlEditor } from "./editor/TomlEditor";
import { AnalyticsConsent } from "./components/AnalyticsConsent";
import { ProblemsPanel } from "./components/ProblemsPanel";
import { documentLevelDiagnostic } from "./diagnostics/location";
import { diagnosticCountSummary } from "./diagnostics/summary";
import { applyRainglowTheme, loadEditorTheme, RAINGLOW_THEMES, saveEditorTheme, type RainglowThemeId } from "./editor/rainglow";
import { formatSchemaSyncTime, parseSchemaManifest, schemaAssetUrl } from "./schema/manifest";
import type { TomlEngine } from "./taplo/service";
import type { Diagnostic } from "./taplo/types";
import type { SchemaChannel, SchemaManifest } from "./types/schema";
import { GenericWorkbench } from "./workbenches/GenericWorkbench";

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
  readonly onThemeChange?: (themeId: RainglowThemeId) => void;
  readonly themeId?: RainglowThemeId;
}

export function ValidatorWorkbench({ engine, manifest, onThemeChange, themeId }: ValidatorWorkbenchProps) {
  const [toml, setToml] = useState(STARTER_TOML);
  const [channel, setChannel] = useState<SchemaChannel>("stable");
  const [diagnostics, setDiagnostics] = useState<readonly Diagnostic[]>([]);
  const [status, setStatus] = useState<WorkbenchStatus>({
    type: "idle",
    message: "Ready. Your configuration stays in this browser.",
  });
  const [localTheme, setLocalTheme] = useState<RainglowThemeId>(() => loadEditorTheme());
  const editorTheme = themeId ?? localTheme;
  const editorRef = useRef<EditorView | null>(null);
  const validationSequence = useRef(0);
  const tomlRef = useRef(toml);

  useEffect(() => {
    applyRainglowTheme(editorTheme);
  }, [editorTheme]);

  const selectTheme = (next: RainglowThemeId) => {
    saveEditorTheme(next);
    if (onThemeChange) onThemeChange(next);
    else setLocalTheme(next);
  };

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
            message: `${diagnosticCountSummary(result.diagnostics)} found`,
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
      const message = error instanceof Error ? error.message : String(error);
      setDiagnostics([documentLevelDiagnostic(
        tomlRef.current,
        "error",
        "format",
        "format/failed",
        message,
        "Taplo could not format the document because its current TOML structure is invalid.",
        "Correct the TOML syntax error, then run Format again.",
      )]);
      setStatus({
        type: "error",
        message,
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
          <div className="heading-controls"><ThemeSelect onChange={selectTheme} value={editorTheme} /></div>
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
                <small className="schema-version">{manifest.channels[option].version}</small>
                <time className="schema-sync-time" dateTime={manifest.channels[option].syncedAt}>
                  Last synced {formatSchemaSyncTime(manifest.channels[option].syncedAt)}
                </time>
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
            themeId={editorTheme}
            value={toml}
          />
        </div>

        <div className={`validation-status status-${status.type}`} role={status.type === "error" ? "alert" : "status"}>
          {status.type === "working" ? <LoaderCircle className="spin" aria-hidden="true" size={18} /> : null}
          {status.type === "valid" ? <Check aria-hidden="true" size={18} /> : null}
          {status.type === "invalid" || status.type === "error" ? <TriangleAlert aria-hidden="true" size={18} /> : null}
          <span>{status.message}</span>
        </div>

        <ProblemsPanel diagnostics={diagnostics} onVisit={visitDiagnostic} />

        <p className="privacy-note">Configuration processing stays in your browser. Optional site visit metrics only start after consent.</p>
      </section>
    </main>
  );
}

export function ApplicationWorkbench({ engine, manifest }: ValidatorWorkbenchProps) {
  const [tab, setTab] = useState<"codex" | "generic">("codex");
  const [themeId, setThemeId] = useState<RainglowThemeId>(() => loadEditorTheme());
  const changeTheme = (next: RainglowThemeId) => {
    setThemeId(next);
    saveEditorTheme(next);
  };
  useEffect(() => {
    applyRainglowTheme(themeId);
  }, [themeId]);
  return <div className="application-shell">
    <nav aria-label="Validator mode" className="mode-tabs">
      <button aria-selected={tab === "codex"} onClick={() => setTab("codex")} role="tab" type="button"><strong>Codex Config</strong><span>Release schemas</span></button>
      <button aria-selected={tab === "generic"} onClick={() => setTab("generic")} role="tab" type="button"><strong>JSON Schema Workbench</strong><span>JSON · YAML · TOML</span></button>
    </nav>
    {tab === "codex" ? <ValidatorWorkbench engine={engine} manifest={manifest} onThemeChange={changeTheme} themeId={themeId} /> : <main className="app-shell"><section className="tool-card"><div className="generic-topline"><h1>Config Checker</h1></div><GenericWorkbench engine={engine} onThemeChange={changeTheme} themeId={themeId} /></section></main>}
    <AnalyticsConsent measurementId={import.meta.env.VITE_GA_MEASUREMENT_ID} />
  </div>;
}

function ThemeSelect({ onChange, value }: { readonly onChange: (themeId: RainglowThemeId) => void; readonly value: RainglowThemeId }) {
  return (
    <label className="editor-theme-select"><Palette aria-hidden="true" size={16} /><span>Website theme</span><select aria-label="Website theme" value={value} onChange={(event) => onChange(event.target.value as RainglowThemeId)}><optgroup label="Dark themes">{RAINGLOW_THEMES.filter((theme) => theme.variant === "dark").map((theme) => <option key={theme.id} value={theme.id}>{theme.name}</option>)}</optgroup><optgroup label="Light themes">{RAINGLOW_THEMES.filter((theme) => theme.variant === "light").map((theme) => <option key={theme.id} value={theme.id}>{theme.name}</option>)}</optgroup></select></label>
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
  return <ApplicationWorkbench engine={state.engine} manifest={state.manifest} />;
}
