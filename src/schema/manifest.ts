import type {
  SchemaChannel,
  SchemaEntry,
  SchemaManifest,
} from "../types/schema";

function assertRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function assertString(
  value: unknown,
  label: string,
  pattern?: RegExp,
): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${label} must be a non-empty string`);
  }
  if (pattern && !pattern.test(value)) {
    throw new TypeError(`${label} has an invalid format`);
  }
  return value;
}

function assertTimestamp(value: unknown, label: string): string {
  const timestamp = assertString(value, label);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(timestamp) || Number.isNaN(Date.parse(timestamp))) {
    throw new TypeError(`${label} must be an ISO 8601 UTC timestamp`);
  }
  return timestamp;
}

function parseEntry(value: unknown, channel: SchemaChannel): SchemaEntry {
  const entry = assertRecord(value, channel);
  return {
    version: assertString(entry.version, `${channel}.version`),
    tag: assertString(entry.tag, `${channel}.tag`, /^rust-v/u),
    sha256: assertString(
      entry.sha256,
      `${channel}.sha256`,
      /^[a-f0-9]{64}$/u,
    ),
    sourceUrl: assertString(
      entry.sourceUrl,
      `${channel}.sourceUrl`,
      /^https:\/\//u,
    ),
    syncedAt: assertTimestamp(entry.syncedAt, `${channel}.syncedAt`),
  };
}

export function formatSchemaSyncTime(timestamp: string): string {
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    timeZoneName: "short",
    year: "numeric",
  }).format(new Date(timestamp));
}

export function parseSchemaManifest(value: unknown): SchemaManifest {
  const root = assertRecord(value, "manifest");
  const channels = assertRecord(root.channels, "channels");
  return {
    generatedAt: assertString(root.generatedAt, "generatedAt"),
    channels: {
      stable: parseEntry(channels.stable, "stable"),
      alpha: parseEntry(channels.alpha, "alpha"),
    },
  };
}

export function schemaAssetUrl(channel: SchemaChannel): string {
  return `${import.meta.env.BASE_URL}schemas/${channel}/config.schema.json`;
}
