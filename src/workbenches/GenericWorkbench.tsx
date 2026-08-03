import { EditorSelection } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { Check, Clipboard, Download, FileCode2, FileUp, LoaderCircle, Paintbrush, Play, Trash2, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { LintSettingsDrawer } from "../components/LintSettingsDrawer";
import { ProblemsPanel } from "../components/ProblemsPanel";
import { documentLevelDiagnostic, rangeFromOffsets } from "../diagnostics/location";
import { diagnosticCountSummary } from "../diagnostics/summary";
import type { Diagnostic } from "../diagnostics/types";
import { ConfigEditor } from "../editor/ConfigEditor";
import { loadEditorTheme, RAINGLOW_THEMES, saveEditorTheme, type RainglowThemeId } from "../editor/rainglow";
import { detectFormat } from "../formats/detect";
import { JsonAdapter } from "../formats/json";
import { TomlAdapter } from "../formats/toml";
import type { ConfigFormat, FormatAdapter, FormatOptions } from "../formats/types";
import { YamlAdapter } from "../formats/yaml";
import { SchemaWorkerClient } from "../generic-schema/client";
import { translateSchemaProblem } from "../generic-schema/diagnostics";
import type { LocalSchemaFile, ReferenceMode, SchemaValidationRequest, SchemaValidationResponse } from "../generic-schema/types";
import { validateSchemaRequest } from "../generic-schema/worker";
import { applyLintSeverities, lintDocument } from "../lint/engine";
import { loadLintSettings, saveLintSettings, type LintSettings } from "../lint/settings";
import type { TomlEngine } from "../taplo/service";

const MAX_CONFIG_BYTES = 2 * 1024 * 1024;
const MAX_SCHEMA_FILES = 50;
const MAX_SCHEMA_BUNDLE_BYTES = 10 * 1024 * 1024;
const STARTER_JSON = '{\n  "port": 443,\n  "enabled": true\n}\n';
const FORMAT_OPTIONS: FormatOptions = { tabWidth: 2, useTabs: false, printWidth: 100, singleQuote: false };

type SelectedFormat = ConfigFormat | "auto";
type Status = { type: "idle" | "working" | "valid" | "invalid" | "error"; message: string };
interface SchemaClient { validate(request: Omit<SchemaValidationRequest, "requestId">): Promise<SchemaValidationResponse>; cancel(): void; dispose(): void; }

function readFile(file: File): Promise<string> {
  if (typeof file.text === "function") return file.text();
  return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result ?? "")); reader.onerror = () => reject(reader.error); reader.readAsText(file); });
}

function inProcessClient(): SchemaClient {
  let requestId = 0;
  return { validate: async (request) => validateSchemaRequest({ ...request, requestId: ++requestId }), cancel: () => { requestId += 1; }, dispose: () => undefined };
}

function createSchemaClient(): SchemaClient {
  return typeof Worker === "undefined" ? inProcessClient() : new SchemaWorkerClient();
}

function extension(format: ConfigFormat): string { return format === "yaml" ? "yaml" : format; }

