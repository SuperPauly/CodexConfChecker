import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
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
