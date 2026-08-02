const STABLE_TAG = /^rust-v\d+\.\d+\.\d+$/u;
const ALPHA_TAG = /^rust-v\d+\.\d+\.\d+-alpha(?:\.\d+)*$/u;

function publishedTimestamp(release) {
  const timestamp = Date.parse(release.published_at ?? "");
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function newestMatching(releases, pattern, channel) {
  const matches = releases
    .filter(
      (release) =>
        release &&
        release.draft !== true &&
        typeof release.tag_name === "string" &&
        pattern.test(release.tag_name),
    )
    .sort((left, right) => publishedTimestamp(right) - publishedTimestamp(left));

  const release = matches[0];
  if (!release) {
    throw new Error(`No ${channel} Codex release was found`);
  }
  return release;
}

export function selectLatestChannels(releases) {
  if (!Array.isArray(releases)) {
    throw new TypeError("GitHub releases response must be an array");
  }
  return {
    stable: newestMatching(releases, STABLE_TAG, "stable"),
    alpha: newestMatching(releases, ALPHA_TAG, "alpha"),
  };
}

export function normalizeVersion(tag) {
  if (typeof tag !== "string" || !tag.startsWith("rust-v")) {
    throw new TypeError("Codex release tag must start with rust-v");
  }
  return tag.slice("rust-".length);
}
