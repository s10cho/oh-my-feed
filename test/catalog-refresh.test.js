import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  buildCatalogSnapshot,
  refreshCatalog,
  writeCatalogSnapshotAtomically,
} from "../scripts/catalog-refresh.mjs";

const collectedAt = "2026-09-01T00:00:00.000Z";
const categories = [
  { id: "coding-agents", name: "Coding agents", description: "Tools that help with code." },
];

function githubRepository(overrides = {}) {
  return {
    id: 1,
    name: "repo",
    full_name: "owner/repo",
    description: "A test repository.",
    html_url: "https://github.com/owner/repo",
    homepage: null,
    language: "JavaScript",
    license: { spdx_id: "MIT" },
    topics: [],
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-08-01T00:00:00Z",
    pushed_at: "2026-08-01T00:00:00Z",
    url: "https://api.github.com/repos/owner/repo",
    stargazers_count: 10,
    forks_count: 2,
    owner: { login: "owner" },
    ...overrides,
  };
}

function githubOwner(overrides = {}) {
  return {
    id: 2,
    login: "owner",
    name: "Owner",
    type: "User",
    bio: null,
    avatar_url: "https://avatars.githubusercontent.com/u/2?v=4",
    html_url: "https://github.com/owner",
    url: "https://api.github.com/users/owner",
    ...overrides,
  };
}

function mockedGitHub(repository, owner = githubOwner()) {
  return async (url) => url.includes("/repos/") ? structuredClone(repository) : structuredClone(owner);
}

test("atomic writer validates malformed and colliding snapshots before touching disk", async () => {
  const valid = await buildCatalogSnapshot({
    selections: [["owner/repo", "coding-agents"]],
    categories,
    productFamilies: [],
    getJson: mockedGitHub(githubRepository()),
    now: () => new Date(collectedAt),
  });
  const invalidSnapshots = [
    (() => { const value = structuredClone(valid); delete value.categories; return value; })(),
    (() => { const value = structuredClone(valid); value.tools.push(structuredClone(value.tools[0])); return value; })(),
  ];

  for (const snapshot of invalidSnapshots) {
    const calls = [];
    const io = {
      mkdir: async (...args) => calls.push(["mkdir", ...args]),
      writeFile: async (...args) => calls.push(["writeFile", ...args]),
      rename: async (...args) => calls.push(["rename", ...args]),
      rm: async (...args) => calls.push(["rm", ...args]),
    };
    await assert.rejects(
      () => writeCatalogSnapshotAtomically(snapshot, "/tmp/catalog.json", { io, nonce: () => "fixed" }),
      /Invalid catalog snapshot/,
    );
    assert.deepEqual(calls, []);
  }
});

test("atomic writer writes a sibling temporary file and renames it over the target", async () => {
  const snapshot = await buildCatalogSnapshot({
    selections: [["owner/repo", "coding-agents"]],
    categories,
    productFamilies: [],
    getJson: mockedGitHub(githubRepository()),
    now: () => new Date(collectedAt),
  });
  const calls = [];
  const io = {
    mkdir: async (...args) => calls.push(["mkdir", ...args]),
    writeFile: async (...args) => calls.push(["writeFile", ...args]),
    rename: async (...args) => calls.push(["rename", ...args]),
    rm: async (...args) => calls.push(["rm", ...args]),
  };

  await writeCatalogSnapshotAtomically(snapshot, "/tmp/catalog.json", { io, nonce: () => "fixed" });

  assert.equal(calls[1][0], "writeFile");
  assert.equal(calls[1][1], "/tmp/.catalog.json.fixed.tmp");
  assert.deepEqual(calls[2], ["rename", "/tmp/.catalog.json.fixed.tmp", "/tmp/catalog.json"]);
  assert.equal(calls.some(([operation, path]) => operation === "writeFile" && path === "/tmp/catalog.json"), false);
});

test("atomic writer validates and writes one immutable serialized representation", async () => {
  const snapshot = await buildCatalogSnapshot({
    selections: [["owner/repo", "coding-agents"]],
    categories,
    productFamilies: [],
    getJson: mockedGitHub(githubRepository()),
    now: () => new Date(collectedAt),
  });
  const expected = `${JSON.stringify(snapshot, null, 2)}\n`;
  let written;
  const io = {
    mkdir: async () => {
      snapshot.tools[0].repositoryUrl = "javascript:alert(1)";
    },
    writeFile: async (_path, bytes) => { written = bytes; },
    rename: async () => {},
    rm: async () => {},
  };

  await writeCatalogSnapshotAtomically(snapshot, "/tmp/catalog.json", { io, nonce: () => "fixed" });

  assert.equal(written, expected);
  assert.deepEqual(JSON.parse(written).tools[0].repositoryUrl, "https://github.com/owner/repo");
});

