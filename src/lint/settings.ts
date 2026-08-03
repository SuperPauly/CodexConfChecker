import type { DiagnosticSeverity } from "../diagnostics/types";
import { LINT_RULES, LINT_RULE_BY_ID, type LintRuleId } from "./catalog";

export const LINT_SETTINGS_KEY = "codex-config-checker.lint-settings";

export interface LintRuleSetting {
  readonly severity: DiagnosticSeverity | "off";
  readonly options: Readonly<Record<string, string | number | boolean>>;
}

export type LintSettings = Record<LintRuleId, LintRuleSetting>;

export const DEFAULT_LINT_SETTINGS = Object.fromEntries(
  LINT_RULES.map((rule) => [rule.id, {
    severity: rule.defaultSeverity,
    options: Object.fromEntries(rule.options.map((option) => [option.key, option.defaultValue])),
  }]),
) as LintSettings;

function parseSetting(ruleId: string, input: unknown): LintRuleSetting {
  const definition = LINT_RULE_BY_ID.get(ruleId);
  if (!definition) throw new Error(`Unknown rule \`${ruleId}\`.`);
  if (!input || typeof input !== "object") throw new Error(`Rule \`${ruleId}\` must contain severity and options.`);
  const candidate = input as { severity?: unknown; options?: unknown };
  if (!(["off", "info", "warning", "error"] as const).includes(candidate.severity as never)) {
    throw new Error(`Rule \`${ruleId}\` has an invalid severity.`);
  }
  const optionsInput = candidate.options && typeof candidate.options === "object"
    ? candidate.options as Record<string, unknown>
    : {};
  const unknownOption = Object.keys(optionsInput).find((key) => !definition.options.some((option) => option.key === key));
  if (unknownOption) throw new Error(`Rule \`${ruleId}\` has unknown option \`${unknownOption}\`.`);
  const options: Record<string, string | number | boolean> = {};
  for (const option of definition.options) {
    const value = optionsInput[option.key] ?? option.defaultValue;
    if (option.type === "number") {
      if (typeof value !== "number" || !Number.isFinite(value) || value < (option.minimum ?? -Infinity) || value > (option.maximum ?? Infinity)) {
        throw new Error(`Rule \`${ruleId}\` option \`${option.key}\` must be between ${option.minimum} and ${option.maximum}.`);
      }
    } else if (option.type === "boolean" && typeof value !== "boolean") {
      throw new Error(`Rule \`${ruleId}\` option \`${option.key}\` must be true or false.`);
    } else if ((option.type === "string" || option.type === "select") && typeof value !== "string") {
      throw new Error(`Rule \`${ruleId}\` option \`${option.key}\` must be text.`);
    } else if (option.type === "select" && !option.choices?.includes(value as string)) {
      throw new Error(`Rule \`${ruleId}\` option \`${option.key}\` must be one of ${option.choices?.join(", ")}.`);
    }
    if (ruleId === "toml/key-naming" && option.key === "pattern") {
      try { new RegExp(String(value)); } catch { throw new Error("TOML key naming pattern is not a valid regular expression."); }
    }
    options[option.key] = value as string | number | boolean;
  }
  return { severity: candidate.severity as LintRuleSetting["severity"], options };
}

export function parseLintSettings(input: unknown): LintSettings {
  let value = input;
  if (typeof input === "string") {
    try { value = JSON.parse(input) as unknown; } catch { throw new Error("Lint settings are not valid JSON."); }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Lint settings must be a JSON object.");
  const candidate = value as Record<string, unknown>;
  for (const id of Object.keys(candidate)) if (!LINT_RULE_BY_ID.has(id)) throw new Error(`Unknown rule \`${id}\`.`);
  return Object.fromEntries(LINT_RULES.map((rule) => [
    rule.id,
    candidate[rule.id] === undefined
      ? structuredClone(DEFAULT_LINT_SETTINGS[rule.id])
      : parseSetting(rule.id, candidate[rule.id]),
  ])) as LintSettings;
}

export function loadLintSettings(): LintSettings {
  const stored = localStorage.getItem(LINT_SETTINGS_KEY);
  if (!stored) return structuredClone(DEFAULT_LINT_SETTINGS);
  try { return parseLintSettings(stored); } catch { return structuredClone(DEFAULT_LINT_SETTINGS); }
}

export function saveLintSettings(settings: LintSettings): void {
  const validated = parseLintSettings(settings);
  localStorage.setItem(LINT_SETTINGS_KEY, JSON.stringify(validated));
}

export function exportLintSettings(settings: LintSettings): string {
  return `${JSON.stringify(parseLintSettings(settings), null, 2)}\n`;
}
