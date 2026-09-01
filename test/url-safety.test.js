import assert from "node:assert/strict";
import test from "node:test";
import { safeHref } from "../public/url-safety.js";

test("safeHref never throws and rejects malformed, active-content, and spoofed URLs", () => {
  for (const value of [undefined, null, "", "not a URL", "javascript:alert(1)", "https://github.com.evil.example/owner/repo"]) {
    assert.doesNotThrow(() => safeHref(value, "github.repository"));
    assert.equal(safeHref(value, "github.repository"), "#");
  }
});

test("safeHref applies the explicit host and path policy for each rendered URL usage", () => {
  assert.equal(
    safeHref("https://github.com/owner/repo", "github.repository"),
    "https://github.com/owner/repo",
  );
  assert.equal(
    safeHref("https://github.com/owner", "github.profile"),
    "https://github.com/owner",
  );
  assert.equal(
    safeHref("https://avatars.githubusercontent.com/u/123?v=4", "github.avatar"),
    "https://avatars.githubusercontent.com/u/123?v=4",
  );

  assert.equal(safeHref("https://github.com/owner/repo/issues", "github.repository"), "#");
  assert.equal(safeHref("https://avatars.githubusercontent.com/u/123?v=4", "github.profile"), "#");
  assert.equal(safeHref("https://github.com/owner", "github.avatar"), "#");
  assert.equal(safeHref("https://evil.example/avatar.png", "github.avatar"), "#");
  assert.equal(safeHref("https://avatars.githubusercontent.com/u/123?redirect=javascript%3Aalert(1)", "github.avatar"), "#");
  assert.equal(safeHref("https://github.com/owner", "constructor"), "#");
});

test("legacy feed article links are restricted to the configured official publishers", () => {
  for (const url of [
    "https://openai.com/index/example",
    "https://github.blog/changelog/example",
    "https://blog.cloudflare.com/example/",
    "https://huggingface.co/blog/example",
  ]) {
    assert.equal(safeHref(url, "feed.article"), url);
  }
  assert.equal(safeHref("javascript:alert(1)", "feed.article"), "#");
  assert.equal(safeHref("https://openai.com.evil.example/index/example", "feed.article"), "#");
});
