import { Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type { SchemaProgram, SchemaVersion } from "../types/schema";

interface VersionPickerModalProps {
  readonly currentId: string;
  readonly onClose: () => void;
  readonly onLoad: (version: SchemaVersion) => void;
  readonly program: SchemaProgram;
}

export function VersionPickerModal({ currentId, onClose, onLoad, program }: VersionPickerModalProps) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(currentId);
  const stable = program.versions.find((version) => version.channel === "stable");
  const alpha = program.versions.find((version) => version.channel === "alpha");
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle ? program.versions.filter((version) => `${version.label} ${version.version}`.toLowerCase().includes(needle)) : program.versions;
  }, [program.versions, query]);
  const selected = program.versions.find((version) => version.id === selectedId);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  const load = (version: SchemaVersion | undefined) => {
    if (!version) return;
    onLoad(version);
    onClose();
  };

  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section aria-labelledby="version-modal-title" aria-modal="true" className="version-modal" role="dialog">
      <header className="version-modal-header">
        <div><p className="eyebrow">{program.name}</p><h2 id="version-modal-title">Select {program.name} schema version</h2></div>
        <button aria-label="Close version selector" className="icon-button" onClick={onClose} type="button"><X aria-hidden="true" size={20} /></button>
      </header>
      <div className="latest-version-actions">
        <button className="button button-primary" disabled={!stable} onClick={() => load(stable)} type="button">Latest Stable</button>
        <button className="button button-secondary" disabled={!alpha} onClick={() => load(alpha)} type="button">Latest Alpha</button>
      </div>
      <label className="version-search"><span>Search versions</span><div><Search aria-hidden="true" size={17} /><input aria-label="Search versions" list="schema-version-options" onChange={(event) => setQuery(event.target.value)} placeholder="Type a version, for example v0.147" value={query} /></div></label>
      <datalist id="schema-version-options">{program.versions.map((version) => <option key={version.id} value={version.version} />)}</datalist>
      <div aria-label="Available schema versions" className="version-list" role="radiogroup">
        {filtered.map((version) => <label className="version-row" key={version.id}>
          <input checked={selectedId === version.id} name="schema-version" onChange={() => setSelectedId(version.id)} type="radio" />
          <span><strong>{version.label}</strong><small>{version.channel === "archive" ? "Archived release" : version.channel === "alpha" ? "Latest alpha" : "Current stable"}</small></span>
        </label>)}
        {!filtered.length ? <p className="version-empty">No schema versions match that search.</p> : null}
      </div>
      <footer className="version-modal-footer"><button className="button button-quiet" onClick={onClose} type="button">Cancel</button><button className="button button-primary" disabled={!selected} onClick={() => load(selected)} type="button">Load</button></footer>
    </section>
  </div>;
}
