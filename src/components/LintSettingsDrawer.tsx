import { Download, RotateCcw, Search, Settings2, Upload, X } from "lucide-react";
import { useRef, useState } from "react";

import { LINT_RULES } from "../lint/catalog";
import { DEFAULT_LINT_SETTINGS, exportLintSettings, parseLintSettings, type LintSettings } from "../lint/settings";

export interface LintSettingsDrawerProps {
  readonly settings: LintSettings;
  readonly onChange: (settings: LintSettings) => void;
}

export function LintSettingsDrawer({ settings, onChange }: LintSettingsDrawerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement | null>(null);
  const visible = LINT_RULES.filter((rule) => `${rule.name} ${rule.id} ${rule.description}`.toLowerCase().includes(query.toLowerCase()));
  const updateRule = (id: keyof LintSettings, key: "severity" | string, value: string | number | boolean) => {
    const next = structuredClone(settings);
    const current = next[id];
    if (!current) return;
    next[id] = key === "severity" ? { ...current, severity: value as typeof current.severity } : { ...current, options: { ...current.options, [key]: value } };
    onChange(next);
  };
  const importSettings = async (file: File | undefined) => {
    if (!file) return;
    try { onChange(parseLintSettings(await file.text())); setError(""); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([exportLintSettings(settings)], { type: "application/json" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = "config-lint-rules.json"; anchor.click(); URL.revokeObjectURL(url);
  };
  return <>
    <button className="button button-secondary" onClick={() => setOpen(true)} type="button"><Settings2 aria-hidden="true" size={17} /> Lint rules</button>
    {open ? <div className="drawer-backdrop" role="presentation">
      <aside aria-label="Lint rules" className="lint-drawer">
        <header><div><p className="eyebrow">Quality settings</p><h2>Lint rules</h2><p>Set every rule to off, info, warning, or error.</p></div><button aria-label="Close lint rules" className="icon-button" onClick={() => setOpen(false)} type="button"><X aria-hidden="true" /></button></header>
        <div className="drawer-toolbar">
          <label className="search-field"><Search aria-hidden="true" size={16} /><input aria-label="Search lint rules" onChange={(event) => setQuery(event.target.value)} placeholder="Search rules" role="searchbox" value={query} /></label>
          <button className="button button-secondary" onClick={() => fileRef.current?.click()} type="button"><Upload aria-hidden="true" size={15} /> Import</button>
          <input accept="application/json,.json" className="visually-hidden" onChange={(event) => { void importSettings(event.target.files?.[0]); event.target.value = ""; }} ref={fileRef} type="file" />
          <button className="button button-secondary" onClick={download} type="button"><Download aria-hidden="true" size={15} /> Export</button>
          <button className="button button-danger" onClick={() => onChange(DEFAULT_LINT_SETTINGS)} type="button"><RotateCcw aria-hidden="true" size={15} /> Reset rules</button>
        </div>
        {error ? <p className="drawer-error" role="alert">{error}</p> : null}
        <div className="rule-list">{visible.map((rule) => {
          const current = settings[rule.id];
          if (!current) return null;
          return <article className="rule-card" key={rule.id}>
          <div className="rule-heading"><div><h3>{rule.name}</h3><code>{rule.id}</code></div><label>{rule.name} severity<select aria-label={`${rule.name} severity`} onChange={(event) => updateRule(rule.id, "severity", event.target.value)} value={current.severity}><option value="off">Off</option><option value="info">Info</option><option value="warning">Warning</option><option value="error">Error</option></select></label></div>
          <p>{rule.description}</p><p className="rule-rationale">Why: {rule.rationale}</p>
          {rule.options.length ? <div className="rule-options">{rule.options.map((option) => <label key={option.key}>{option.label}{option.type === "boolean" ? <input checked={Boolean(current.options[option.key])} onChange={(event) => updateRule(rule.id, option.key, event.target.checked)} type="checkbox" /> : option.type === "select" ? <select aria-label={option.label} onChange={(event) => updateRule(rule.id, option.key, event.target.value)} value={String(current.options[option.key])}>{option.choices?.map((choice) => <option key={choice}>{choice}</option>)}</select> : <input aria-label={option.label} max={option.maximum} min={option.minimum} onChange={(event) => updateRule(rule.id, option.key, option.type === "number" ? Number(event.target.value) : event.target.value)} type={option.type === "number" ? "number" : "text"} value={String(current.options[option.key])} />}</label>)}</div> : null}
          <details><summary>Examples</summary><div className="rule-examples"><div><span>Avoid</span><pre>{rule.badExample}</pre></div><div><span>Prefer</span><pre>{rule.goodExample}</pre></div></div></details>
        </article>; })}</div>
      </aside>
    </div> : null}
  </>;
}
