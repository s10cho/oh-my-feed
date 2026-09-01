import { mkdir, writeFile } from "node:fs/promises";
import { canonicalizeGitHubRepositoryUrl } from "../public/catalog.js";

const selections = [
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

const productFamilies = [
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

const familyByToolId = new Map(
  productFamilies.flatMap((family) => family.toolIds.map((toolId) => [toolId, family.id])),
);

const categories = [
  { id: "coding-agents", name: "Coding agents", description: "Tools that help developers write, understand, and change code." },
  { id: "agent-skills", name: "Agent skills", description: "Reusable workflows and specialist capabilities for coding agents." },
  { id: "developer-tools", name: "Developer tools", description: "Utilities for understanding and operating AI-assisted development." },
  { id: "knowledge-data", name: "Knowledge & data", description: "Tools that connect models to private data and retrieval pipelines." },
  { id: "browser-automation", name: "Browser automation", description: "Tools that let agents observe and act in web browsers." },
];

const headers = {
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "oh-my-feed-discover-catalog",
  ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
};

async function getJson(url) {
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
  return response.json();
}

const repositories = await Promise.all(
  selections.map(async ([fullName, categoryId]) => ({
    categoryId,
    data: await getJson(`https://api.github.com/repos/${fullName}`),
  })),
);

const ownerLogins = [...new Set(repositories.map(({ data }) => data.owner.login))].sort((a, b) => a.localeCompare(b, "en"));
const owners = await Promise.all(
  ownerLogins.map((login) => getJson(`https://api.github.com/users/${login}`)),
);
const collectedAt = new Date().toISOString();

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

const snapshot = {
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

await mkdir(new URL("../public/data/", import.meta.url), { recursive: true });
await writeFile(
  new URL("../public/data/catalog.json", import.meta.url),
  `${JSON.stringify(snapshot, null, 2)}\n`,
);
console.log(`Wrote ${tools.length} tools and ${makers.length} makers collected at ${snapshot.collectedAt}`);
