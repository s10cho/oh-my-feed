import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { basename, dirname, join } from "node:path";
import {
  canonicalizeGitHubRepositoryUrl,
  validateCatalogSnapshot,
} from "../public/catalog.js";

export const catalogSelections = [
  ["browser-use/browser-use", "browser-automation"],
  ["code-yeongyu/oh-my-openagent", "coding-agents"],
  ["continuedev/continue", "coding-agents"],
  ["DreambigOu/ELI5", "agent-skills"],
  ["garrytan/gbrain", "knowledge-data"],
  ["garrytan/gstack", "agent-skills"],
  ["Yeachan-Heo/oh-my-claudecode", "coding-agents"],
  ["Yeachan-Heo/oh-my-codex", "coding-agents"],
  ["Yeachan-Heo/tokscale", "developer-tools"],
];

export const catalogProductFamilies = [
  {
    id: "yeachan-heo-oh-my-code",
    name: "Yeachan-Heo's Oh My Code family",
    makerId: "yeachan-heo",
    toolIds: ["yeachan-heo/oh-my-claudecode", "yeachan-heo/oh-my-codex"],
    relationKind: "editorial_relation",
    evidenceUrls: [
      "https://github.com/Yeachan-Heo/oh-my-codex/blob/main/COVERAGE.md",
      "https://github.com/Yeachan-Heo/oh-my-claudecode",
    ],
  },
];

export const catalogCategories = [
  { id: "coding-agents", name: "Coding agents", description: "Tools that help developers write, understand, and change code." },
  { id: "agent-skills", name: "Agent skills", description: "Reusable workflows and specialist capabilities for coding agents." },
  { id: "developer-tools", name: "Developer tools", description: "Utilities for understanding and operating AI-assisted development." },
  { id: "knowledge-data", name: "Knowledge & data", description: "Tools that connect models to private data and retrieval pipelines." },
  { id: "browser-automation", name: "Browser automation", description: "Tools that let agents observe and act in web browsers." },
];

const defaultIo = { mkdir, rename, rm, writeFile };

export async function buildCatalogSnapshot({
  selections = catalogSelections,
  productFamilies = catalogProductFamilies,
  categories = catalogCategories,
  getJson,
  now = () => new Date(),
} = {}) {
  if (typeof getJson !== "function") throw new Error("getJson is required");

  const repositories = await Promise.all(
    selections.map(async ([fullName, categoryId]) => ({
      categoryId,
      data: await getJson(`https://api.github.com/repos/${fullName}`),
    })),
  );
  const ownerLogins = [...new Set(repositories.map(({ data }) => data.owner.login))]
    .sort((left, right) => left.localeCompare(right, "en"));
  const owners = await Promise.all(
    ownerLogins.map((login) => getJson(`https://api.github.com/users/${login}`)),
  );
  const collectedAt = now().toISOString();
  const familyByToolId = new Map(
    productFamilies.flatMap((family) => family.toolIds.map((toolId) => [toolId, family.id])),
  );

  const tools = repositories.map(({ categoryId, data }) => {
    const canonical = canonicalizeGitHubRepositoryUrl(data.html_url);
    return {
      id: canonical.id,
      name: data.name,
      fullName: data.full_name,
      description: data.description ?? "No GitHub description provided.",
      categoryId,
      familyId: familyByToolId.get(canonical.id) ?? null,
      repositoryUrl: canonical.repositoryUrl,
      homepage: data.homepage || null,
      language: data.language,
      license: data.license?.spdx_id ?? null,
      topics: data.topics,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      pushedAt: data.pushed_at,
      sourceId: data.id,
      sourceIdentifier: `github:repository:${data.id}`,
      sourceUrl: data.url,
    };
  });

  const makers = owners.map((owner) => ({
    id: owner.login.toLowerCase(),
    login: owner.login,
    displayName: owner.name || owner.login,
    type: owner.type,
    description: owner.bio || null,
    avatarUrl: owner.avatar_url,
    profileUrl: owner.html_url,
    sourceId: owner.id,
    sourceIdentifier: `github:user:${owner.id}`,
    sourceUrl: owner.url,
  }));

  const toolMakerRelations = repositories.map(({ data }) => {
    const canonical = canonicalizeGitHubRepositoryUrl(data.html_url);
    const makerId = data.owner.login.toLowerCase();
    return {
      id: `github.owner:${canonical.id}:${makerId}`,
      toolId: canonical.id,
      makerId,
      kind: "owner",
      sourceNamespace: "github",
      evidenceUrl: canonical.repositoryUrl,
      observedAt: collectedAt,
    };
  });

  const sourceMentions = tools.map((tool) => ({
    id: `ohmyfeed.editorial:m2-editorial:${tool.id}`,
    toolId: tool.id,
    sourceNamespace: "ohmyfeed.editorial",
    sourceItemId: "m2-editorial",
    url: null,
    observedAt: collectedAt,
  }));

  const metricSnapshots = repositories.map(({ data }) => {
    const canonical = canonicalizeGitHubRepositoryUrl(data.html_url);
    return {
      id: `github.repository:${canonical.id}:${collectedAt}`,
      entityType: "tool",
      entityId: canonical.id,
      namespace: "github.repository",
      metrics: {
        stars: data.stargazers_count,
        forks: data.forks_count,
      },
      fetchedAt: collectedAt,
      sourceUrl: data.url,
    };
  });

  return {
    schemaVersion: 2,
    collectedAt,
    source: {
      provider: "GitHub REST API",
      apiVersion: "2022-11-28",
      repositoryEndpoint: "https://api.github.com/repos/{owner}/{repo}",
      userEndpoint: "https://api.github.com/users/{login}",
      provenance: "Repository metrics and profile fields are copied from official GitHub API responses without modification. Category assignments and the bounded sample selection are manual editorial metadata, not AI classification.",
    },
    clicks: {
      status: "not_collected",
      label: "Clicks not collected yet",
    },
    rankingSemantics: {
      hot: { status: "not_calculated", label: "Hot is not available yet" },
      popular: { metric: "github.repository.stars", label: "Popular = GitHub stars" },
      newest: { metric: "created_at", label: "Newest = repository creation date" },
    },
    discoverySources: [
      { id: "m2-editorial", label: "M2 manual catalog seed", kind: "editorial_selection" },
    ],
    productFamilies: productFamilies.map((family) => ({ ...family, observedAt: collectedAt })),
    categories,
    tools,
    makers,
    toolMakerRelations,
    sourceMentions,
    metricSnapshots,
  };
}

export async function writeCatalogSnapshotAtomically(snapshot, destination, {
  io = defaultIo,
  nonce = randomUUID,
} = {}) {
  const errors = validateCatalogSnapshot(snapshot);
  if (errors.length > 0) throw new Error(`Invalid catalog snapshot: ${errors.join("; ")}`);

  const target = destination instanceof URL ? fileURLToPath(destination) : destination;
  const temporary = join(dirname(target), `.${basename(target)}.${nonce()}.tmp`);
  let temporaryCreated = false;
  await io.mkdir(dirname(target), { recursive: true });
  try {
    await io.writeFile(temporary, `${JSON.stringify(snapshot, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    temporaryCreated = true;
    await io.rename(temporary, target);
    temporaryCreated = false;
  } finally {
    if (temporaryCreated) await io.rm(temporary, { force: true });
  }
  return snapshot;
}

export async function refreshCatalog(options = {}) {
  const snapshot = await buildCatalogSnapshot(options);
  await writeCatalogSnapshotAtomically(snapshot, options.destination, options);
  return snapshot;
}
