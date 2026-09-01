# Oh My Feed Discover

A compact, source-traceable catalog for discovering AI tools and the people or organizations that make them.

## Deployed links and status

- Root: https://ohmyfeed.stream
- Discover: https://discover.ohmyfeed.stream
- Cloudflare fallback: https://oh-my-feed-discover.runartica.workers.dev
- Focus comparison: https://focus.ohmyfeed.stream (separate branch)

This branch implements **Discover M2** in source. Cloudflare deployment is still manual, so the public links may continue to serve the last manually uploaded M0 build until an M2 upload is performed and read back. GitHub Actions remains quality-only; automatic Cloudflare deployment is still pending repository-owner approval for the Cloudflare GitHub App. Do not infer deployment from a successful local build.

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

The checked-in seed is isolated at `public/data/catalog.json`. Regenerate it from the official GitHub API with:

```bash
npm run refresh:catalog
```

The dependency-free script in `scripts/fetch-catalog.mjs` owns the bounded repository selection and category mapping. It calls `https://api.github.com/repos/{owner}/{repo}` and `https://api.github.com/users/{login}` using GitHub API version `2022-11-28`, preserves returned repository metrics, follows GitHub canonical renames, and writes a new collection timestamp. Set `GITHUB_TOKEN` only in the local environment if the unauthenticated API rate limit is insufficient; never commit it.

The current snapshot was collected at `2026-09-01T13:37:31.399Z`. Stars, forks, descriptions, profiles, and repository dates are point-in-time GitHub values and will change on a later refresh. `DreambigOu/ELI5` is represented by its own repository metrics; the repository-level catalog does not include Anthropic's `claude-plugins-community/eli5` subdirectory, so parent-repository stars are never presented as plugin stars.

Canonical GitHub entities and discovery mentions are separate fields. Each current tool has an `m2-editorial` source mention with an empty source-specific `signals` array. The OMC/OMX product-family relation is also explicitly marked `editorial_relation` with an observation time and GitHub evidence URLs; it is not presented as a GitHub API field. A future GeekNews source can add a separate mention and a GeekNews-points signal without overwriting or mixing it with GitHub stars. M2 does not implement a GeekNews scraper or ingest any GeekNews points.

## Analytics and product events

Two separate measurement layers are planned:

1. **Cloudflare Web Analytics** — aggregate visits, pages, and web-performance reporting in Cloudflare's dashboard. The page contains a disabled configuration point (`cf-web-analytics-token` with an empty value). No beacon loads until an actual site token is supplied by the dashboard owner. No token or site tag is guessed in this repository.
2. **First-party product events (future)** — explicit events such as tool-row opens, Tools/People/Categories tab changes, Popular/Newest sort changes, and outbound GitHub clicks. These are not implemented and must not be confused with Cloudflare's basic traffic dashboard or with a `Clicks` ranking.

Any future product-event design must avoid storing raw IP addresses, raw user-agent strings, account identifiers, or other personal data. M2 has no event endpoint, D1 database, account, login, or custom visitor profile.

## AI usage

The product uses no runtime AI in M2. It has no AI classification, generated summaries, recommendations, or hidden ranking model. Displayed descriptions and metrics come from the official GitHub API; only the bounded sample and categories are manually curated.

AI development tools used on this branch:

- Hermes Agent: TDD implementation, official-source snapshot generation, and local verification.
- GStack: workflow guidance available in the development environment.

## Implemented / not implemented

Implemented: static responsive catalog, official GitHub snapshot, source validation, deterministic Popular/Newest ranking, reciprocal navigation, external GitHub links, disabled Cloudflare Web Analytics integration point, Worker static-assets build, and `/healthz` source contract.

Not implemented: automatic install, login/accounts, D1, AI features, custom analytics/events, Hot ranking, Clicks ranking, search, personalized recommendations, automated Cloudflare deployment, or an M2 production upload.

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

For a future M2 manual upload, read back the exact deployment rather than trusting upload output:

```bash
curl --fail --silent --show-error https://discover.ohmyfeed.stream/ | grep -F '<title>Oh My Feed Discover — AI tools and makers</title>'
curl --fail --silent --show-error https://discover.ohmyfeed.stream/data/catalog.json | grep -F 'github:repository:'
curl --fail --silent --show-error https://discover.ohmyfeed.stream/catalog.js > /dev/null
curl --fail --silent --show-error https://discover.ohmyfeed.stream/app.js > /dev/null
```

The current live deployment must not be called M2 until those checks pass. Rollback remains a manual Cloudflare Dashboard operation to the last known-good version, followed by the same read-back checks.
