import assert from "node:assert/strict";
import test from "node:test";
import { sortCatalog } from "../public/catalog.js";

const items = [
  { fullName: "zeta/tool", stars: 20, createdAt: "2025-01-01T00:00:00Z" },
  { fullName: "alpha/tool", stars: 20, createdAt: "2024-01-01T00:00:00Z" },
  { fullName: "beta/tool", stars: 8, createdAt: "2026-01-01T00:00:00Z" },
];

test("popular ranking uses stars descending and full name as a deterministic tie-breaker", () => {
  assert.deepEqual(
    sortCatalog(items, "popular").map(({ fullName }) => fullName),
    ["alpha/tool", "zeta/tool", "beta/tool"],
  );
  assert.equal(items[0].fullName, "zeta/tool");
});

test("newest ranking uses repository creation time descending and the same tie-breaker", () => {
  const sameTime = items.map((item) => ({ ...item, createdAt: "2026-01-01T00:00:00Z" }));
  assert.deepEqual(
    sortCatalog(items, "newest").map(({ fullName }) => fullName),
    ["beta/tool", "zeta/tool", "alpha/tool"],
  );
  assert.deepEqual(
    sortCatalog(sameTime, "newest").map(({ fullName }) => fullName),
    ["alpha/tool", "beta/tool", "zeta/tool"],
  );
});

test("unsupported ranking never silently invents click data", () => {
  assert.throws(() => sortCatalog(items, "clicks"), /Unsupported sort: clicks/);
});

test("tie-breaking uses stable code-point order instead of runtime locale collation", () => {
  const tied = [
    { fullName: "a/tool", stars: 1, createdAt: "2026-01-01T00:00:00Z" },
    { fullName: "Z/tool", stars: 1, createdAt: "2026-01-01T00:00:00Z" },
  ];
  assert.deepEqual(sortCatalog(tied, "popular").map(({ fullName }) => fullName), ["Z/tool", "a/tool"]);
});
