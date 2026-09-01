import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalizeGitHubRepositoryUrl,
  createCatalogView,
  migrateCatalogSnapshot,
  validateCatalogSnapshot,
} from "../public/catalog.js";

test("canonicalizer derives a stable owner/repository identity from safe GitHub repository URLs", () => {
  assert.deepEqual(
    canonicalizeGitHubRepositoryUrl("https://github.com/DreambigOu/ELI5.git/"),
    {
      owner: "dreambigou",
      repo: "eli5",
      id: "dreambigou/eli5",
      repositoryUrl: "https://github.com/dreambigou/eli5",
    },
  );
});

test("canonicalizer rejects non-GitHub, ambiguous, and non-repository GitHub URLs", () => {
  for (const value of [
    "http://github.com/owner/repo",
    "https://github.example/owner/repo",
    "https://user@github.com/owner/repo",
    "https://github.com:444/owner/repo",
    "https://github.com/owner",
    "https://github.com/owner/repo/tree/main",
    "https://github.com/owner/repo/blob/main/README.md",
    "https://github.com/owner/repo/issues",
    "https://github.com/owner/repo/pulls",
    "https://github.com/owner/repo?tab=readme",
    "https://github.com/owner/repo#readme",
  ]) {
    assert.throws(() => canonicalizeGitHubRepositoryUrl(value), /GitHub repository URL/);
  }
});

function createContractSnapshot() {
  const fetchedAt = "2026-09-01T00:00:00.000Z";
  const tools = [
    ["dreambigou/eli5", "https://github.com/dreambigou/eli5"],
    ["someone-else/eli5", "https://github.com/someone-else/eli5"],
  ].map(([id, repositoryUrl], index) => ({
    id,
    name: "ELI5",
    fullName: id,
    description: "Explain code simply.",
    categoryId: "coding-agents",
    familyId: null,
    repositoryUrl,
    createdAt: fetchedAt,
    sourceId: index + 1,
    sourceIdentifier: `github:repository:${index + 1}`,
    sourceUrl: `https://api.github.com/repos/${id}`,
  }));
  const makers = ["dreambigou", "someone-else"].map((id, index) => ({
    id,
    login: id,
    displayName: id,
    type: "User",
    description: null,
    avatarUrl: `https://avatars.githubusercontent.com/u/${index + 1}?v=4`,
    profileUrl: `https://github.com/${id}`,
    sourceId: index + 1,
    sourceIdentifier: `github:user:${index + 1}`,
    sourceUrl: `https://api.github.com/users/${id}`,
  }));
  const toolMakerRelations = tools.map((tool, index) => ({
    id: `github.owner:${tool.id}`,
    toolId: tool.id,
    makerId: makers[index].id,
    kind: "owner",
    sourceNamespace: "github",
    evidenceUrl: tool.repositoryUrl,
    observedAt: fetchedAt,
  }));
  const sourceMentions = [
    {
      id: "geeknews:42",
      toolId: "dreambigou/eli5",
      sourceNamespace: "geeknews",
      sourceItemId: "42",
      url: "https://news.hada.io/topic?id=42",
      observedAt: fetchedAt,
    },
  ];
  const metricSnapshots = [
    {
      id: "github.repository:dreambigou/eli5:2026-09-01T00:00:00.000Z",
      entityType: "tool",
      entityId: "dreambigou/eli5",
      namespace: "github.repository",
      metrics: { stars: 10, forks: 2 },
      fetchedAt,
      sourceUrl: "https://api.github.com/repos/DreambigOu/ELI5",
    },
    {
      id: "geeknews:geeknews:42:2026-09-01T00:00:00.000Z",
      entityType: "sourceMention",
      entityId: "geeknews:42",
      namespace: "geeknews",
      metrics: { points: 7, comments: 3 },
      fetchedAt,
      sourceUrl: "https://news.hada.io/topic?id=42",
    },
    {
      id: "ohmyfeed:dreambigou/eli5:2026-09-01T00:00:00.000Z",
      entityType: "tool",
      entityId: "dreambigou/eli5",
      namespace: "ohmyfeed",
      metrics: { clicks: 4 },
      fetchedAt,
      sourceUrl: "https://ohmyfeed.stream/tools/dreambigou/eli5",
    },
    {
      id: "github.repository:someone-else/eli5:2026-09-01T00:00:00.000Z",
      entityType: "tool",
      entityId: "someone-else/eli5",
      namespace: "github.repository",
      metrics: { stars: 3, forks: 0 },
      fetchedAt,
      sourceUrl: "https://api.github.com/repos/someone-else/ELI5",
    },
  ];
  return {
    schemaVersion: 2,
    collectedAt: fetchedAt,
    source: { provider: "GitHub REST API", apiVersion: "2022-11-28" },
    categories: [
      { id: "coding-agents", name: "Coding agents", description: "Tools that help with code." },
    ],
    productFamilies: [],
    tools,
    makers,
    toolMakerRelations,
    sourceMentions,
    metricSnapshots,
  };
}