test("atomic writer validates the plain JSON produced by custom toJSON exactly once", async () => {
  const snapshot = await buildCatalogSnapshot({
    selections: [["owner/repo", "coding-agents"]],
    categories,
    productFamilies: [],
    getJson: mockedGitHub(githubRepository()),
    now: () => new Date(collectedAt),
  });
  let serializationCount = 0;
  snapshot.toJSON = () => {
    serializationCount += 1;
    return { ...snapshot, categories: undefined, toJSON: undefined };
  };
  const calls = [];
  const io = {
    mkdir: async (...args) => calls.push(["mkdir", ...args]),
    writeFile: async (...args) => calls.push(["writeFile", ...args]),
    rename: async (...args) => calls.push(["rename", ...args]),
    rm: async (...args) => calls.push(["rm", ...args]),
  };

  await assert.rejects(
    () => writeCatalogSnapshotAtomically(snapshot, "/tmp/catalog.json", { io, nonce: () => "fixed" }),
    /categories must be an array/,
  );
  assert.equal(serializationCount, 1);
  assert.deepEqual(calls, []);
});

test("atomic writer does not delete a sibling temporary file it failed to create", async () => {
  const snapshot = await buildCatalogSnapshot({
    selections: [["owner/repo", "coding-agents"]],
    categories,
    productFamilies: [],
    getJson: mockedGitHub(githubRepository()),
    now: () => new Date(collectedAt),
  });
  let removed = false;
  const io = {
    mkdir: async () => {},
    writeFile: async () => { throw Object.assign(new Error("exists"), { code: "EEXIST" }); },
    rename: async () => {},
    rm: async () => { removed = true; },
  };

  await assert.rejects(
    () => writeCatalogSnapshotAtomically(snapshot, "/tmp/catalog.json", { io, nonce: () => "collision" }),
    /exists/,
  );
  assert.equal(removed, false);
});

test("atomic writer removes a temporary file when writeFile creates it and then rejects", async () => {
  const snapshot = await buildCatalogSnapshot({
    selections: [["owner/repo", "coding-agents"]],
    categories,
    productFamilies: [],
    getJson: mockedGitHub(githubRepository()),
    now: () => new Date(collectedAt),
  });
  const directory = await mkdtemp(join(tmpdir(), "oh-my-feed-partial-write-"));
  const destination = join(directory, "catalog.json");
  const io = {
    mkdir: async () => {},
    writeFile: async (...args) => {
      await writeFile(...args);
      throw new Error("injected partial-write failure");
    },
    rename: async () => {},
    rm,
  };

  try {
    await assert.rejects(
      () => writeCatalogSnapshotAtomically(snapshot, destination, { io, nonce: () => "partial" }),
      /injected partial-write failure/,
    );
    assert.deepEqual(await readdir(directory), []);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("mocked refresh preserves last known-good catalog on malformed and colliding GitHub output", async () => {
  const directory = await mkdtemp(join(tmpdir(), "oh-my-feed-refresh-"));
  const destination = join(directory, "catalog.json");
  const lastKnownGood = "last-known-good\n";
  await writeFile(destination, lastKnownGood);

  try {
    const malformedOwner = githubOwner({ avatar_url: "javascript:alert(1)" });
    await assert.rejects(() => refreshCatalog({
      destination,
      selections: [["owner/repo", "coding-agents"]],
      categories,
      productFamilies: [],
      getJson: mockedGitHub(githubRepository(), malformedOwner),
      now: () => new Date(collectedAt),
    }), /Invalid catalog snapshot/);
    assert.equal(await readFile(destination, "utf8"), lastKnownGood);

    await assert.rejects(() => refreshCatalog({
      destination,
      selections: [["owner/one", "coding-agents"], ["owner/two", "coding-agents"]],
      categories,
      productFamilies: [],
      getJson: mockedGitHub(githubRepository()),
      now: () => new Date(collectedAt),
    }), /duplicate id/);
    assert.equal(await readFile(destination, "utf8"), lastKnownGood);

    const sourceIdCollision = async (url) => {
      if (url.includes("/users/")) return githubOwner();
      const fullName = url.split("/repos/")[1];
      const [owner, repo] = fullName.split("/");
      return githubRepository({
        id: 1,
        name: repo,
        full_name: fullName,
        html_url: `https://github.com/${fullName}`,
        url: `https://api.github.com/repos/${owner}/${repo}`,
        owner: { login: owner },
      });
    };
    await assert.rejects(() => refreshCatalog({
      destination,
      selections: [["owner/one", "coding-agents"], ["owner/two", "coding-agents"]],
      categories,
      productFamilies: [],
      getJson: sourceIdCollision,
      now: () => new Date(collectedAt),
    }), /duplicate sourceIdentifier/);
    assert.equal(await readFile(destination, "utf8"), lastKnownGood);
    assert.deepEqual(await readdir(directory), ["catalog.json"]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