export function GenericWorkbench({ engine, onThemeChange, themeId: controlledThemeId }: { readonly engine: TomlEngine; readonly onThemeChange?: (themeId: RainglowThemeId) => void; readonly themeId?: RainglowThemeId }) {
  const [source, setSource] = useState(STARTER_JSON);
  const [fileName, setFileName] = useState<string | undefined>();
  const [selectedFormat, setSelectedFormat] = useState<SelectedFormat>("auto");
  const [localThemeId, setLocalThemeId] = useState<RainglowThemeId>(() => loadEditorTheme());
  const themeId = controlledThemeId ?? localThemeId;
  const [diagnostics, setDiagnostics] = useState<readonly Diagnostic[]>([]);
  const [primary, setPrimary] = useState<LocalSchemaFile | undefined>();
  const [dependencies, setDependencies] = useState<readonly LocalSchemaFile[]>([]);
  const [referenceMode, setReferenceMode] = useState<ReferenceMode>("internal");
  const [lintSettings, setLintSettings] = useState<LintSettings>(() => loadLintSettings());
  const [status, setStatus] = useState<Status>({ type: "idle", message: "Ready. Upload a JSON Schema or run syntax and lint checks alone." });
  const sourceRef = useRef(source);
  const editorRef = useRef<EditorView | null>(null);
  const sequence = useRef(0);
  const [schemaClient] = useState<SchemaClient>(() => createSchemaClient());

  const detected = detectFormat(fileName, source);
  const format: ConfigFormat = selectedFormat === "auto" ? detected.format ?? "json" : selectedFormat;
  const adapters = useMemo<Record<ConfigFormat, FormatAdapter>>(() => ({ json: new JsonAdapter(), yaml: new YamlAdapter(), toml: new TomlAdapter(engine) }), [engine]);

  useEffect(() => () => schemaClient.dispose(), [schemaClient]);
  const setEditorTheme = (next: RainglowThemeId) => { saveEditorTheme(next); if (onThemeChange) onThemeChange(next); else setLocalThemeId(next); };
  const updateLintSettings = (next: LintSettings) => { setLintSettings(next); saveLintSettings(next); };
  const updateSource = (next: string) => { sourceRef.current = next; setSource(next); setStatus({ type: "idle", message: "Edited. Validation waits for Enter, a pointer move, or blur." }); };

  const validate = useCallback(async () => {
    const run = ++sequence.current;
    schemaClient.cancel();
    setStatus({ type: "working", message: `Checking ${format.toUpperCase()} syntax and lint rules...` });
    const parsed = adapters[format].parse(sourceRef.current);
    const base = [...applyLintSeverities(parsed.diagnostics, lintSettings), ...lintDocument(sourceRef.current, parsed, format, lintSettings)];
    if (!primary || parsed.value === undefined || base.some((item) => item.source === "syntax" && item.severity === "error")) {
      if (run !== sequence.current) return;
      setDiagnostics(base);
      const errors = base.filter((item) => item.severity === "error").length;
      setStatus({ type: errors ? "invalid" : "valid", message: errors ? `${errors} blocking ${errors === 1 ? "error" : "errors"} found.` : primary ? "Syntax and lint checks passed." : "Syntax and lint checks passed. Upload a JSON Schema for schema validation." });
      return;
    }
    setStatus({ type: "working", message: "Validating configuration against the uploaded JSON Schema..." });
    const response = await schemaClient.validate({ value: parsed.value, primary, dependencies, referenceMode });
    if (run !== sequence.current) return;
    const schemaDiagnostics = response.problems.map((problem) => translateSchemaProblem(problem, { source: sourceRef.current, value: parsed.value, locations: parsed.locations }));
    const notices: Diagnostic[] = response.notices.map((notice) => ({ ...rangeFromOffsets(sourceRef.current, 0, Math.min(1, sourceRef.current.length)), hasSourceLocation: false, severity: notice.severity, source: "schema", ruleId: notice.ruleId, message: notice.message, explanation: notice.explanation, suggestion: notice.ruleId === "schema/format-annotation" ? "Add validator support for the custom format if its application-specific semantics must be asserted." : "Declare the intended JSON Schema draft explicitly if the default is not correct." }));
    const next = [...base, ...schemaDiagnostics, ...notices].sort((left, right) => left.from - right.from || left.severity.localeCompare(right.severity));
    setDiagnostics(next);
    const errors = next.filter((item) => item.severity === "error").length;
    setStatus({ type: errors ? "invalid" : "valid", message: errors ? `${diagnosticCountSummary(next)} found.` : `Valid against ${primary.fileName}${next.length ? ` with ${diagnosticCountSummary(next)}` : ""}.` });
  }, [adapters, dependencies, format, lintSettings, primary, referenceMode, schemaClient]);

  const uploadConfig = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_CONFIG_BYTES) { setStatus({ type: "error", message: "Configuration files must be 2 MiB or smaller." }); return; }
    const detection = detectFormat(file.name, "");
    if (!detection.format) { setStatus({ type: "error", message: "Choose a .json, .yaml, .yml, or .toml configuration file." }); return; }
    try { const contents = await readFile(file); setFileName(file.name); updateSource(contents); setStatus({ type: "idle", message: `${file.name} loaded as ${detection.format.toUpperCase()}.` }); } catch { setStatus({ type: "error", message: "The selected configuration file could not be read." }); }
  };

  const parseSchemaFile = async (file: File): Promise<LocalSchemaFile> => {
    if (!file.name.toLowerCase().endsWith(".json")) throw new Error("JSON Schema files must use the .json extension.");
    const raw = await readFile(file);
    try { return { fileName: file.name, schema: JSON.parse(raw) as unknown }; } catch (cause) { throw new Error(`${file.name} is not valid JSON: ${cause instanceof Error ? cause.message : String(cause)}`, { cause }); }
  };
  const uploadPrimary = async (file: File | undefined) => { if (!file) return; try { if (file.size > MAX_CONFIG_BYTES) throw new Error("The primary schema must be 2 MiB or smaller."); const schema = await parseSchemaFile(file); setPrimary(schema); setStatus({ type: "idle", message: `${file.name} loaded. Press Validate to apply it.` }); } catch (cause) { setStatus({ type: "error", message: cause instanceof Error ? cause.message : String(cause) }); } };
  const uploadDependencies = async (files: FileList | null) => { if (!files?.length) return; try { const incoming = [...files]; if (incoming.length > MAX_SCHEMA_FILES || incoming.reduce((sum, file) => sum + file.size, 0) > MAX_SCHEMA_BUNDLE_BYTES) throw new Error("A local schema bundle can contain up to 50 JSON files and 10 MiB total."); const parsed = await Promise.all(incoming.map(parseSchemaFile)); setDependencies(parsed); setStatus({ type: "idle", message: `${parsed.length} local schema ${parsed.length === 1 ? "dependency" : "dependencies"} loaded.` }); } catch (cause) { setStatus({ type: "error", message: cause instanceof Error ? cause.message : String(cause) }); } };

  const formatSource = async () => { try { const formatted = await adapters[format].formatSource(sourceRef.current, FORMAT_OPTIONS); updateSource(formatted); await validate(); } catch (cause) { const message = cause instanceof Error ? cause.message : String(cause); setDiagnostics([documentLevelDiagnostic(sourceRef.current, "error", "format", "format/failed", message, `The ${format.toUpperCase()} formatter could not format this document because its current structure is invalid.`, `Correct the ${format.toUpperCase()} syntax error, then run Format again.`)]); setStatus({ type: "error", message }); } };
  const visit = (diagnostic: Diagnostic) => { const editor = editorRef.current; if (!editor) return; const from = Math.min(diagnostic.from, editor.state.doc.length); const to = Math.min(Math.max(from, diagnostic.to), editor.state.doc.length); editor.dispatch({ selection: EditorSelection.range(from, to), effects: EditorView.scrollIntoView(from, { y: "center" }) }); editor.focus(); };
  const copy = async () => { try { await navigator.clipboard.writeText(sourceRef.current); setStatus({ type: "idle", message: "Configuration copied to the clipboard." }); } catch { setStatus({ type: "error", message: "Clipboard access was not available." }); } };
  const download = () => { const url = URL.createObjectURL(new Blob([sourceRef.current], { type: "text/plain" })); const anchor = document.createElement("a"); anchor.href = url; anchor.download = fileName ?? `config.${extension(format)}`; anchor.click(); URL.revokeObjectURL(url); };

  return <section className="workbench generic-workbench" aria-labelledby="generic-title">
    <div className="workbench-intro"><div><p className="eyebrow">Local configuration lab</p><h2 id="generic-title">JSON Schema Workbench</h2><p>Parse, lint, format, and validate JSON, YAML, or TOML against your own JSON Schema.</p></div><div className="select-stack"><label>Configuration format<select aria-label="Configuration format" value={selectedFormat} onChange={(event) => setSelectedFormat(event.target.value as SelectedFormat)}><option value="auto">Auto detect ({format.toUpperCase()})</option><option value="json">JSON</option><option value="yaml">YAML</option><option value="toml">TOML</option></select></label><label>Website theme<select aria-label="Website theme" value={themeId} onChange={(event) => setEditorTheme(event.target.value as RainglowThemeId)}><optgroup label="Dark themes">{RAINGLOW_THEMES.filter((theme) => theme.variant === "dark").map((theme) => <option key={theme.id} value={theme.id}>{theme.name}</option>)}</optgroup><optgroup label="Light themes">{RAINGLOW_THEMES.filter((theme) => theme.variant === "light").map((theme) => <option key={theme.id} value={theme.id}>{theme.name}</option>)}</optgroup></select></label></div></div>
    <div className="schema-panel"><div className="schema-upload"><span>Primary schema</span><label className="button button-secondary"><FileCode2 aria-hidden="true" size={17} /> {primary?.fileName ?? "Upload JSON Schema"}<input accept=".json,application/json" aria-label="Upload primary JSON Schema" className="visually-hidden" onChange={(event) => { void uploadPrimary(event.currentTarget.files?.[0]); event.currentTarget.value = ""; }} type="file" /></label></div><div className="schema-upload"><span>Local references</span><label className="button button-secondary"><FileUp aria-hidden="true" size={17} /> {dependencies.length ? `${dependencies.length} loaded` : "Upload dependencies"}<input accept=".json,application/json" aria-label="Upload schema dependencies" className="visually-hidden" multiple onChange={(event) => { void uploadDependencies(event.currentTarget.files); event.currentTarget.value = ""; }} type="file" /></label></div><fieldset className="reference-mode"><legend>$ref policy</legend><label><input checked={referenceMode === "internal"} name="reference-mode" onChange={() => setReferenceMode("internal")} type="radio" /> Internal only</label><label><input checked={referenceMode === "bundle"} name="reference-mode" onChange={() => setReferenceMode("bundle")} type="radio" /> Uploaded local bundle</label></fieldset></div>
    <div className="action-bar"><label className="button button-secondary"><FileUp aria-hidden="true" size={17} /> Upload config<input accept=".json,.yaml,.yml,.toml" aria-label="Upload configuration" className="visually-hidden" onChange={(event) => { void uploadConfig(event.currentTarget.files?.[0]); event.currentTarget.value = ""; }} type="file" /></label><button className="button button-primary" onClick={() => void validate()} type="button"><Play aria-hidden="true" size={17} /> Validate</button><button className="button button-secondary" onClick={() => void formatSource()} type="button"><Paintbrush aria-hidden="true" size={17} /> Format</button><LintSettingsDrawer onChange={updateLintSettings} settings={lintSettings} /><span className="action-spacer" /><button className="button button-quiet" onClick={() => void copy()} type="button"><Clipboard aria-hidden="true" size={17} /> Copy</button><button className="button button-quiet" onClick={download} type="button"><Download aria-hidden="true" size={17} /> Download</button><button className="button button-danger" onClick={() => { sequence.current += 1; updateSource(""); setDiagnostics([]); }} type="button"><Trash2 aria-hidden="true" size={17} /> Clear</button></div>
    <div className="editor-frame"><ConfigEditor ariaLabel={`${format.toUpperCase()} configuration editor`} diagnostics={diagnostics} language={format} onChange={updateSource} onCreateEditor={(view) => { editorRef.current = view; }} onValidationTrigger={() => void validate()} themeId={themeId} value={source} /></div>
    <div className={`validation-status status-${status.type}`} role={status.type === "error" ? "alert" : "status"}>{status.type === "working" ? <LoaderCircle className="spin" aria-hidden="true" size={18} /> : status.type === "valid" ? <Check aria-hidden="true" size={18} /> : status.type === "invalid" || status.type === "error" ? <TriangleAlert aria-hidden="true" size={18} /> : null}<span>{status.message}</span></div>
    <ProblemsPanel diagnostics={diagnostics} onVisit={visit} />
    <p className="privacy-note">Configuration and schema files stay in this browser. Network references are never fetched.</p>
  </section>;
}