test("schema v2 keeps canonical tools, maker relations, discovery mentions, and metric snapshots separate", () => {
  const snapshot = createContractSnapshot();

  assert.deepEqual(validateCatalogSnapshot(snapshot), []);
  assert.equal(snapshot.tools[0].name, snapshot.tools[1].name);
  assert.notEqual(snapshot.tools[0].id, snapshot.tools[1].id);
  assert.equal("makerId" in snapshot.tools[0], false);
  assert.equal("stars" in snapshot.tools[0], false);
  assert.equal("sourceMentions" in snapshot.tools[0], false);
});

test("schema validator rejects duplicate IDs in every entity contract", () => {
  for (const collection of [
    "tools",
    "makers",
    "toolMakerRelations",
    "sourceMentions",
    "metricSnapshots",
  ]) {
    const snapshot = createContractSnapshot();
    snapshot[collection].push(structuredClone(snapshot[collection][0]));
    assert.ok(
      validateCatalogSnapshot(snapshot).some((error) => error.includes(`${collection} has duplicate id`)),
      `expected duplicate ${collection} id to be rejected`,
    );
  }
});

test("schema validator derives identity from repository URLs instead of same-name or slug guesses", () => {
  const fakeHost = createContractSnapshot();
  fakeHost.tools[0].repositoryUrl = "https://github.example/dreambigou/eli5";
  assert.ok(validateCatalogSnapshot(fakeHost).some((error) => error.includes("invalid repositoryUrl")));

  const ambiguousSlug = createContractSnapshot();
  ambiguousSlug.tools[0].id = "eli5";
  assert.ok(validateCatalogSnapshot(ambiguousSlug).some((error) => error.includes("must equal canonical repository id")));

  const repositorySubpath = createContractSnapshot();
  repositorySubpath.tools[0].repositoryUrl = "https://github.com/dreambigou/eli5/issues";
  assert.ok(validateCatalogSnapshot(repositorySubpath).some((error) => error.includes("invalid repositoryUrl")));
});

