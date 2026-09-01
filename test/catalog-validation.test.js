import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { validateCatalogSnapshot } from "../public/catalog.js";

const snapshot = JSON.parse(
  await readFile(new URL("../public/data/catalog.json", import.meta.url), "utf8"),
);

test("catalog snapshot is a traceable GitHub API sample with bounded real entities", () => {
  assert.deepEqual(validateCatalogSnapshot(snapshot), []);
  assert.ok(snapshot.tools.length >= 6 && snapshot.tools.length <= 10);
  assert.ok(snapshot.makers.length >= 4 && snapshot.makers.length <= 6);
  assert.match(snapshot.collectedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  assert.equal(snapshot.source.provider, "GitHub REST API");
  assert.equal(snapshot.source.apiVersion, "2022-11-28");
  assert.equal(snapshot.clicks.status, "not_collected");
});

test("every tool and maker has official source identifiers, real GitHub links, and bidirectional relations", () => {
  const makerById = new Map(snapshot.makers.map((maker) => [maker.id, maker]));

  for (const tool of snapshot.tools) {
    assert.equal(Number.isInteger(tool.sourceId), true);
    assert.equal(tool.sourceIdentifier, `github:repository:${tool.sourceId}`);
    assert.match(tool.sourceUrl, /^https:\/\/api\.github\.com\/repos\//);
    assert.match(tool.repositoryUrl, /^https:\/\/github\.com\//);
    assert.equal(typeof tool.stars, "number");
    assert.equal(typeof tool.forks, "number");
    assert.ok(makerById.get(tool.makerId)?.toolIds.includes(tool.id));
    assert.equal("clicks" in tool, false);
  }

  for (const maker of snapshot.makers) {
    assert.equal(Number.isInteger(maker.sourceId), true);
    assert.equal(maker.sourceIdentifier, `github:user:${maker.sourceId}`);
    assert.match(maker.sourceUrl, /^https:\/\/api\.github\.com\/users\//);
    assert.match(maker.profileUrl, /^https:\/\/github\.com\//);
    assert.ok(maker.toolIds.length > 0);
  }
});

test("validator rejects dangling maker relations and fabricated clicks", () => {
  const invalid = structuredClone(snapshot);
  invalid.tools[0].makerId = "missing-maker";
  invalid.tools[0].clicks = 123;

  assert.deepEqual(validateCatalogSnapshot(invalid), [
    `tools[0].makerId references missing maker: missing-maker`,
    "tools[0].clicks must be absent until collection exists",
  ]);
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
    popular: { metric: "stargazers_count", label: "Popular = GitHub stars" },
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

test("canonical GitHub entities keep discovery mentions and source-specific signals separate", () => {
  assert.deepEqual(snapshot.discoverySources, [
    { id: "m2-editorial", label: "M2 manual catalog seed", kind: "editorial_selection" },
  ]);
  for (const tool of snapshot.tools) {
    assert.deepEqual(tool.sourceMentions, [
      { sourceId: "m2-editorial", observedAt: snapshot.collectedAt, signals: [] },
    ]);
    assert.equal("points" in tool, false);
  }
});
