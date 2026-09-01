const ownerSegment = /^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i;
const loginSegment = /^[a-z\d](?:[a-z\d-]{0,38})$/i;
const externalHttpsPolicy = (url) => Boolean(url.hostname);

export function isValidGitHubRepositoryName(value) {
  return typeof value === "string"
    && /^(?!\.{1,2}$)[a-z\d._-]{1,100}$/i.test(value);
}

function pathSegments(url) {
  return url.pathname.split("/").filter(Boolean);
}

const urlPolicies = new Map([
  ["github.repository", (url) => {
    const [owner, repository] = pathSegments(url);
    return url.hostname === "github.com"
      && pathSegments(url).length === 2
      && ownerSegment.test(owner ?? "")
      && isValidGitHubRepositoryName(repository)
      && !url.search
      && !url.hash;
  }],
  ["github.profile", (url) => {
    const [login] = pathSegments(url);
    return url.hostname === "github.com"
      && pathSegments(url).length === 1
      && loginSegment.test(login ?? "")
      && !url.search
      && !url.hash;
  }],
  ["github.avatar", (url) =>
    url.hostname === "avatars.githubusercontent.com"
      && /^\/u\/\d+$/.test(url.pathname)
      && [...url.searchParams].every(([key, value]) => ["v", "s"].includes(key) && /^\d+$/.test(value))
      && ["v", "s"].every((key) => url.searchParams.getAll(key).length <= 1)
      && !url.hash],
  ["github.repositoryApi", (url) => {
    const [kind, owner, repository] = pathSegments(url);
    return url.hostname === "api.github.com"
      && kind === "repos"
      && pathSegments(url).length === 3
      && ownerSegment.test(owner ?? "")
      && isValidGitHubRepositoryName(repository)
      && !url.search
      && !url.hash;
  }],
  ["github.userApi", (url) => {
    const [kind, login] = pathSegments(url);
    return url.hostname === "api.github.com"
      && kind === "users"
      && pathSegments(url).length === 2
      && loginSegment.test(login ?? "")
      && !url.search
      && !url.hash;
  }],
  ["github.evidence", (url) =>
    url.hostname === "github.com" && pathSegments(url).length >= 2 && !url.search && !url.hash],
  ["external.homepage", externalHttpsPolicy],
  ["external.evidence", externalHttpsPolicy],
  ["external.article", externalHttpsPolicy],
  ["geeknews.item", (url) =>
    url.hostname === "news.hada.io" && url.pathname === "/topic" && /^\?id=\d+$/.test(url.search) && !url.hash],
  ["hackernews.item", (url) =>
    url.hostname === "news.ycombinator.com" && url.pathname === "/item" && /^\?id=\d+$/.test(url.search) && !url.hash],
  ["producthunt.item", (url) =>
    ["producthunt.com", "www.producthunt.com"].includes(url.hostname) && pathSegments(url).length > 0 && !url.hash],
  ["ohmyfeed.item", (url) =>
    ["ohmyfeed.stream", "discover.ohmyfeed.stream"].includes(url.hostname) && !url.hash],
]);

export function safeHref(value, usage) {
  try {
    if (typeof value !== "string" || value.length === 0) return "#";
    const policy = urlPolicies.get(usage);
    if (!policy) return "#";
    const url = new URL(value);
    if (
      url.protocol !== "https:"
      || url.username
      || url.password
      || url.port
      || !policy(url)
    ) return "#";
    return url.href;
  } catch {
    return "#";
  }
}

export function isSafeUrl(value, usage) {
  return safeHref(value, usage) !== "#";
}