test("metric snapshots require fetchedAt, non-negative integers, and namespace-specific keys", () => {
  const sourceUrls = new Map([
    ["geeknews", "https://news.hada.io/topic?id=42"],
    ["hackernews", "https://news.ycombinator.com/item?id=42"],
    ["producthunt", "https://www.producthunt.com/posts/eli5"],
  ]);
  for (const namespace of sourceUrls.keys()) {
    const sourceSnapshot = createContractSnapshot();
    sourceSnapshot.sourceMentions[0].sourceNamespace = namespace;
    sourceSnapshot.sourceMentions[0].url = sourceUrls.get(namespace);
    sourceSnapshot.metricSnapshots[1].namespace = namespace;
    sourceSnapshot.metricSnapshots[1].sourceUrl = sourceUrls.get(namespace);
    assert.deepEqual(validateCatalogSnapshot(sourceSnapshot), []);
  }

  const missingFetchedAt = createContractSnapshot();
  delete missingFetchedAt.metricSnapshots[0].fetchedAt;
  assert.ok(validateCatalogSnapshot(missingFetchedAt).some((error) => error.includes("fetchedAt is required")));

  const negative = createContractSnapshot();
  negative.metricSnapshots[0].metrics.stars = -1;
  assert.ok(validateCatalogSnapshot(negative).some((error) => error.includes("stars must be a non-negative integer")));

  const mixedNamespace = createContractSnapshot();
  mixedNamespace.metricSnapshots[0].metrics.points = 99;
  mixedNamespace.metricSnapshots[1].metrics.stars = 999;
  mixedNamespace.metricSnapshots[2].metrics.comments = 5;
  const errors = validateCatalogSnapshot(mixedNamespace);
  assert.ok(errors.some((error) => error.includes("github.repository metrics may only contain stars, forks")));
  assert.ok(errors.some((error) => error.includes("geeknews metrics may only contain points, comments")));
  assert.ok(errors.some((error) => error.includes("ohmyfeed metrics may only contain clicks")));
});

test("schema v1 migrates deterministically to separate contracts and projects back to the M2 UI shape", () => {
  const fetchedAt = "2026-09-01T00:00:00.000Z";
  const legacy = {
    schemaVersion: 1,
    collectedAt: fetchedAt,
    source: { provider: "GitHub REST API", apiVersion: "2022-11-28" },
    categories: [{ id: "coding-agents", name: "Coding agents", description: "Tools that help with code." }],
    productFamilies: [],
    tools: [
      {
        id: "dreambigou/eli5",
        name: "ELI5",
        fullName: "DreambigOu/ELI5",
        description: "Explain code simply.",
        categoryId: "coding-agents",
        familyId: null,
        repositoryUrl: "https://github.com/DreambigOu/ELI5",
        createdAt: fetchedAt,
        makerId: "dreambigou",
        stars: 10,
        forks: 2,
        sourceId: 1,
        sourceIdentifier: "github:repository:1",
        sourceUrl: "https://api.github.com/repos/DreambigOu/ELI5",
        sourceMentions: [{ sourceId: "m2-editorial", observedAt: fetchedAt, signals: [] }],
      },
    ],
    makers: [{
      id: "dreambigou",
      login: "dreambigou",
      displayName: "Andrew Ou",
      type: "User",
      description: null,
      avatarUrl: "https://avatars.githubusercontent.com/u/1?v=4",
      profileUrl: "https://github.com/dreambigou",
      sourceId: 1,
      sourceIdentifier: "github:user:1",
      sourceUrl: "https://api.github.com/users/dreambigou",
      toolIds: ["dreambigou/eli5"],
    }],
  };
  const before = structuredClone(legacy);

  const migrated = migrateCatalogSnapshot(legacy);
  assert.deepEqual(legacy, before);
  assert.equal(migrated.schemaVersion, 2);
  assert.equal("makerId" in migrated.tools[0], false);
  assert.equal("stars" in migrated.tools[0], false);
  assert.equal("toolIds" in migrated.makers[0], false);
  assert.equal("sourceMentions" in migrated.tools[0], false);
  assert.equal(migrated.toolMakerRelations[0].toolId, "dreambigou/eli5");
  assert.equal(migrated.metricSnapshots[0].metrics.stars, 10);
  assert.equal(migrated.sourceMentions[0].sourceNamespace, "ohmyfeed.editorial");
  assert.deepEqual(migrateCatalogSnapshot(legacy), migrated);
  assert.deepEqual(validateCatalogSnapshot(migrated), []);

  const view = createCatalogView(migrated);
  assert.equal(view.tools[0].makerId, "dreambigou");
  assert.equal(view.tools[0].stars, 10);
  assert.equal(view.tools[0].forks, 2);
  assert.deepEqual(view.makers[0].toolIds, ["dreambigou/eli5"]);
});

