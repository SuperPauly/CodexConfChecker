import { access, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { normalizeVersion } from "./release-selection.mjs";

const RELEASES_URL = "https://api.github.com/repos/openai/codex/releases?per_page=100";
const STABLE_SCHEMA_URL = "https://learn.chatgpt.com/docs/config-schema.json";
export const GEMINI_SCHEMA_URL = "https://raw.githubusercontent.com/google-gemini/gemini-cli/main/schemas/settings.schema.json";
export const HERMES_SCHEMA_URL = "https://raw.githubusercontent.com/dbydd/hermes-agent/0f702c2dd7a75e532698f5590e5ceb80e747e41e/website/static/schemas/hermes-config.schema.json";
const RELEASE_TAG = /^rust-v\d+\.\d+\.\d+(?:-alpha(?:\.\d+)*)?$/u;
const ALPHA_TAG = /-alpha(?:\.|$)/u;
const ASSET_NAME = "config-schema.json";

export function sha256(text) { return createHash("sha256").update(text, "utf8").digest("hex"); }

function requestHeaders() {
  const headers = { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "SuperPauly-CodexConfChecker" };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return headers;
}

async function fetchText(fetchImpl, url) {
  const response = await fetchImpl(url, { headers: requestHeaders() });
  if (!response.ok) throw new Error(`Request failed with HTTP ${response.status}: ${url}`);
  return await response.text();
}

function parseJson(text, label) {
  try { return JSON.parse(text); } catch (error) { throw new Error(`${label} did not contain valid JSON`, { cause: error }); }
}

function normalizeSchema(text, label) {
  const parsed = parseJson(text, label);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error(`${label} must be a JSON object`);
  return text.endsWith("\n") ? text : `${text}\n`;
}

function releaseTimestamp(release) {
  const value = Date.parse(release.published_at ?? "");
  return Number.isNaN(value) ? 0 : value;
}

function schemaReleases(releases) {
  if (!Array.isArray(releases)) throw new TypeError("GitHub releases response must be an array");
  return releases
    .filter((release) => release && release.draft !== true && typeof release.tag_name === "string" && RELEASE_TAG.test(release.tag_name))
    .map((release) => ({ release, asset: Array.isArray(release.assets) ? release.assets.find((asset) => asset?.name === ASSET_NAME && typeof asset.browser_download_url === "string") : undefined }))
    .filter((item) => item.asset)
    .sort((left, right) => releaseTimestamp(right.release) - releaseTimestamp(left.release));
}

async function readExistingManifest(root) {
  try { return parseJson(await readFile(path.join(root, "manifest.json"), "utf8"), "Existing manifest"); }
  catch (error) { if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return undefined; throw error; }
}

async function writeAtomic(target, text) {
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.tmp`;
  await writeFile(temporary, text, { encoding: "utf8", mode: 0o644 });
  await rename(temporary, target);
}

function existingVersions(manifest) {
  const versions = manifest?.programs?.codex?.versions;
  return Array.isArray(versions) ? versions : [];
}

function synchronizedEntry(previous, entry, text, synchronizedAt) {
  const hash = sha256(text);
  const old = previous?.programs?.[entry.programId]?.versions?.find((version) => version.id === entry.id);
  return { value: { ...entry, sha256: hash, syncedAt: old?.sha256 === hash ? old.syncedAt : synchronizedAt }, changed: old?.sha256 !== hash };
}

function releaseEntry(item, synchronizedAt, latestAlpha) {
  const tag = item.release.tag_name;
  const alpha = ALPHA_TAG.test(tag);
  return {
    id: tag,
    label: normalizeVersion(tag),
    channel: alpha && tag === latestAlpha ? "alpha" : "archive",
    version: normalizeVersion(tag),
    sha256: item.sha256,
    sourceUrl: item.asset.browser_download_url,
    assetPath: `schemas/codex/releases/${tag}/config-schema.json`,
    syncedAt: synchronizedAt,
  };
}

export async function synchronizeSchemas({ root, fetchImpl = globalThis.fetch, now = () => new Date() }) {
  if (typeof fetchImpl !== "function") throw new TypeError("A fetch implementation is required");
  const existing = await readExistingManifest(root);
  const previous = existingVersions(existing);
  const previousById = new Map(previous.map((entry) => [entry.id, entry]));

  const [stableRaw, releasesRaw, geminiRaw, hermesRaw] = await Promise.all([
    fetchText(fetchImpl, STABLE_SCHEMA_URL),
    fetchText(fetchImpl, RELEASES_URL),
    fetchText(fetchImpl, GEMINI_SCHEMA_URL),
    fetchText(fetchImpl, HERMES_SCHEMA_URL),
  ]);
  const stableText = normalizeSchema(stableRaw, "stable schema");
  const geminiText = normalizeSchema(geminiRaw, "Gemini schema");
  const hermesText = normalizeSchema(hermesRaw, "Hermes schema");
  const releaseItems = schemaReleases(parseJson(releasesRaw, "GitHub releases response"));
  const latestAlphaItem = releaseItems.find((item) => ALPHA_TAG.test(item.release.tag_name));
  if (!latestAlphaItem) throw new Error(`No Codex alpha release with a ${ASSET_NAME} asset was found`);

  const synchronizedAt = now().toISOString();
  const gemini = synchronizedEntry(existing, {
    programId: "gemini", id: "main", label: "Current main", channel: "stable", version: "main",
    sourceUrl: GEMINI_SCHEMA_URL, assetPath: "schemas/gemini/main/settings.schema.json",
  }, geminiText, synchronizedAt);
  const hermes = synchronizedEntry(existing, {
    programId: "hermes", id: "0f702c2", label: "Pinned 0f702c2", channel: "stable", version: "0f702c2",
    sourceUrl: HERMES_SCHEMA_URL, assetPath: "schemas/hermes/0f702c2/hermes-config.schema.json",
  }, hermesText, synchronizedAt);
  const downloaded = await Promise.all(releaseItems.map(async (item) => {
    const old = previousById.get(item.release.tag_name);
    if (old) {
      return { ...item, sha256: old.sha256, text: undefined, syncedAt: old.syncedAt };
    }
    const text = normalizeSchema(await fetchText(fetchImpl, item.asset.browser_download_url), `${item.release.tag_name} schema`);
    return { ...item, sha256: sha256(text), text, syncedAt: synchronizedAt };
  }));

  const stableHash = sha256(stableText);
  const oldStable = previousById.get("stable-current");
  const stableChanged = oldStable?.sha256 !== stableHash;
  const stable = {
    id: "stable-current",
    label: "Current stable",
    channel: "stable",
    version: "Current stable",
    sha256: stableHash,
    sourceUrl: STABLE_SCHEMA_URL,
    assetPath: "schemas/codex/stable-current/config-schema.json",
    syncedAt: stableChanged ? synchronizedAt : oldStable.syncedAt,
  };
  const currentReleaseVersions = downloaded.map((item) => ({
    ...releaseEntry(item, item.syncedAt, latestAlphaItem.release.tag_name),
  }));
  const currentIds = new Set(currentReleaseVersions.map((entry) => entry.id));
  const retainedVersions = previous
    .filter((entry) => entry.id !== "stable-current" && !currentIds.has(entry.id))
    .map((entry) => ({ ...entry, channel: "archive" }));
  const versions = [stable, ...currentReleaseVersions, ...retainedVersions];
  const geminiVersion = { ...gemini.value };
  const hermesVersion = { ...hermes.value };
  delete geminiVersion.programId;
  delete hermesVersion.programId;
  const manifest = {
    generatedAt: synchronizedAt,
    programs: {
      codex: { name: "Codex CLI", defaultFormat: "toml", outputBaseName: "config", versions },
      gemini: { name: "Gemini CLI", defaultFormat: "json", outputBaseName: "settings", versions: [geminiVersion] },
      hermes: { name: "Hermes Agent", defaultFormat: "yaml", outputBaseName: "hermes-config", versions: [hermesVersion] },
    },
  };
  const previousComparable = existing ? JSON.stringify({ ...existing, generatedAt: synchronizedAt }) : "";
  const changed = previousComparable !== JSON.stringify(manifest);
  if (!changed) return { changed: false, manifest: existing };

  if (stableChanged) await writeAtomic(path.join(root, "codex/stable-current/config-schema.json"), stableText);
  if (gemini.changed) await writeAtomic(path.join(root, "gemini/main/settings.schema.json"), geminiText);
  if (hermes.changed) await writeAtomic(path.join(root, "hermes/0f702c2/hermes-config.schema.json"), hermesText);
  await Promise.all(downloaded.filter((item) => item.text).map((item) => writeAtomic(path.join(root, `codex/releases/${item.release.tag_name}/config-schema.json`), item.text)));
  await writeAtomic(path.join(root, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return { changed: true, manifest };
}

const isMain = process.argv[1] ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) : false;
if (isMain) {
  const root = path.resolve("public/schemas");
  await mkdir(root, { recursive: true });
  const result = await synchronizeSchemas({ root });
  console.log(`Schema registry is ${result.changed ? "updated" : "already current"}.`);
  await access(path.join(root, "manifest.json"));
}
