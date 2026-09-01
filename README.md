# Oh My Feed Discover

A compact, source-traceable catalog for discovering AI tools and the people or organizations that make them.

## Deployed links and status

- Root: https://ohmyfeed.stream
- Discover: https://discover.ohmyfeed.stream
- Cloudflare fallback: https://oh-my-feed-discover.runartica.workers.dev
- Focus comparison: https://focus.ohmyfeed.stream (separate branch)

The public links now serve **Discover M2** from Cloudflare deployment version `548dc2dd`, built from source commit `b870211eec5e10b29192f743487bb6e65cf4bf78`. The five deployed assets were read back and matched byte-for-byte with that commit, and the live catalog reports 9 tools and 6 people/organizations. GitHub Actions remains quality-only; automatic Cloudflare deployment is still pending repository-owner approval for the Cloudflare GitHub App. Do not infer a future deployment from a successful local build alone.

## Problem and M2 experiment

The experiment asks whether a visitor can understand on the first screen that this is a place to find AI tools and the people behind them, then move between tools, makers, and categories without account setup.

M2 includes:

- a bounded official GitHub REST API snapshot: 9 repositories and 6 people/organizations;
- emerging and recognizable samples including the independent `DreambigOu/ELI5` repository, gstack/Garry Tan, and verified `oh-my-*` repositories;
- an explicit family relation between `Yeachan-Heo/oh-my-claudecode` and `Yeachan-Heo/oh-my-codex`, while `code-yeongyu/oh-my-openagent` remains a separate maker and lineage;
- Tools, People, and Categories views with reciprocal tool ↔ maker links;
- real GitHub repository/profile destinations;
- deterministic sorting: **Popular = GitHub `stargazers_count`**, **Newest = repository `created_at`**, ties broken by full repository name;
- collection time, API source identifiers, API version, and provenance in the checked-in snapshot;
- a compact GeekNews-style layout designed not to overflow at 390px or 1440px.

`Hot` is not calculated because M2 has no time-windowed trend signal. `Clicks` is not collected and no click values or click ranking are invented. Categories are manually assigned editorial metadata, not AI classification.

## Catalog snapshot

The checked-in seed is isolated at `public/data/catalog.json`. Its normalized schema and deterministic v1 migration are documented in [the canonical entity and source contract](docs/architecture/catalog-source-contract.md). Regenerate it from the official GitHub API with:

```bash
npm run refresh:catalog
```

The dependency-free script in `scripts/fetch-catalog.mjs` owns the bounded repository selection and category mapping. It calls `https://api.github.com/repos/{owner}/{repo}` and `https://api.github.com/users/{login}` using GitHub API version `2022-11-28`, preserves returned repository metrics, follows GitHub canonical renames, and writes a new collection timestamp. Set `GITHUB_TOKEN` only in the local environment if the unauthenticated API rate limit is insufficient; never commit it.

The current snapshot was collected at `2026-09-01T13:37:31.399Z`. Stars, forks, descriptions, profiles, and repository dates are point-in-time GitHub values and will change on a later refresh. `DreambigOu/ELI5` is represented by its own repository metrics; the repository-level catalog does not include Anthropic's `claude-plugins-community/eli5` subdirectory, so parent-repository stars are never presented as plugin stars.

Canonical GitHub entities, tool-maker relations, discovery mentions, and metric snapshots are separate schema-v2 collections. Each current tool has a top-level `ohmyfeed.editorial` source mention and a `github.repository` metric snapshot; GitHub stars/forks are never embedded into discovery records. Future GeekNews, Hacker News, and Product Hunt mentions can carry source-native points/comments in their own metric namespaces, while first-party clicks remain the `clicks` metric in the `ohmyfeed` namespace; none can overwrite GitHub stars. The OMC/OMX product-family relation is explicitly marked `editorial_relation` with an observation time and GitHub evidence URLs; it is not presented as a GitHub API field. M2 does not implement a discovery-source scraper or ingest any source points, comments, or clicks.

## Analytics and product events

Two separate measurement layers are planned:

1. **Cloudflare Web Analytics** — Cloudflare automatically injects its Web Analytics beacon on the deployed custom domain, so aggregate visits, pages, and web-performance reporting are available in Cloudflare's dashboard. The checked-in page keeps `cf-web-analytics-token` empty and does not store or guess a site token; local development therefore loads no beacon.
2. **First-party product events (future)** — explicit events such as tool-row opens, Tools/People/Categories tab changes, Popular/Newest sort changes, and outbound GitHub clicks. These are not implemented and must not be confused with Cloudflare's basic traffic dashboard or with a `Clicks` ranking.

Any future product-event design must avoid storing raw IP addresses, raw user-agent strings, account identifiers, or other personal data. M2 has no event endpoint, D1 database, account, login, or custom visitor profile.

## AI usage

The product uses no runtime AI in M2. It has no AI classification, generated summaries, recommendations, or hidden ranking model. Displayed descriptions and metrics come from the official GitHub API; only the bounded sample and categories are manually curated.

AI development tools used on this branch:

- Hermes Agent: TDD implementation, official-source snapshot generation, and local verification.
- GStack: workflow guidance available in the development environment.

## Implemented / not implemented

Implemented: static responsive catalog, official GitHub snapshot, source validation, deterministic Popular/Newest ranking, reciprocal navigation, external GitHub links, Cloudflare Web Analytics on the deployed custom domain, Worker static-assets build, and `/healthz` source contract.

Not implemented: automatic install, login/accounts, D1, AI features, custom product events, Hot ranking, Clicks ranking, search, personalized recommendations, or automated Cloudflare deployment.

## Local commands

Requires Node 22 or later and npm.

```bash
npm ci
npm test
npm run check
npm run build
npm start
```

`npm run build` generates `src/generated/build-metadata.js` from build-time values and runs a Wrangler deployment dry-run. The generated module is ignored by git. Locally it falls back to the current git branch and SHA when available, otherwise `local`; the timestamp is generated at build time.

## Cloudflare deployment

`wrangler.jsonc` serves `public/` through Workers Static Assets and keeps `discover.ohmyfeed.stream` plus the temporary root-domain route. GitHub Actions has no Cloudflare credentials or deploy step. Once the repository owner grants the Cloudflare GitHub App access, Workers Builds can use `npm run build` and `npx wrangler deploy`; until then deployment remains manual.

After every manual upload, read back the exact deployment rather than trusting upload output:

```bash
curl --fail --silent --show-error https://discover.ohmyfeed.stream/ | grep -F '<title>Oh My Feed Discover — AI tools and makers</title>'
curl --fail --silent --show-error https://discover.ohmyfeed.stream/data/catalog.json | grep -F 'github:repository:'
curl --fail --silent --show-error https://discover.ohmyfeed.stream/catalog.js > /dev/null
curl --fail --silent --show-error https://discover.ohmyfeed.stream/app.js > /dev/null
```

Those checks passed for Cloudflare version `548dc2dd`: the root, Discover subdomain, and Workers fallback return the M2 title; `index.html`, `styles.css`, `app.js`, `catalog.js`, and `data/catalog.json` match source commit `b870211eec5e10b29192f743487bb6e65cf4bf78`; and the live snapshot contains 9 tools and 6 people/organizations. Rollback remains a manual Cloudflare Dashboard operation to the last known-good version, followed by the same read-back checks.