test("M2 UI projection selects the newest GitHub metric snapshot independent of array order", () => {
  const snapshot = createContractSnapshot();
  snapshot.metricSnapshots.push({
    id: "github.repository:dreambigou/eli5:2026-08-01T00:00:00.000Z",
    entityType: "tool",
    entityId: "dreambigou/eli5",
    namespace: "github.repository",
    metrics: { stars: 1, forks: 0 },
    fetchedAt: "2026-08-01T00:00:00.000Z",
    sourceUrl: "https://api.github.com/repos/DreambigOu/ELI5",
  });

  assert.equal(createCatalogView(snapshot).tools[0].stars, 10);
});

test("schema validator rejects unsupported versions and missing v2 contract collections", () => {
  const unsupported = createContractSnapshot();
  unsupported.schemaVersion = 3;
  assert.ok(validateCatalogSnapshot(unsupported).some((error) => error.includes("Unsupported catalog schema version")));

  for (const collection of ["tools", "makers", "toolMakerRelations", "sourceMentions", "metricSnapshots"]) {
    const missing = createContractSnapshot();
    delete missing[collection];
    assert.ok(
      validateCatalogSnapshot(missing).some((error) => error.includes(`${collection} must be an array`)),
      `expected missing ${collection} collection to be rejected`,
    );
  }
});

test("metric namespace determines entity type and must match its discovery mention", () => {
  const wrongEntityType = createContractSnapshot();
  wrongEntityType.metricSnapshots[1].entityType = "tool";
  wrongEntityType.metricSnapshots[1].entityId = "dreambigou/eli5";
  assert.ok(validateCatalogSnapshot(wrongEntityType).some((error) => error.includes("geeknews metrics require sourceMention entities")));

  const mismatchedMention = createContractSnapshot();
  mismatchedMention.sourceMentions[0].sourceNamespace = "hackernews";
  assert.ok(validateCatalogSnapshot(mismatchedMention).some((error) => error.includes("namespace must match source mention")));

  const unknownEntityType = createContractSnapshot();
  unknownEntityType.metricSnapshots[0].entityType = "repository";
  assert.ok(validateCatalogSnapshot(unknownEntityType).some((error) => error.includes("unsupported entityType")));
});

test("prototype-key metric namespaces fail closed with validation errors", () => {
  for (const namespace of ["toString", "__proto__", "constructor"]) {
    const snapshot = createContractSnapshot();
    snapshot.metricSnapshots[0].namespace = namespace;

    assert.doesNotThrow(() => validateCatalogSnapshot(snapshot));
    assert.ok(
      validateCatalogSnapshot(snapshot).some((error) => error.includes(`unsupported namespace: ${namespace}`)),
      `expected ${namespace} to be rejected`,
    );
  }
});

test("every canonical tool requires exactly one owner relation and a GitHub metric snapshot", () => {
  const noOwner = createContractSnapshot();
  noOwner.toolMakerRelations.shift();
  assert.ok(validateCatalogSnapshot(noOwner).some((error) => error.includes("requires exactly one owner relation")));

  const duplicateOwner = createContractSnapshot();
  duplicateOwner.toolMakerRelations.push({
    ...duplicateOwner.toolMakerRelations[0],
    id: "github.owner:dreambigou/eli5:someone-else",
    makerId: "someone-else",
  });
  assert.ok(validateCatalogSnapshot(duplicateOwner).some((error) => error.includes("requires exactly one owner relation")));

  const noGitHubMetric = createContractSnapshot();
  noGitHubMetric.metricSnapshots = noGitHubMetric.metricSnapshots.filter(
    ({ entityId, namespace }) => entityId !== "dreambigou/eli5" || namespace !== "github.repository",
  );
  assert.ok(validateCatalogSnapshot(noGitHubMetric).some((error) => error.includes("requires a github.repository metric snapshot")));
});

