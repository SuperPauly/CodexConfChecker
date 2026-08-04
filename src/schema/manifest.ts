import type { ConfigFormat } from "../formats/types";
import type { SchemaChannel, SchemaManifest, SchemaProgram, SchemaVersion } from "../types/schema";

function assertRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new TypeError(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function assertString(value: unknown, label: string, pattern?: RegExp): string {
  if (typeof value !== "string" || value.length === 0) throw new TypeError(`${label} must be a non-empty string`);
  if (pattern && !pattern.test(value)) throw new TypeError(`${label} has an invalid format`);
  return value;
}

function assertTimestamp(value: unknown, label: string): string {
  const timestamp = assertString(value, label);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(timestamp) || Number.isNaN(Date.parse(timestamp))) throw new TypeError(`${label} must be an ISO 8601 UTC timestamp`);
  return timestamp;
}

function parseVersion(value: unknown, label: string): SchemaVersion {
  const entry = assertRecord(value, label);
  const channel = assertString(entry.channel, `${label}.channel`);
  if (!(["stable", "alpha", "archive"] as const).includes(channel as SchemaChannel)) throw new TypeError(`${label}.channel is invalid`);
  return {
    id: assertString(entry.id, `${label}.id`, /^[A-Za-z0-9][A-Za-z0-9._-]*$/u),
    label: assertString(entry.label, `${label}.label`),
    channel: channel as SchemaChannel,
    version: assertString(entry.version, `${label}.version`),
    sha256: assertString(entry.sha256, `${label}.sha256`, /^[a-f0-9]{64}$/u),
    sourceUrl: assertString(entry.sourceUrl, `${label}.sourceUrl`, /^https:\/\//u),
    assetPath: assertString(entry.assetPath, `${label}.assetPath`, /^schemas\/[A-Za-z0-9._/-]+\.json$/u),
    syncedAt: assertTimestamp(entry.syncedAt, `${label}.syncedAt`),
  };
}

function parseProgram(value: unknown, id: string): SchemaProgram {
  const entry = assertRecord(value, `programs.${id}`);
  const defaultFormat = assertString(entry.defaultFormat, `programs.${id}.defaultFormat`);
  if (!(["json", "yaml", "toml"] as const).includes(defaultFormat as ConfigFormat)) throw new TypeError(`programs.${id}.defaultFormat is invalid`);
  if (!Array.isArray(entry.versions) || entry.versions.length === 0) throw new TypeError(`programs.${id}.versions must be a non-empty array`);
  const versions = entry.versions.map((item, index) => parseVersion(item, `programs.${id}.versions.${index}`));
  if (new Set(versions.map((item) => item.id)).size !== versions.length) throw new TypeError(`programs.${id}.versions contains a duplicate id`);
  return {
    name: assertString(entry.name, `programs.${id}.name`),
    defaultFormat: defaultFormat as ConfigFormat,
    outputBaseName: assertString(entry.outputBaseName, `programs.${id}.outputBaseName`, /^[A-Za-z0-9][A-Za-z0-9._-]*$/u),
    versions,
  };
}

export function formatSchemaSyncTime(timestamp: string): string {
  return new Intl.DateTimeFormat(undefined, { day: "numeric", hour: "2-digit", minute: "2-digit", month: "short", timeZoneName: "short", year: "numeric" }).format(new Date(timestamp));
}

export function parseSchemaManifest(value: unknown): SchemaManifest {
  const root = assertRecord(value, "manifest");
  const rawPrograms = assertRecord(root.programs, "programs");
  const programs = Object.fromEntries(Object.entries(rawPrograms).map(([id, program]) => [id, parseProgram(program, id)]));
  if (!Object.keys(programs).length) throw new TypeError("programs must not be empty");
  return { generatedAt: assertTimestamp(root.generatedAt, "generatedAt"), programs };
}

export function schemaAssetUrl(version: Pick<SchemaVersion, "assetPath">): string {
  return `${import.meta.env.BASE_URL}${version.assetPath}`;
}
