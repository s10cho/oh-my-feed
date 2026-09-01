import { refreshCatalog } from "./catalog-refresh.mjs";

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

const snapshot = await refreshCatalog({
  destination: new URL("../public/data/catalog.json", import.meta.url),
  getJson,
});

console.log(`Wrote ${snapshot.tools.length} tools and ${snapshot.makers.length} makers collected at ${snapshot.collectedAt}`);