test("schema validator requires contract fields and a valid fetchedAt instant", () => {
  const missingFields = createContractSnapshot();
  delete missingFields.tools[0].name;
  delete missingFields.makers[0].displayName;
  delete missingFields.toolMakerRelations[0].kind;
  delete missingFields.sourceMentions[0].observedAt;
  delete missingFields.metricSnapshots[0].metrics;
  const errors = validateCatalogSnapshot(missingFields);
  for (const field of ["tools[0].name", "makers[0].displayName", "toolMakerRelations[0].kind", "sourceMentions[0].observedAt", "metricSnapshots[0].metrics"]) {
    assert.ok(errors.some((error) => error.includes(`${field} is required`)), `expected ${field} error`);
  }

  const invalidTime = createContractSnapshot();
  invalidTime.metricSnapshots[0].fetchedAt = "not-a-date";
  assert.ok(validateCatalogSnapshot(invalidTime).some((error) => error.includes("fetchedAt must be an ISO timestamp")));
});

test("schema validator requires every field and collection consumed by the M2 UI", () => {
  const cases = [
    ["source", (snapshot) => delete snapshot.source],
    ["collectedAt", (snapshot) => delete snapshot.collectedAt],
    ["categories", (snapshot) => delete snapshot.categories],
    ["productFamilies", (snapshot) => delete snapshot.productFamilies],
    ["tools[0].fullName", (snapshot) => delete snapshot.tools[0].fullName],
    ["tools[0].description", (snapshot) => delete snapshot.tools[0].description],
    ["tools[0].categoryId", (snapshot) => delete snapshot.tools[0].categoryId],
    ["tools[0].createdAt", (snapshot) => delete snapshot.tools[0].createdAt],
    ["tools[0].sourceIdentifier", (snapshot) => delete snapshot.tools[0].sourceIdentifier],
    ["makers[0].login", (snapshot) => delete snapshot.makers[0].login],
    ["makers[0].type", (snapshot) => delete snapshot.makers[0].type],
    ["makers[0].avatarUrl", (snapshot) => delete snapshot.makers[0].avatarUrl],
    ["makers[0].profileUrl", (snapshot) => delete snapshot.makers[0].profileUrl],
    ["makers[0].sourceIdentifier", (snapshot) => delete snapshot.makers[0].sourceIdentifier],
  ];

  for (const [path, mutate] of cases) {
    const snapshot = createContractSnapshot();
    mutate(snapshot);
    const errors = validateCatalogSnapshot(snapshot);
    assert.ok(errors.some((error) => error.includes(path)), `expected missing ${path} to be rejected`);
  }
});

test("schema validator rejects dangling category and product-family relationships", () => {
  const badCategory = createContractSnapshot();
  badCategory.tools[0].categoryId = "missing-category";
  assert.ok(validateCatalogSnapshot(badCategory).some((error) => error.includes("categoryId references missing category")));

  const missingFamilyField = createContractSnapshot();
  delete missingFamilyField.tools[0].familyId;
  assert.ok(validateCatalogSnapshot(missingFamilyField).some((error) => error.includes("tools[0].familyId")));

  const badFamily = createContractSnapshot();
  badFamily.productFamilies.push({
    id: "eli5-family",
    name: "ELI5 family",
    makerId: "missing-maker",
    toolIds: ["missing/tool"],
    relationKind: "editorial_relation",
    evidenceUrls: ["https://github.com/dreambigou/eli5"],
    observedAt: "2026-09-01T00:00:00.000Z",
  });
  badFamily.tools[0].familyId = "eli5-family";
  const errors = validateCatalogSnapshot(badFamily);
  assert.ok(errors.some((error) => error.includes("makerId references missing maker")));
  assert.ok(errors.some((error) => error.includes("toolIds[0] references missing tool")));

  const inverseMismatch = createContractSnapshot();
  inverseMismatch.productFamilies.push({
    id: "eli5-family",
    name: "ELI5 family",
    makerId: "dreambigou",
    toolIds: ["dreambigou/eli5"],
    relationKind: "editorial_relation",
    evidenceUrls: ["https://github.com/dreambigou/eli5"],
    observedAt: "2026-09-01T00:00:00.000Z",
  });
  assert.ok(validateCatalogSnapshot(inverseMismatch).some((error) => error.includes("familyId must match product family")));
});

