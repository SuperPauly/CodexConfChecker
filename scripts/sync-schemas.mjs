import { createHash } from "node:crypto";
import { access, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  normalizeVersion,
  selectLatestChannels,
} from "./release-selection.mjs";

const RELEASES_URL = "https://api.github.com/repos/openai/codex/releases?per_page=100";
const SCHEMA_PATH = "codex-rs/core/config.schema.json";
const CHANNELS = ["stable", "alpha"];

export function sha256(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function requestHeaders() {
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "SuperPauly-CodexConfChecker",
  };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  return headers;
}

async function fetchText(fetchImpl, url) {
  const response = await fetchImpl(url, { headers: requestHeaders() });
  if (!response.ok) {
    throw new Error(`Request failed with HTTP ${response.status}: ${url}`);
  }
  return await response.text();
}

function parseJson(text, label) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${label} did not contain valid JSON`, { cause: error });
  }
}

function schemaSource(tag) {
  return `https://github.com/openai/codex/blob/${tag}/${SCHEMA_PATH}`;
}

function schemaDownload(tag) {
  return `https://raw.githubusercontent.com/openai/codex/${tag}/${SCHEMA_PATH}`;
}

async function readExistingManifest(root) {
  try {
    return parseJson(await readFile(path.join(root, "manifest.json"), "utf8"), "Existing manifest");
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

async function writeAtomic(target, text) {
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.tmp`;
  await writeFile(temporary, text, { encoding: "utf8", mode: 0o644 });
  await rename(temporary, target);
}

export async function synchronizeSchemas({
  root,
  fetchImpl = globalThis.fetch,
  now = () => new Date(),
}) {
  if (typeof fetchImpl !== "function") {
    throw new TypeError("A fetch implementation is required");
  }

  const releasesText = await fetchText(fetchImpl, RELEASES_URL);
  const releases = parseJson(releasesText, "GitHub releases response");
  const selected = selectLatestChannels(releases);

  const downloaded = {};
  await Promise.all(
    CHANNELS.map(async (channel) => {
      const release = selected[channel];
      const text = await fetchText(fetchImpl, schemaDownload(release.tag_name));
      const parsed = parseJson(text, `${channel} schema`);
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        throw new Error(`${channel} schema must be a JSON object`);
      }
      const normalized = text.endsWith("\n") ? text : `${text}\n`;
      downloaded[channel] = {
        text: normalized,
        entry: {
          version: normalizeVersion(release.tag_name),
          tag: release.tag_name,
          sha256: sha256(normalized),
          sourceUrl: schemaSource(release.tag_name),
        },
      };
    }),
  );

  const existing = await readExistingManifest(root);
  const changed = CHANNELS.some((channel) => {
    const previous = existing?.channels?.[channel];
    const next = downloaded[channel].entry;
    return previous?.tag !== next.tag || previous?.sha256 !== next.sha256;
  });

  if (!changed) {
    return { changed: false, manifest: existing };
  }

  const manifest = {
    generatedAt: now().toISOString(),
    channels: {
      stable: downloaded.stable.entry,
      alpha: downloaded.alpha.entry,
    },
  };

  await Promise.all(
    CHANNELS.map((channel) =>
      writeAtomic(
        path.join(root, channel, "config.schema.json"),
        downloaded[channel].text,
      ),
    ),
  );
  await writeAtomic(
    path.join(root, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );

  return { changed: true, manifest };
}

const isMain = process.argv[1]
  ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;

if (isMain) {
  const root = path.resolve("public/schemas");
  await mkdir(root, { recursive: true });
  const result = await synchronizeSchemas({ root });
  const state = result.changed ? "updated" : "already current";
  console.log(`Codex schemas are ${state}.`);
  await access(path.join(root, "manifest.json"));
}
