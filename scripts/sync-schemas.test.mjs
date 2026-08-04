import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { sha256, synchronizeSchemas } from "./sync-schemas.mjs";

const stableSchema = JSON.stringify({
  type: "object",
  additionalProperties: false,
});
const alphaSchema = JSON.stringify({ type: "object", properties: {} });

function response(body, status = 200) {
  return new Response(body, { status });
}

test("writes exact tag schemas and manifest", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "codex-schema-sync-"));
  const fetchImpl = async (url) => {
    const value = String(url);
    if (value.endsWith("/releases?per_page=100")) {
      return response(
        JSON.stringify([
          { tag_name: "rust-v0.146.0", published_at: "2026-08-01T00:00:00Z", draft: false },
          { tag_name: "rust-v0.147.0-alpha.4", published_at: "2026-08-02T00:00:00Z", draft: false },
        ]),
      );
    }
    return response(value.includes("alpha.4") ? alphaSchema : stableSchema);
  };

  const result = await synchronizeSchemas({
    root,
    fetchImpl,
    now: () => new Date("2026-08-02T12:00:00Z"),
  });

  assert.equal(result.changed, true);
  assert.equal(
    await readFile(path.join(root, "stable/config.schema.json"), "utf8"),
    `${stableSchema}\n`,
  );
  const manifest = JSON.parse(
    await readFile(path.join(root, "manifest.json"), "utf8"),
  );
  assert.equal(manifest.channels.alpha.version, "v0.147.0-alpha.4");
  assert.equal(manifest.channels.stable.sha256, sha256(`${stableSchema}\n`));
  assert.equal(manifest.channels.stable.syncedAt, "2026-08-02T12:00:00.000Z");
  assert.equal(manifest.channels.alpha.syncedAt, "2026-08-02T12:00:00.000Z");
});

test("reports unchanged when tags and schema hashes match", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "codex-schema-sync-"));
  let requests = 0;
  const fetchImpl = async (url) => {
    requests += 1;
    const value = String(url);
    if (value.endsWith("/releases?per_page=100")) {
      return response(
        JSON.stringify([
          { tag_name: "rust-v0.146.0", published_at: "2026-08-01T00:00:00Z", draft: false },
          { tag_name: "rust-v0.147.0-alpha.4", published_at: "2026-08-02T00:00:00Z", draft: false },
        ]),
      );
    }
    return response(value.includes("alpha.4") ? alphaSchema : stableSchema);
  };

  await synchronizeSchemas({ root, fetchImpl, now: () => new Date(0) });
  const result = await synchronizeSchemas({ root, fetchImpl, now: () => new Date(1) });

  assert.equal(result.changed, false);
  assert.equal(requests, 6);
  assert.equal(result.manifest.channels.stable.syncedAt, "1970-01-01T00:00:00.000Z");
  assert.equal(result.manifest.channels.alpha.syncedAt, "1970-01-01T00:00:00.000Z");
});

test("updates only the timestamp for the channel whose release schema changed", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "codex-schema-sync-"));
  let alphaRevision = 1;
  const fetchImpl = async (url) => {
    const value = String(url);
    if (value.endsWith("/releases?per_page=100")) {
      return response(
        JSON.stringify([
          { tag_name: "rust-v0.146.0", published_at: "2026-08-01T00:00:00Z", draft: false },
          { tag_name: "rust-v0.147.0-alpha.4", published_at: "2026-08-02T00:00:00Z", draft: false },
        ]),
      );
    }
    return response(value.includes("alpha.4") ? JSON.stringify({ revision: alphaRevision }) : stableSchema);
  };

  await synchronizeSchemas({
    root,
    fetchImpl,
    now: () => new Date("2026-08-02T12:00:00Z"),
  });
  alphaRevision = 2;
  const result = await synchronizeSchemas({
    root,
    fetchImpl,
    now: () => new Date("2026-08-04T09:30:00Z"),
  });

  assert.equal(result.changed, true);
  assert.equal(result.manifest.channels.stable.syncedAt, "2026-08-02T12:00:00.000Z");
  assert.equal(result.manifest.channels.alpha.syncedAt, "2026-08-04T09:30:00.000Z");
});

test("migrates an unchanged channel timestamp from the old generatedAt field", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "codex-schema-sync-"));
  await mkdir(root, { recursive: true });
  await writeFile(path.join(root, "manifest.json"), `${JSON.stringify({
    generatedAt: "2026-08-01T08:00:00.000Z",
    channels: {
      stable: {
        version: "v0.146.0",
        tag: "rust-v0.146.0",
        sha256: sha256(`${stableSchema}\n`),
        sourceUrl: "https://example.test/stable",
      },
      alpha: {
        version: "v0.147.0-alpha.3",
        tag: "rust-v0.147.0-alpha.3",
        sha256: "0".repeat(64),
        sourceUrl: "https://example.test/alpha",
      },
    },
  }, null, 2)}\n`);
  const fetchImpl = async (url) => {
    const value = String(url);
    if (value.endsWith("/releases?per_page=100")) {
      return response(JSON.stringify([
        { tag_name: "rust-v0.146.0", published_at: "2026-08-01T00:00:00Z", draft: false },
        { tag_name: "rust-v0.147.0-alpha.4", published_at: "2026-08-02T00:00:00Z", draft: false },
      ]));
    }
    return response(value.includes("alpha.4") ? alphaSchema : stableSchema);
  };

  const result = await synchronizeSchemas({
    root,
    fetchImpl,
    now: () => new Date("2026-08-04T09:30:00Z"),
  });

  assert.equal(result.manifest.channels.stable.syncedAt, "2026-08-01T08:00:00.000Z");
  assert.equal(result.manifest.channels.alpha.syncedAt, "2026-08-04T09:30:00.000Z");
});

test("rejects malformed schema JSON without replacing files", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "codex-schema-sync-"));
  const fetchImpl = async (url) => {
    if (String(url).endsWith("/releases?per_page=100")) {
      return response(
        JSON.stringify([
          { tag_name: "rust-v0.146.0", published_at: "2026-08-01T00:00:00Z", draft: false },
          { tag_name: "rust-v0.147.0-alpha.4", published_at: "2026-08-02T00:00:00Z", draft: false },
        ]),
      );
    }
    return response("not-json");
  };

  await assert.rejects(
    synchronizeSchemas({ root, fetchImpl, now: () => new Date(0) }),
    /valid JSON/u,
  );
});
