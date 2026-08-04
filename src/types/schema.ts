import type { ConfigFormat } from "../formats/types";

export type SchemaChannel = "stable" | "alpha" | "archive";

export interface SchemaVersion {
  readonly id: string;
  readonly label: string;
  readonly channel: SchemaChannel;
  readonly version: string;
  readonly sha256: string;
  readonly sourceUrl: string;
  readonly assetPath: string;
  readonly syncedAt: string;
}

export interface SchemaProgram {
  readonly name: string;
  readonly defaultFormat: ConfigFormat;
  readonly outputBaseName: string;
  readonly versions: readonly SchemaVersion[];
}

export interface SchemaManifest {
  readonly generatedAt: string;
  readonly programs: Readonly<Record<string, SchemaProgram>>;
}
