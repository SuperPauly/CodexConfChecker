import { ChevronDown, ChevronRight, CircleAlert, CircleCheck, Clipboard, Info, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";

import { diagnosticCountSummary, diagnosticReport } from "../diagnostics/summary";
import type { Diagnostic, DiagnosticSeverity } from "../diagnostics/types";

export interface ProblemsPanelProps {
  readonly diagnostics: readonly Diagnostic[];
  readonly onVisit: (diagnostic: Diagnostic) => void;
}

const icons = { error: CircleAlert, warning: TriangleAlert, info: Info };
const severityLabels = { error: "Errors", warning: "Warnings", info: "Information" } as const;
const severityOrder = ["error", "warning", "info"] as const;

function ProblemItem({ diagnostic, index, onVisit }: { readonly diagnostic: Diagnostic; readonly index: number; readonly onVisit: (diagnostic: Diagnostic) => void }) {
  const Icon = icons[diagnostic.severity];
  return <li className={`problem-item problem-${diagnostic.severity}`} key={`${diagnostic.ruleId}-${diagnostic.from}-${index}`}>
    <div className="problem-summary">
      <Icon aria-hidden="true" size={18} />
      <div><strong>{diagnostic.message}</strong><small>{diagnostic.source} · {diagnostic.ruleId}</small></div>
      {diagnostic.hasSourceLocation === false ? <span className="schema-level-label">Schema level</span> : <button aria-label={`Go to line ${diagnostic.line}, column ${diagnostic.column}`} onClick={() => onVisit(diagnostic)} title="Go to highlighted source" type="button">Ln {diagnostic.line}:{diagnostic.column}<ChevronRight aria-hidden="true" size={15} /></button>}
    </div>
    <div className="problem-detail">
      <p><b>Why:</b> {diagnostic.explanation}</p>
      {diagnostic.suggestion ? <p><b>Fix:</b> {diagnostic.suggestion}</p> : null}
      <div className="problem-metadata">
        {diagnostic.expected ? <code>Expected: {diagnostic.expected}</code> : null}
        {diagnostic.actual ? <code>Actual: {diagnostic.actual}</code> : null}
        {diagnostic.dataPath !== undefined ? <code>Data path: {diagnostic.dataPath || "/"}</code> : null}
        {diagnostic.schemaPath ? <code>Schema path: {diagnostic.schemaPath}</code> : null}
      </div>
    </div>
  </li>;
}

export function ProblemsPanel({ diagnostics, onVisit }: ProblemsPanelProps) {
  const [severity, setSeverity] = useState<DiagnosticSeverity | "all">("all");
  const [source, setSource] = useState("all");
  const [expanded, setExpanded] = useState<ReadonlySet<DiagnosticSeverity>>(() => new Set(["error"]));
  const sources = useMemo(() => [...new Set(diagnostics.map((item) => item.source))], [diagnostics]);
  const visible = diagnostics.filter((item) => (severity === "all" || item.severity === severity) && (source === "all" || item.source === source));
  const groups = severityOrder.map((groupSeverity) => ({ severity: groupSeverity, items: visible.filter((item) => item.severity === groupSeverity) })).filter((group) => group.items.length > 0);
  const toggle = (groupSeverity: DiagnosticSeverity) => setExpanded((current) => {
    const next = new Set(current);
    if (next.has(groupSeverity)) next.delete(groupSeverity); else next.add(groupSeverity);
    return next;
  });
  const copyReport = async () => navigator.clipboard.writeText(diagnosticReport(visible));

  return (
    <section className="problems rich-problems" aria-labelledby="problems-title">
      <div className="problems-heading">
        <h2 id="problems-title">Problems</h2><span title={diagnosticCountSummary(diagnostics)}>{diagnostics.length}</span>
        <label>Severity filter
          <select aria-label="Severity filter" value={severity} onChange={(event) => setSeverity(event.target.value as DiagnosticSeverity | "all")}>
            <option value="all">All severities</option><option value="error">Errors</option><option value="warning">Warnings</option><option value="info">Information</option>
          </select>
        </label>
        <label>Source filter
          <select aria-label="Source filter" value={source} onChange={(event) => setSource(event.target.value)}>
            <option value="all">All sources</option>{sources.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        {visible.length ? <div className="problem-tools"><button onClick={() => setExpanded(new Set(groups.map((group) => group.severity)))} type="button">Expand all</button><button onClick={() => setExpanded(new Set())} type="button">Collapse all</button><button onClick={() => void copyReport()} type="button"><Clipboard aria-hidden="true" size={14} /> Copy report</button></div> : null}
      </div>
      {visible.length === 0 ? <div className="empty-problems"><CircleCheck aria-hidden="true" size={18} /> {diagnostics.length ? "No problems match these filters." : "No reported problems."}</div> : (
        <div className="problem-groups">{groups.map((group) => <section className={`problem-group group-${group.severity}`} key={group.severity}><button aria-expanded={expanded.has(group.severity)} className="problem-group-toggle" onClick={() => toggle(group.severity)} type="button"><span>{severityLabels[group.severity]}</span><strong>{group.items.length}</strong><ChevronDown aria-hidden="true" size={17} /></button>{expanded.has(group.severity) ? <ol>{group.items.map((diagnostic, index) => <ProblemItem diagnostic={diagnostic} index={index} key={`${diagnostic.ruleId}-${diagnostic.from}-${index}`} onVisit={onVisit} />)}</ol> : null}</section>)}</div>
      )}
    </section>
  );
}
