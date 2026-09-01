import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const snapshot = JSON.parse(
  await readFile(new URL("../data/live-feed.json", import.meta.url), "utf8"),
);

test("live snapshot contains traceable items from every successful source", () => {
  assert.equal(snapshot.sourceCount, 4);
  assert.equal(snapshot.items.length, 16);
  assert.deepEqual(snapshot.failedSources, []);

  for (const source of snapshot.sources) {
    assert.ok(snapshot.items.some((item) => item.sourceId === source.id));
  }

  for (const item of snapshot.items) {
    assert.match(item.url, /^https:\/\//);
    assert.match(item.collectedFrom, /^https:\/\//);
    assert.doesNotMatch(item.url, /example\.com/);
    assert.ok(item.title.length > 0);
    assert.equal(typeof item.summary, "string");
  }
});