test("GitHub source identifiers are unique within each canonical entity collection", () => {
  for (const collection of ["tools", "makers"]) {
    const snapshot = createContractSnapshot();
    snapshot[collection][1].sourceId = snapshot[collection][0].sourceId;
    snapshot[collection][1].sourceIdentifier = snapshot[collection][0].sourceIdentifier;
    assert.ok(
      validateCatalogSnapshot(snapshot).some((error) => error.includes(`${collection} has duplicate sourceIdentifier`)),
      `expected duplicate ${collection} sourceIdentifier to be rejected`,
    );
  }
});

test("runtime UI projection rejects invalid snapshots instead of rendering them", () => {
  const invalid = createContractSnapshot();
  invalid.metricSnapshots[0].metrics.stars = -1;
  assert.throws(() => createCatalogView(invalid), /Invalid catalog snapshot/);
});

test("v1 migration rejects canonical ID collisions and normalizes persisted repository URLs", () => {
  const fetchedAt = "2026-09-01T00:00:00.000Z";
  const contract = createContractSnapshot();
  const collision = {
    ...contract,
    schemaVersion: 1,
    tools: contract.tools.map((tool, index) => ({
      ...tool,
      id: index === 0 ? "first" : "second",
      fullName: index === 0 ? "Owner/Repo" : "owner/repo",
      repositoryUrl: index === 0 ? "https://github.com/Owner/Repo" : "https://github.com/owner/repo.git/",
      makerId: "owner",
      stars: index + 1,
      forks: 0,
      sourceUrl: "https://api.github.com/repos/owner/repo",
      sourceMentions: [],
    })),
    makers: [{
      ...contract.makers[0],
      id: "owner",
      login: "owner",
      profileUrl: "https://github.com/owner",
      sourceUrl: "https://api.github.com/users/owner",
      toolIds: ["first", "second"],
    }],
  };
  assert.throws(() => migrateCatalogSnapshot(collision), /duplicate id/);

  const legacy = structuredClone(collision);
  legacy.tools.pop();
  legacy.makers[0].toolIds = ["first"];
  assert.equal(migrateCatalogSnapshot(legacy).tools[0].repositoryUrl, "https://github.com/owner/repo");
});

test("GitHub owner relation must match the canonical repository owner", () => {
  const snapshot = createContractSnapshot();
  snapshot.toolMakerRelations[0].makerId = "someone-else";
  assert.ok(validateCatalogSnapshot(snapshot).some((error) => error.includes("must match canonical repository owner")));
});

test("metric snapshots require every metric key in their namespace", () => {
  const snapshot = createContractSnapshot();
  snapshot.metricSnapshots[0].metrics = {};
  const errors = validateCatalogSnapshot(snapshot);
  assert.ok(errors.some((error) => error.includes("metrics.stars is required")));
  assert.ok(errors.some((error) => error.includes("metrics.forks is required")));
});

