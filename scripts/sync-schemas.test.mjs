import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { GEMINI_SCHEMA_URL, HERMES_SCHEMA_URL, sha256, synchronizeSchemas } from "./sync-schemas.mjs";

const stableSchema = JSON.stringify({ type: "object", title: "stable" });
const alphaSix = JSON.stringify({ type: "object", title: "alpha six" });
const alphaSeven = JSON.stringify({ type: "object", title: "alpha seven" });
const stableUrl = "https://learn.chatgpt.com/docs/config-schema.json";
const assetUrl = "https://downloads.example/config-schema.json";
const geminiSchema = JSON.stringify({ $schema: "https://json-schema.org/draft/2020-12/schema", title: "Gemini" });
const hermesSchema = JSON.stringify({ $schema: "https://json-schema.org/draft/2020-12/schema", title: "Hermes" });

function response(body, status = 200) { return new Response(body, { status }); }

function releases(tag = "rust-v0.147.0-alpha.7", assetName = "config-schema.json") {
  return [{
    tag_name: tag,
    name: tag.replace("rust-v", ""),
    published_at: "2026-08-04T11:50:00Z",
    draft: false,
    prerelease: true,
    html_url: `https://github.com/openai/codex/releases/tag/${tag}`,
    assets: [{ name: assetName, browser_download_url: assetUrl }],
  }];
}

function fetcher(schema = alphaSeven, releaseList = releases()) {
  return async (url) => {
    const value = String(url);
    if (value.includes("/releases?")) return response(JSON.stringify(releaseList));
    if (value === stableUrl) return response(stableSchema);
    if (value === assetUrl) return response(schema);
    if (value === GEMINI_SCHEMA_URL) return response(geminiSchema);
    if (value === HERMES_SCHEMA_URL) return response(hermesSchema);
    return response("not found", 404);
  };
}

test("gets current stable from ChatGPT docs and alpha from the exact release asset", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "codex-registry-"));
  const requested = [];
  const baseFetch = fetcher();
  const result = await synchronizeSchemas({
    root,
    fetchImpl: async (url, options) => { requested.push(String(url)); return baseFetch(url, options); },
    now: () => new Date("2026-08-04T12:00:00Z"),
  });

  assert.equal(result.changed, true);
  assert.ok(requested.includes(stableUrl));
  assert.ok(requested.includes(assetUrl));
  assert.equal(await readFile(path.join(root, "codex/stable-current/config-schema.json"), "utf8"), `${stableSchema}\n`);
  assert.equal(await readFile(path.join(root, "codex/releases/rust-v0.147.0-alpha.7/config-schema.json"), "utf8"), `${alphaSeven}\n`);
  assert.equal(result.manifest.programs.codex.versions[0].id, "stable-current");
  assert.equal(result.manifest.programs.codex.versions[1].version, "v0.147.0-alpha.7");
  assert.equal(result.manifest.programs.codex.versions[0].sha256, sha256(`${stableSchema}\n`));
  assert.equal(result.manifest.programs.gemini.versions[0].version, "main");
  assert.equal(result.manifest.programs.hermes.versions[0].version, "0f702c2");
  assert.equal(await readFile(path.join(root, "gemini/main/settings.schema.json"), "utf8"), `${geminiSchema}\n`);
  assert.equal(await readFile(path.join(root, "hermes/0f702c2/hermes-config.schema.json"), "utf8"), `${hermesSchema}\n`);
});

test("retains older alpha versions when a newer release appears", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "codex-registry-"));
  await synchronizeSchemas({ root, fetchImpl: fetcher(alphaSix, releases("rust-v0.147.0-alpha.6")), now: () => new Date("2026-08-03T12:00:00Z") });
  const result = await synchronizeSchemas({ root, fetchImpl: fetcher(), now: () => new Date("2026-08-04T12:00:00Z") });

  assert.deepEqual(result.manifest.programs.codex.versions.map((entry) => entry.id), [
    "stable-current",
    "rust-v0.147.0-alpha.7",
    "rust-v0.147.0-alpha.6",
  ]);
  assert.equal(await readFile(path.join(root, "codex/releases/rust-v0.147.0-alpha.6/config-schema.json"), "utf8"), `${alphaSix}\n`);
});

test("reports unchanged when source hashes and latest alpha match", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "codex-registry-"));
  await synchronizeSchemas({ root, fetchImpl: fetcher(), now: () => new Date(0) });
  const result = await synchronizeSchemas({ root, fetchImpl: fetcher(), now: () => new Date(1) });
  assert.equal(result.changed, false);
  assert.equal(result.manifest.programs.codex.versions[0].syncedAt, "1970-01-01T00:00:00.000Z");
});

test("requires the alpha release asset named config-schema.json", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "codex-registry-"));
  await assert.rejects(synchronizeSchemas({ root, fetchImpl: fetcher(alphaSeven, releases("rust-v0.147.0-alpha.7", "codex.zip")) }), /config-schema\.json/u);
});

test("does not write malformed schema JSON", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "codex-registry-"));
  await assert.rejects(synchronizeSchemas({ root, fetchImpl: fetcher("not json") }), /valid JSON/u);
});
