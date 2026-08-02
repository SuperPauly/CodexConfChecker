import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeVersion,
  selectLatestChannels,
} from "./release-selection.mjs";

test("selects Codex stable and alpha releases and ignores unrelated tags", () => {
  const releases = [
    {
      tag_name: "rusty-v8-v150.4.0",
      published_at: "2026-08-02T12:00:00Z",
      draft: false,
    },
    {
      tag_name: "rust-v0.146.0",
      published_at: "2026-08-01T12:00:00Z",
      draft: false,
    },
    {
      tag_name: "rust-v0.147.0-alpha.4",
      published_at: "2026-08-02T11:00:00Z",
      draft: false,
    },
    {
      tag_name: "rust-v0.147.0-alpha.3",
      published_at: "2026-08-02T10:00:00Z",
      draft: false,
    },
  ];

  const result = selectLatestChannels(releases);

  assert.equal(result.stable.tag_name, "rust-v0.146.0");
  assert.equal(result.alpha.tag_name, "rust-v0.147.0-alpha.4");
});

test("orders alpha hotfix releases by publication time", () => {
  const releases = [
    {
      tag_name: "rust-v0.146.0",
      published_at: "2026-07-28T00:00:00Z",
      draft: false,
    },
    {
      tag_name: "rust-v0.147.0-alpha.9.1",
      published_at: "2026-08-01T00:00:00Z",
      draft: false,
    },
    {
      tag_name: "rust-v0.147.0-alpha.9.2",
      published_at: "2026-08-02T00:00:00Z",
      draft: false,
    },
  ];

  assert.equal(
    selectLatestChannels(releases).alpha.tag_name,
    "rust-v0.147.0-alpha.9.2",
  );
});

test("requires both channels", () => {
  assert.throws(
    () =>
      selectLatestChannels([
        {
          tag_name: "rust-v0.146.0",
          published_at: "2026-07-28T00:00:00Z",
          draft: false,
        },
      ]),
    /alpha/u,
  );
});

test("normalizes a release tag for display", () => {
  assert.equal(normalizeVersion("rust-v0.147.0-alpha.4"), "v0.147.0-alpha.4");
});
