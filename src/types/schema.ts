export type SchemaChannel = "stable" | "alpha";

export interface SchemaEntry {
  readonly version: string;
  readonly tag: string;
  readonly sha256: string;
  readonly sourceUrl: string;
  readonly syncedAt: string;
}

export interface SchemaManifest {
  readonly generatedAt: string;
  readonly channels: Readonly<Record<SchemaChannel, SchemaEntry>>;
}
