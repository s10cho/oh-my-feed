import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  canonicalizeGitHubRepositoryUrl,
  createCatalogView,
  validateCatalogSnapshot,
} from "../public/catalog.js";

const snapshot = JSON.parse(
  await readFile(new URL("../public/data/catalog.json", import.meta.url), "utf8"),
);

const view = snapshot.schemaVersion === 2 ? createCatalogView(snapshot) : null;

test("catalog snapshot is a schema-v2 traceable GitHub API sample with bounded real entities", () => {
  assert.equal(snapshot.schemaVersion, 2);
  assert.deepEqual(validateCatalogSnapshot(snapshot), []);
  assert.ok(snapshot.tools.length >= 6 && snapshot.tools.length <= 10);
  assert.ok(snapshot.makers.length >= 4 && snapshot.makers.length <= 6);
  assert.match(snapshot.collectedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  assert.equal(snapshot.source.provider, "GitHub REST API");
  assert.equal(snapshot.source.apiVersion, "2022-11-28");
  assert.equal(snapshot.clicks.status, "not_collected");
});

test("canonical tools, makers, owner relations, and GitHub metrics are separate but project to the M2 UI", () => {
  const relationByTool = new Map(snapshot.toolMakerRelations.map((relation) => [relation.toolId, relation]));
  const githubMetricByTool = new Map(
    snapshot.metricSnapshots
      .filter(({ namespace }) => namespace === "github.repository")
      .map((metric) => [metric.entityId, metric]),
  );
  const makerById = new Map(view.makers.map((maker) => [maker.id, maker]));

  for (const tool of snapshot.tools) {
    assert.equal(Number.isInteger(tool.sourceId), true);
    assert.equal(tool.sourceIdentifier, `github:repository:${tool.sourceId}`);
    assert.match(tool.sourceUrl, /^https:\/\/api\.github\.com\/repos\//);
    assert.equal(tool.id, canonicalizeGitHubRepositoryUrl(tool.repositoryUrl).id);
    assert.equal("makerId" in tool, false);
    assert.equal("stars" in tool, false);
    assert.equal("forks" in tool, false);
    assert.equal("sourceMentions" in tool, false);

    const relation = relationByTool.get(tool.id);
    assert.equal(relation.kind, "owner");
    assert.ok(makerById.get(relation.makerId)?.toolIds.includes(tool.id));

    const metric = githubMetricByTool.get(tool.id);
    assert.equal(metric.entityType, "tool");
    assert.equal(typeof metric.metrics.stars, "number");
    assert.equal(typeof metric.metrics.forks, "number");
    assert.equal(metric.fetchedAt, snapshot.collectedAt);

    const uiTool = view.tools.find(({ id }) => id === tool.id);
    assert.equal(uiTool.makerId, relation.makerId);
    assert.equal(uiTool.stars, metric.metrics.stars);
    assert.equal(uiTool.forks, metric.metrics.forks);
  }

  for (const maker of snapshot.makers) {
    assert.equal(Number.isInteger(maker.sourceId), true);
    assert.equal(maker.sourceIdentifier, `github:user:${maker.sourceId}`);
    assert.match(maker.sourceUrl, /^https:\/\/api\.github\.com\/users\//);
    assert.match(maker.profileUrl, /^https:\/\/github\.com\//);
    assert.equal("toolIds" in maker, false);
    assert.ok(makerById.get(maker.id).toolIds.length > 0);
  }
});

test("validator rejects dangling owner relations and legacy metric fields on canonical tools", () => {
  const invalid = structuredClone(snapshot);
  invalid.toolMakerRelations[0].makerId = "missing-maker";
  invalid.tools[0].clicks = 123;
  invalid.tools[0].stars = 456;

  const errors = validateCatalogSnapshot(invalid);
  assert.ok(errors.some((error) => error.includes("references missing maker: missing-maker")));
  assert.ok(errors.some((error) => error.includes("tools[0].clicks must be absent")));
  assert.ok(errors.some((error) => error.includes("tools[0].stars must be absent")));
});

test("curated sample includes verified emerging tools, notable makers, and explicit ranking semantics", () => {
  const toolIds = new Set(snapshot.tools.map(({ id }) => id));
  for (const id of [
    "dreambigou/eli5",
    "garrytan/gstack",
    "yeachan-heo/oh-my-claudecode",
    "yeachan-heo/oh-my-codex",
    "code-yeongyu/oh-my-openagent",
  ]) {
    assert.ok(toolIds.has(id), `missing verified sample: ${id}`);
  }

  assert.match(snapshot.makers.find(({ id }) => id === "garrytan").displayName, /Garry Tan/i);
  assert.deepEqual(snapshot.rankingSemantics, {
    hot: { status: "not_calculated", label: "Hot is not available yet" },
    popular: { metric: "github.repository.stars", label: "Popular = GitHub stars" },
    newest: { metric: "created_at", label: "Newest = repository creation date" },
  });
});

test("official Oh My repositories share one family without grouping the inspired openagent lineage", () => {
  assert.deepEqual(snapshot.productFamilies, [
    {
      id: "yeachan-heo-oh-my-code",
      name: "Yeachan-Heo's Oh My Code family",
      makerId: "yeachan-heo",
      toolIds: ["yeachan-heo/oh-my-claudecode", "yeachan-heo/oh-my-codex"],
      relationKind: "editorial_relation",
      observedAt: snapshot.collectedAt,
      evidenceUrls: [
        "https://github.com/Yeachan-Heo/oh-my-codex/blob/main/COVERAGE.md",
        "https://github.com/Yeachan-Heo/oh-my-claudecode",
      ],
    },
  ]);
  assert.equal(snapshot.tools.find(({ id }) => id === "code-yeongyu/oh-my-openagent").familyId, null);
  assert.equal(snapshot.tools.find(({ id }) => id === "dreambigou/eli5").fullName, "DreambigOu/ELI5");
});

test("discovery mentions are separate from canonical entities and carry no fabricated source metrics", () => {
  assert.deepEqual(snapshot.discoverySources, [
    { id: "m2-editorial", label: "M2 manual catalog seed", kind: "editorial_selection" },
  ]);
  assert.equal(snapshot.sourceMentions.length, snapshot.tools.length);
  for (const mention of snapshot.sourceMentions) {
    assert.equal(mention.sourceNamespace, "ohmyfeed.editorial");
    assert.equal(mention.sourceItemId, "m2-editorial");
    assert.equal(mention.observedAt, snapshot.collectedAt);
    assert.equal(snapshot.tools.some(({ id }) => id === mention.toolId), true);
  }
  assert.equal(snapshot.metricSnapshots.some(({ namespace }) => namespace !== "github.repository"), false);
});
