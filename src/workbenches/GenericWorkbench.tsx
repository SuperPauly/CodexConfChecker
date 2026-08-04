import { EditorSelection } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { Check, ChevronDown, Clipboard, Download, FileCode2, FileUp, LoaderCircle, Paintbrush, Play, Trash2, TriangleAlert, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { LintSettingsDrawer } from "../components/LintSettingsDrawer";
import { ProblemsPanel } from "../components/ProblemsPanel";
import { VersionPickerModal } from "../components/VersionPickerModal";
import { documentLevelDiagnostic, rangeFromOffsets } from "../diagnostics/location";
import { diagnosticCountSummary } from "../diagnostics/summary";
import type { Diagnostic } from "../diagnostics/types";
import { ConfigEditor } from "../editor/ConfigEditor";
import { loadEditorTheme, RAINGLOW_THEMES, saveEditorTheme, type RainglowThemeId } from "../editor/rainglow";
import { detectFormat } from "../formats/detect";
import { JsonAdapter } from "../formats/json";
import { serializeConfig } from "../formats/serialize";
import { TomlAdapter } from "../formats/toml";
import type { ConfigFormat, FormatAdapter, FormatOptions } from "../formats/types";
import { YamlAdapter } from "../formats/yaml";
import { SchemaWorkerClient } from "../generic-schema/client";
import { schemaPropertyNames, translateSchemaProblem } from "../generic-schema/diagnostics";
import type { LocalSchemaFile, ReferenceMode, SchemaValidationRequest, SchemaValidationResponse } from "../generic-schema/types";
import { validateSchemaRequest } from "../generic-schema/worker";
import { applyLintSeverities, lintDocument } from "../lint/engine";
import { loadLintSettings, saveLintSettings, type LintSettings } from "../lint/settings";
import { formatSchemaSyncTime, schemaAssetUrl } from "../schema/manifest";
import { codexMigrationDiagnostics } from "../schema/codex-migrations";
import type { TomlEngine } from "../taplo/service";
import type { SchemaManifest, SchemaVersion } from "../types/schema";

const MAX_CONFIG_BYTES = 2 * 1024 * 1024;
const MAX_SCHEMA_FILES = 50;
const MAX_SCHEMA_BUNDLE_BYTES = 10 * 1024 * 1024;
const STARTER_TOML = '# Paste or upload your configuration\nmodel = "gpt-5"\n';
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

function createSchemaClient(): SchemaClient { return typeof Worker === "undefined" ? inProcessClient() : new SchemaWorkerClient(); }
function extension(format: ConfigFormat): string { return format === "yaml" ? "yaml" : format; }
function mimeType(format: ConfigFormat): string { return format === "json" ? "application/json" : format === "yaml" ? "application/yaml" : "application/toml"; }

export interface GenericWorkbenchProps {
  readonly engine: TomlEngine;
  readonly manifest: SchemaManifest;
  readonly onThemeChange?: (themeId: RainglowThemeId) => void;
  readonly themeId?: RainglowThemeId;
}

export function GenericWorkbench({ engine, manifest, onThemeChange, themeId: controlledThemeId }: GenericWorkbenchProps) {
  const programIds = Object.keys(manifest.programs);
  const [programId, setProgramId] = useState(programIds[0] ?? "");
  const program = manifest.programs[programId];
  if (!program) throw new Error("The schema registry does not contain a selectable program.");
  const initialVersion = program.versions.find((version) => version.channel === "stable") ?? program.versions[0];

  const [source, setSource] = useState(STARTER_TOML);
  const [fileName, setFileName] = useState<string | undefined>();
  const [selectedFormat, setSelectedFormat] = useState<SelectedFormat>(program.defaultFormat);
  const [selectedVersionId, setSelectedVersionId] = useState(initialVersion?.id ?? "");
  const selectedVersion = program.versions.find((version) => version.id === selectedVersionId) ?? initialVersion;
  const [versionModalOpen, setVersionModalOpen] = useState(false);
  const [downloadMenuOpen, setDownloadMenuOpen] = useState(false);
  const [localThemeId, setLocalThemeId] = useState<RainglowThemeId>(() => loadEditorTheme());
  const themeId = controlledThemeId ?? localThemeId;
  const [diagnostics, setDiagnostics] = useState<readonly Diagnostic[]>([]);
  const [trackedPrimary, setTrackedPrimary] = useState<LocalSchemaFile | undefined>();
  const [customPrimary, setCustomPrimary] = useState<LocalSchemaFile | undefined>();
  const [dependencies, setDependencies] = useState<readonly LocalSchemaFile[]>([]);
  const [referenceMode, setReferenceMode] = useState<ReferenceMode>("internal");
  const [lintSettings, setLintSettings] = useState<LintSettings>(() => loadLintSettings());
  const [status, setStatus] = useState<Status>({ type: "working", message: "Loading the current Codex schema..." });
  const [revision, setRevision] = useState(0);
  const [validatedRevision, setValidatedRevision] = useState<number | undefined>();
  const sourceRef = useRef(source);
  const revisionRef = useRef(0);
  const editorRef = useRef<EditorView | null>(null);
  const sequence = useRef(0);
  const schemaLoadSequence = useRef(0);
  const [schemaClient] = useState<SchemaClient>(() => createSchemaClient());

  const detected = detectFormat(fileName, source);
  const format: ConfigFormat = selectedFormat === "auto" ? detected.format ?? program.defaultFormat : selectedFormat;
  const primary = customPrimary ?? trackedPrimary;
  const adapters = useMemo<Record<ConfigFormat, FormatAdapter>>(() => ({ json: new JsonAdapter(), yaml: new YamlAdapter(), toml: new TomlAdapter(engine) }), [engine]);

  useEffect(() => () => schemaClient.dispose(), [schemaClient]);
  useEffect(() => {
    if (!selectedVersion) return;
    const run = ++schemaLoadSequence.current;
    const url = new URL(schemaAssetUrl(selectedVersion), window.location.href);
    url.searchParams.set("sha", selectedVersion.sha256);
    fetch(url, { cache: "no-cache" }).then(async (response) => {
      if (!response.ok) throw new Error(`Schema returned HTTP ${response.status}.`);
      return await response.json() as unknown;
    }).then((schema) => {
      if (run !== schemaLoadSequence.current) return;
      if (typeof schema !== "object" || schema === null || Array.isArray(schema)) throw new Error("The selected schema is not a JSON object.");
      setTrackedPrimary({ fileName: `${selectedVersion.version}.schema.json`, schema });
      setStatus({ type: "idle", message: `${selectedVersion.label} loaded. Press Validate to check this configuration.` });
    }).catch((error: unknown) => {
      if (run !== schemaLoadSequence.current) return;
      setStatus({ type: "error", message: `Could not load ${selectedVersion.label}: ${error instanceof Error ? error.message : String(error)}` });
    });
  }, [programId, selectedVersion]);

  const setEditorTheme = (next: RainglowThemeId) => { saveEditorTheme(next); if (onThemeChange) onThemeChange(next); else setLocalThemeId(next); };
  const updateLintSettings = (next: LintSettings) => { setLintSettings(next); saveLintSettings(next); setValidatedRevision(undefined); };
  const updateSource = (next: string) => { sourceRef.current = next; revisionRef.current += 1; setRevision(revisionRef.current); setSource(next); setValidatedRevision(undefined); setStatus({ type: "idle", message: "Edited. Validation waits for Enter, a pointer move, or blur." }); };

  const validate = useCallback(async () => {
    const run = ++sequence.current;
    const revision = revisionRef.current;
    schemaClient.cancel();
    setValidatedRevision(undefined);
    setStatus({ type: "working", message: `Checking ${format.toUpperCase()} syntax and lint rules...` });
    const parsed = adapters[format].parse(sourceRef.current);
    const migrations = programId === "codex" && !customPrimary && parsed.value !== undefined ? codexMigrationDiagnostics(sourceRef.current, format, parsed.value) : [];
    const base = [...applyLintSeverities(parsed.diagnostics, lintSettings), ...lintDocument(sourceRef.current, parsed, format, lintSettings), ...migrations];
    if (!primary) {
      if (run !== sequence.current) return;
      setDiagnostics(base);
      setStatus({ type: "error", message: "The selected JSON Schema is still loading or could not be loaded." });
      return;
    }
    if (parsed.value === undefined || base.some((item) => item.source === "syntax" && item.severity === "error")) {
      if (run !== sequence.current) return;
      setDiagnostics(base);
      setStatus({ type: "invalid", message: `${base.filter((item) => item.severity === "error").length} blocking errors found.` });
      return;
    }
    setStatus({ type: "working", message: `Validating configuration against ${primary.fileName}...` });
    const response = await schemaClient.validate({ value: parsed.value, primary, dependencies, referenceMode });
    if (run !== sequence.current) return;
    const migrationPaths = new Set(migrations.flatMap((diagnostic) => diagnostic.dataPath === undefined ? [] : [diagnostic.dataPath]));
    const knownPropertyNames = schemaPropertyNames(primary.schema);
    const schemaDiagnostics = response.problems
      .map((problem) => translateSchemaProblem(problem, { source: sourceRef.current, value: parsed.value, locations: parsed.locations, knownPropertyNames }))
      .filter((diagnostic) => !migrationPaths.has(diagnostic.dataPath ?? ""));
    const notices: Diagnostic[] = response.notices.map((notice) => ({ ...rangeFromOffsets(sourceRef.current, 0, Math.min(1, sourceRef.current.length)), hasSourceLocation: false, severity: notice.severity, source: "schema", ruleId: notice.ruleId, message: notice.message, explanation: notice.explanation, suggestion: notice.ruleId === "schema/format-annotation" ? "Add validator support for the custom format if its application-specific semantics must be asserted." : "Declare the intended JSON Schema draft explicitly if the default is not correct." }));
    const next = [...base, ...schemaDiagnostics, ...notices].sort((left, right) => left.from - right.from || left.severity.localeCompare(right.severity));
    setDiagnostics(next);
    const errors = next.filter((item) => item.severity === "error").length;
    if (!errors && revision === revisionRef.current) setValidatedRevision(revision);
    setStatus({ type: errors ? "invalid" : "valid", message: errors ? `${diagnosticCountSummary(next)} found.` : `Valid against ${customPrimary?.fileName ?? selectedVersion?.label ?? primary.fileName}${next.length ? ` with ${diagnosticCountSummary(next)}` : ""}.` });
  }, [adapters, customPrimary, dependencies, format, lintSettings, primary, programId, referenceMode, schemaClient, selectedVersion?.label]);

  const uploadConfig = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_CONFIG_BYTES) { setStatus({ type: "error", message: "Configuration files must be 2 MiB or smaller." }); return; }
    const detection = detectFormat(file.name, "");
    if (!detection.format) { setStatus({ type: "error", message: "Choose a .json, .yaml, .yml, or .toml configuration file." }); return; }
    try { const contents = await readFile(file); setFileName(file.name); setSelectedFormat(detection.format); updateSource(contents); setStatus({ type: "idle", message: `${file.name} loaded as ${detection.format.toUpperCase()}.` }); } catch { setStatus({ type: "error", message: "The selected configuration file could not be read." }); }
  };

  const parseSchemaFile = async (file: File): Promise<LocalSchemaFile> => {
    if (!file.name.toLowerCase().endsWith(".json")) throw new Error("JSON Schema files must use the .json extension.");
    const raw = await readFile(file);
    try { return { fileName: file.name, schema: JSON.parse(raw) as unknown }; } catch (cause) { throw new Error(`${file.name} is not valid JSON: ${cause instanceof Error ? cause.message : String(cause)}`, { cause }); }
  };
  const uploadPrimary = async (file: File | undefined) => {
    if (!file) return;
    try { if (file.size > MAX_CONFIG_BYTES) throw new Error("The primary schema must be 2 MiB or smaller."); const schema = await parseSchemaFile(file); schemaLoadSequence.current += 1; setCustomPrimary(schema); setValidatedRevision(undefined); setStatus({ type: "idle", message: `${file.name} loaded. Tracked version selection is paused until it is removed.` }); }
    catch (cause) { setStatus({ type: "error", message: cause instanceof Error ? cause.message : String(cause) }); }
  };
  const uploadDependencies = async (files: FileList | null) => {
    if (!files?.length) return;
    try { const incoming = [...files]; if (incoming.length > MAX_SCHEMA_FILES || incoming.reduce((sum, file) => sum + file.size, 0) > MAX_SCHEMA_BUNDLE_BYTES) throw new Error("A local schema bundle can contain up to 50 JSON files and 10 MiB total."); const parsed = await Promise.all(incoming.map(parseSchemaFile)); setDependencies(parsed); setValidatedRevision(undefined); setStatus({ type: "idle", message: `${parsed.length} local schema ${parsed.length === 1 ? "dependency" : "dependencies"} loaded.` }); }
    catch (cause) { setStatus({ type: "error", message: cause instanceof Error ? cause.message : String(cause) }); }
  };

  const formatSource = async () => { try { const formatted = await adapters[format].formatSource(sourceRef.current, FORMAT_OPTIONS); updateSource(formatted); await validate(); } catch (cause) { const message = cause instanceof Error ? cause.message : String(cause); setDiagnostics([documentLevelDiagnostic(sourceRef.current, "error", "format", "format/failed", message, `The ${format.toUpperCase()} formatter could not format this document because its current structure is invalid.`, `Correct the ${format.toUpperCase()} syntax error, then run Format again.`)]); setStatus({ type: "error", message }); } };
  const visit = (diagnostic: Diagnostic) => { const editor = editorRef.current; if (!editor) return; const from = Math.min(diagnostic.from, editor.state.doc.length); const to = Math.min(Math.max(from, diagnostic.to), editor.state.doc.length); editor.dispatch({ selection: EditorSelection.range(from, to), effects: EditorView.scrollIntoView(from, { y: "center" }) }); editor.focus(); };
  const copy = async () => { try { await navigator.clipboard.writeText(sourceRef.current); setStatus({ type: "idle", message: "Configuration copied to the clipboard." }); } catch { setStatus({ type: "error", message: "Clipboard access was not available." }); } };
  const download = (target: ConfigFormat) => {
    try {
      const parsed = adapters[format].parse(sourceRef.current);
      if (parsed.value === undefined || parsed.diagnostics.some((item) => item.severity === "error")) throw new Error("Validate the current configuration before downloading it.");
      const text = serializeConfig(parsed.value, target, engine);
      const url = URL.createObjectURL(new Blob([text], { type: mimeType(target) }));
      const anchor = document.createElement("a"); anchor.href = url; anchor.download = `${program.outputBaseName}.${extension(target)}`; anchor.click(); URL.revokeObjectURL(url); setDownloadMenuOpen(false);
    } catch (cause) { setStatus({ type: "error", message: cause instanceof Error ? cause.message : String(cause) }); }
  };
  const loadVersion = (version: SchemaVersion) => { setTrackedPrimary(undefined); setStatus({ type: "working", message: `Loading ${version.label} schema...` }); setSelectedVersionId(version.id); setValidatedRevision(undefined); };
  const applyFix = (diagnostic: Diagnostic) => {
    if (!diagnostic.fix) return;
    const next = `${sourceRef.current.slice(0, diagnostic.fix.from)}${diagnostic.fix.replacement}${sourceRef.current.slice(diagnostic.fix.to)}`;
    updateSource(next);
    void validate();
  };
  const canDownload = validatedRevision === revision && status.type === "valid";

  return <section aria-labelledby="generic-title" className="workbench generic-workbench">
    <div className="workbench-intro"><div><p className="eyebrow">Local configuration lab</p><h1 id="generic-title">Config Schema Workbench</h1><p>Validate, lint, format, and convert JSON, YAML, or TOML with versioned program schemas.</p></div>
      <div className="select-stack unified-selects">
        <label>Program<select aria-label="Program" value={programId} onChange={(event) => { const id = event.target.value; const next = manifest.programs[id]; if (!next) return; setTrackedPrimary(undefined); setStatus({ type: "working", message: `Loading ${next.name} schema...` }); setProgramId(id); setSelectedFormat(next.defaultFormat); setSelectedVersionId(next.versions.find((version) => version.channel === "stable")?.id ?? next.versions[0]?.id ?? ""); }}>
          {programIds.map((id) => <option key={id} value={id}>{manifest.programs[id]?.name}</option>)}
        </select></label>
        <label>Configuration format<select aria-label="Configuration format" value={selectedFormat} onChange={(event) => { setSelectedFormat(event.target.value as SelectedFormat); setValidatedRevision(undefined); }}><option value="auto">Auto detect ({format.toUpperCase()})</option><option value="json">JSON</option><option value="yaml">YAML</option><option value="toml">TOML</option></select></label>
        <label>Website theme<select aria-label="Website theme" value={themeId} onChange={(event) => setEditorTheme(event.target.value as RainglowThemeId)}><optgroup label="Dark themes">{RAINGLOW_THEMES.filter((theme) => theme.variant === "dark").map((theme) => <option key={theme.id} value={theme.id}>{theme.name}</option>)}</optgroup><optgroup label="Light themes">{RAINGLOW_THEMES.filter((theme) => theme.variant === "light").map((theme) => <option key={theme.id} value={theme.id}>{theme.name}</option>)}</optgroup></select></label>
        <button className="button button-secondary select-version-button" disabled={Boolean(customPrimary)} onClick={() => setVersionModalOpen(true)} title={customPrimary ? "Remove the uploaded JSON Schema before selecting a tracked version." : "Choose a tracked schema version"} type="button">Select Version</button>
      </div>
    </div>

    <div className="schema-panel unified-schema-panel">
      <div className="active-schema"><span>Active schema</span><strong>{customPrimary?.fileName ?? selectedVersion?.label ?? "Unavailable"}</strong>{!customPrimary && selectedVersion ? <small>Last synced {formatSchemaSyncTime(selectedVersion.syncedAt)}</small> : <small>Custom upload</small>}</div>
      <div className="schema-upload"><span>Custom schema</span><label className="button button-secondary"><FileCode2 aria-hidden="true" size={17} /> Upload JSON Schema<input accept=".json,application/json" aria-label="Upload JSON Schema" className="visually-hidden" onChange={(event) => { void uploadPrimary(event.currentTarget.files?.[0]); event.currentTarget.value = ""; }} type="file" /></label>{customPrimary ? <button className="button button-quiet" onClick={() => { setCustomPrimary(undefined); setDependencies([]); setValidatedRevision(undefined); }} type="button"><X aria-hidden="true" size={16} /> Remove custom schema</button> : null}</div>
      {customPrimary ? <><div className="schema-upload"><span>Local references</span><label className="button button-secondary"><FileUp aria-hidden="true" size={17} /> {dependencies.length ? `${dependencies.length} loaded` : "Upload dependencies"}<input accept=".json,application/json" aria-label="Upload schema dependencies" className="visually-hidden" multiple onChange={(event) => { void uploadDependencies(event.currentTarget.files); event.currentTarget.value = ""; }} type="file" /></label></div><fieldset className="reference-mode"><legend>$ref policy</legend><label><input checked={referenceMode === "internal"} name="reference-mode" onChange={() => { setReferenceMode("internal"); setValidatedRevision(undefined); }} type="radio" /> Internal only</label><label><input checked={referenceMode === "bundle"} name="reference-mode" onChange={() => { setReferenceMode("bundle"); setValidatedRevision(undefined); }} type="radio" /> Uploaded local bundle</label></fieldset></> : null}
    </div>

    <div aria-label="Configuration actions" className="action-bar"><label className="button button-secondary"><FileUp aria-hidden="true" size={17} /> Upload config<input accept=".json,.yaml,.yml,.toml" aria-label="Upload configuration" className="visually-hidden" onChange={(event) => { void uploadConfig(event.currentTarget.files?.[0]); event.currentTarget.value = ""; }} type="file" /></label><button className="button button-primary" onClick={() => void validate()} type="button"><Play aria-hidden="true" size={17} /> Validate</button><button className="button button-secondary" onClick={() => void formatSource()} type="button"><Paintbrush aria-hidden="true" size={17} /> Format</button><LintSettingsDrawer onChange={updateLintSettings} settings={lintSettings} /><span className="action-spacer" /><button className="button button-quiet" onClick={() => void copy()} type="button"><Clipboard aria-hidden="true" size={17} /> Copy</button>
      <div className="download-control"><button aria-expanded={downloadMenuOpen} className="button button-quiet" onClick={() => setDownloadMenuOpen((open) => !open)} type="button"><Download aria-hidden="true" size={17} /> Download <ChevronDown aria-hidden="true" size={15} /></button>{downloadMenuOpen ? <div aria-label="Download format" className="download-menu" role="menu">{(["json", "yaml", "toml"] as const).map((target) => <button disabled={!canDownload} key={target} onClick={() => download(target)} role="menuitem" type="button">{target.toUpperCase()} <small>.{extension(target)}</small></button>)}</div> : null}</div>
      <button className="button button-danger" onClick={() => { sequence.current += 1; updateSource(""); setDiagnostics([]); }} type="button"><Trash2 aria-hidden="true" size={17} /> Clear</button>
    </div>
    <div className="editor-frame"><ConfigEditor ariaLabel={`${format.toUpperCase()} configuration editor`} diagnostics={diagnostics} language={format} onChange={updateSource} onCreateEditor={(view) => { editorRef.current = view; }} onValidationTrigger={() => void validate()} themeId={themeId} value={source} /></div>
    <div className={`validation-status status-${status.type}`} role={status.type === "error" ? "alert" : "status"}>{status.type === "working" ? <LoaderCircle aria-hidden="true" className="spin" size={18} /> : status.type === "valid" ? <Check aria-hidden="true" size={18} /> : status.type === "invalid" || status.type === "error" ? <TriangleAlert aria-hidden="true" size={18} /> : null}<span>{status.message}</span></div>
    <ProblemsPanel diagnostics={diagnostics} onFix={applyFix} onVisit={visit} />
    <p className="privacy-note">Configuration and schema files stay in this browser. Optional site visit metrics only start after consent.</p>
    {versionModalOpen ? <VersionPickerModal currentId={selectedVersionId} onClose={() => setVersionModalOpen(false)} onLoad={loadVersion} program={program} /> : null}
  </section>;
}