test("all contract timestamps use canonical ISO instants", () => {
  const snapshot = createContractSnapshot();
  snapshot.toolMakerRelations[0].observedAt = "09/01/2026";
  snapshot.sourceMentions[0].observedAt = "September 1, 2026";
  snapshot.metricSnapshots[0].fetchedAt = "2026-09-01T00:00:00Z";
  const errors = validateCatalogSnapshot(snapshot);
  assert.ok(errors.some((error) => error.includes("toolMakerRelations[0].observedAt must be an ISO timestamp")));
  assert.ok(errors.some((error) => error.includes("sourceMentions[0].observedAt must be an ISO timestamp")));
  assert.ok(errors.some((error) => error.includes("metricSnapshots[0].fetchedAt must be an ISO timestamp")));

  const falsy = createContractSnapshot();
  falsy.toolMakerRelations[0].observedAt = false;
  falsy.sourceMentions[0].observedAt = 0;
  falsy.metricSnapshots[0].fetchedAt = false;
  const falsyErrors = validateCatalogSnapshot(falsy);
  assert.ok(falsyErrors.some((error) => error.includes("toolMakerRelations[0].observedAt must be an ISO timestamp")));
  assert.ok(falsyErrors.some((error) => error.includes("sourceMentions[0].observedAt must be an ISO timestamp")));
  assert.ok(falsyErrors.some((error) => error.includes("metricSnapshots[0].fetchedAt must be an ISO timestamp")));
});

test("wrong collection types return validation errors instead of throwing", () => {
  for (const collection of ["tools", "makers", "toolMakerRelations", "sourceMentions", "metricSnapshots"]) {
    const snapshot = createContractSnapshot();
    snapshot[collection] = {};
    assert.doesNotThrow(() => validateCatalogSnapshot(snapshot));
    assert.ok(validateCatalogSnapshot(snapshot).some((error) => error.includes(`${collection} must be an array`)));
  }
});

test("malformed collection entries return validation errors instead of throwing", () => {
  for (const collection of ["tools", "makers", "toolMakerRelations", "sourceMentions", "metricSnapshots"]) {
    const snapshot = createContractSnapshot();
    snapshot[collection] = [null];
    assert.doesNotThrow(() => validateCatalogSnapshot(snapshot));
    assert.ok(validateCatalogSnapshot(snapshot).some((error) => error.includes(`${collection}[0] must be an object`)));
  }
});

test("GitHub owner evidence must be the canonical URL of the related repository", () => {
  const invalidUrl = createContractSnapshot();
  invalidUrl.toolMakerRelations[0].evidenceUrl = "not-a-url";
  assert.ok(validateCatalogSnapshot(invalidUrl).some((error) => error.includes("evidenceUrl must match canonical tool repository URL")));

  const unrelatedRepository = createContractSnapshot();
  unrelatedRepository.toolMakerRelations[0].evidenceUrl = "https://github.com/someone-else/eli5";
  assert.ok(validateCatalogSnapshot(unrelatedRepository).some((error) => error.includes("evidenceUrl must match canonical tool repository URL")));
});

test("schema validator rejects unsafe and spoofed URLs in every source-backed path", () => {
  const cases = [
    ["tools[0].sourceUrl", (snapshot) => { snapshot.tools[0].sourceUrl = "javascript:alert(1)"; }],
    ["makers[0].profileUrl", (snapshot) => { snapshot.makers[0].profileUrl = "https://github.com.evil.example/dreambigou"; }],
    ["makers[0].avatarUrl", (snapshot) => { snapshot.makers[0].avatarUrl = "https://evil.example/avatar.png"; }],
    ["makers[0].sourceUrl", (snapshot) => { snapshot.makers[0].sourceUrl = "not-a-url"; }],
    ["sourceMentions[0].url", (snapshot) => { snapshot.sourceMentions[0].url = "javascript:alert(1)"; }],
    ["metricSnapshots[0].sourceUrl", (snapshot) => { snapshot.metricSnapshots[0].sourceUrl = "https://api.github.com.evil.example/repos/dreambigou/eli5"; }],
  ];

  for (const [path, mutate] of cases) {
    const snapshot = createContractSnapshot();
    mutate(snapshot);
    assert.ok(
      validateCatalogSnapshot(snapshot).some((error) => error.includes(path)),
      `expected unsafe ${path} to be rejected`,
    );
  }
});
