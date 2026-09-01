import { mkdir, writeFile } from "node:fs/promises";

const sources = [
  {
    id: "openai-news",
    name: "OpenAI News",
    url: "https://openai.com/news/rss.xml",
    category: "공식 업데이트",
  },
  {
    id: "github-changelog",
    name: "GitHub Changelog",
    url: "https://github.blog/changelog/feed/",
    category: "도구와 제품",
  },
  {
    id: "cloudflare-blog",
    name: "Cloudflare Blog",
    url: "https://blog.cloudflare.com/rss/",
    category: "개발 가이드",
  },
  {
    id: "hugging-face-blog",
    name: "Hugging Face Blog",
    url: "https://huggingface.co/blog/feed.xml",
    category: "연구와 논문",
  },
];

const settled = await Promise.allSettled(sources.map(fetchSource));
const successful = settled.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
const failed = settled.flatMap((result, index) => result.status === "rejected"
  ? [{ source: sources[index].name, error: result.reason.message }]
  : []);

if (!successful.length) {
  throw new Error(`No feeds could be fetched: ${JSON.stringify(failed)}`);
}

const items = successful
  .flatMap(({ items: sourceItems }) => sourceItems)
  .sort((left, right) => Date.parse(right.publishedAt) - Date.parse(left.publishedAt));

const snapshot = {
  schemaVersion: 1,
  fetchedAt: new Date().toISOString(),
  sourceCount: successful.length,
  sources: successful.map(({ source, itemCount }) => ({
    id: source.id,
    name: source.name,
    feedUrl: source.url,
    itemCount,
  })),
  failedSources: failed,
  items,
};

await mkdir(new URL("../data/", import.meta.url), { recursive: true });
await writeFile(
  new URL("../data/live-feed.json", import.meta.url),
  `${JSON.stringify(snapshot, null, 2)}\n`,
  "utf8",
);

console.log(`Saved ${items.length} items from ${successful.length} official feeds.`);
if (failed.length) console.warn(`Failed sources: ${JSON.stringify(failed)}`);

async function fetchSource(source) {
  const response = await fetch(source.url, {
    headers: { "user-agent": "oh-my-feed-sampling/0.1 (+https://github.com/s10cho/oh-my-feed)" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);

  const xml = await response.text();
  const parsed = parseFeed(xml, source).slice(0, 4);
  if (!parsed.length) throw new Error("Feed returned no parseable items");
  return { source, itemCount: parsed.length, items: parsed };
}

function parseFeed(xml, source) {
  const rssItems = blocks(xml, "item").map((block, index) => normalizeItem({
    id: `${source.id}-${index}-${value(block, "guid") || value(block, "link")}`,
    title: value(block, "title"),
    url: value(block, "link") || value(block, "guid"),
    summary: value(block, "description") || value(block, "content:encoded"),
    publishedAt: value(block, "pubDate") || value(block, "dc:date"),
  }, source));

  if (rssItems.length) return rssItems.filter(validItem);

  return blocks(xml, "entry").map((block, index) => normalizeItem({
    id: `${source.id}-${index}-${value(block, "id")}`,
    title: value(block, "title"),
    url: attribute(block, "link", "href") || value(block, "id"),
    summary: value(block, "summary") || value(block, "content"),
    publishedAt: value(block, "published") || value(block, "updated"),
  }, source)).filter(validItem);
}

function normalizeItem(item, source) {
  const published = new Date(decode(item.publishedAt));
  return {
    id: stableId(item.id),
    sourceId: source.id,
    source: source.name,
    category: source.category,
    title: plainText(item.title),
    summary: plainText(item.summary).slice(0, 280),
    url: decode(item.url).trim(),
    publishedAt: Number.isNaN(published.valueOf()) ? new Date(0).toISOString() : published.toISOString(),
    collectedFrom: source.url,
  };
}

function blocks(xml, tag) {
  return [...xml.matchAll(new RegExp(`<${escapePattern(tag)}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escapePattern(tag)}>`, "gi"))]
    .map((match) => match[1]);
}

function value(block, tag) {
  const match = block.match(new RegExp(`<${escapePattern(tag)}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escapePattern(tag)}>`, "i"));
  return match?.[1] ?? "";
}

function attribute(block, tag, name) {
  const match = block.match(new RegExp(`<${escapePattern(tag)}\\b[^>]*\\b${escapePattern(name)}=["']([^"']+)["'][^>]*>`, "i"));
  return match?.[1] ?? "";
}

function plainText(valueToClean) {
  return decode(valueToClean)
    .replace(/<!\[CDATA\[([\s\S]*?)]]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decode(valueToDecode) {
  return String(valueToDecode)
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&#39;", "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)));
}

function stableId(valueToHash) {
  let hash = 2166136261;
  for (const character of String(valueToHash)) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `live-${(hash >>> 0).toString(16)}`;
}

function validItem(item) {
  return Boolean(item.title && item.url && item.url.startsWith("http"));
}

function escapePattern(valueToEscape) {
  return valueToEscape.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
