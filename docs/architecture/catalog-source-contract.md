# Catalog canonical entity and source contract

Oh My Feed catalog snapshots use `schemaVersion: 2`. The persisted snapshot separates canonical GitHub entities from discovery evidence and time-varying metrics. `public/catalog.js` is the executable contract: it canonicalizes repository URLs, validates snapshots, migrates schema v1, and creates the legacy M2 view model used by the current UI.

## Canonical identity

A `Tool.id` is always the lowercase `owner/repository` derived from its GitHub repository URL. A name or repository slug alone is never an identity key. Consequently, `DreambigOu/ELI5` and another owner's `ELI5` are distinct tools, and a bare `ohmyclaude` value cannot be merged with any repository.

`canonicalizeGitHubRepositoryUrl` accepts only an HTTPS repository root on the exact `github.com` host:

- accepted: `https://github.com/Owner/Repo`, an optional trailing slash, and an optional `.git` suffix;
- normalized: lowercase `owner`, `repo`, `id`, and `https://github.com/owner/repo` canonical URL;
- rejected: HTTP, credentials, ports, query strings, fragments, fake/non-GitHub hosts, missing owner or repository, and every path below a repository;
- therefore `tree`, `blob`, `issues`, and `pulls` URLs are explicitly rejected rather than guessed back to a repository root.

GitHub REST repository metadata remains canonical. GeekNews, Hacker News, Product Hunt, and Oh My Feed editorial selection are discovery mentions only and cannot replace a canonical tool.

## Persisted contracts

### `Tool`

Canonical repository metadata such as `id`, `name`, `fullName`, `repositoryUrl`, GitHub source identifiers, description, dates, topics, category, and family. The current M2 view requires `fullName`, `description`, `categoryId`, `createdAt`, `sourceId`, `sourceIdentifier`, and `sourceUrl`; `categoryId` and non-null `familyId` must reference declared records. It must not contain `makerId`, `stars`, `forks`, `clicks`, or embedded `sourceMentions`.

### `Maker`

Canonical GitHub person/organization metadata. The M2 view requires `login`, `displayName`, `type`, `avatarUrl`, `profileUrl`, `sourceId`, `sourceIdentifier`, and `sourceUrl`; `description` is explicitly a string or `null`. It does not embed `toolIds`.

### `ToolMakerRelation`

A separate edge with `id`, `toolId`, `makerId`, `kind`, `sourceNamespace`, `evidenceUrl`, and `observedAt`. Every Tool has exactly one `owner` edge; its `makerId` must equal the owner derived from the canonical repository URL, and it uses `sourceNamespace: "github"`.

### `SourceMention`

Discovery evidence with `id`, `toolId`, `sourceNamespace`, source-native item ID/URL, and `observedAt`. Current manual M2 seeds use `ohmyfeed.editorial`; future discovery records may use `geeknews`, `hackernews`, or `producthunt`.

### `MetricSnapshot`

An immutable point-in-time metric record with `id`, `entityType`, `entityId`, `namespace`, `metrics`, `fetchedAt`, and `sourceUrl`. `fetchedAt` and every `observedAt` are canonical UTC ISO instants with millisecond precision; every namespace metric is present and is a non-negative integer.

Metric keys are namespace-bound:

| Namespace | Allowed metrics | Entity |
|---|---|---|
| `github.repository` | `stars`, `forks` | canonical Tool |
| `geeknews` | `points`, `comments` | SourceMention |
| `hackernews` | `points`, `comments` | SourceMention |
| `producthunt` | `points`, `comments` | SourceMention |
| `ohmyfeed` | `clicks` | canonical Tool |

A namespace cannot borrow another namespace's keys. GitHub stars, source points/comments, and Oh My Feed clicks therefore never overwrite or masquerade as one another.

## Validation and compatibility

`validateCatalogSnapshot` rejects unsupported versions, missing v2 contract collections (including `categories` and `productFamilies`), missing M2-rendered fields, duplicate record IDs and duplicate GitHub `sourceIdentifier` values, dangling or inconsistent category/family/owner/mention references, non-canonical or unsafe URLs, non-canonical timestamps (including falsy non-string values), legacy embedded relation/metric fields, missing `fetchedAt`, negative/non-integer metrics, and namespace/key mixing. Namespace lookups use fail-closed `Map` semantics, so JavaScript prototype names such as `toString`, `__proto__`, and `constructor` are ordinary unsupported values and never executable lookup paths.

### URL allowlist

Every external URL is HTTPS-only, rejects credentials and custom ports, and is checked against the contract for its exact use:

| Field/use | Allowed host and path |
|---|---|
| Tool `repositoryUrl` / rendered repository link | exact `github.com/{owner}/{repository}` repository root |
| Tool and GitHub metric `sourceUrl` | exact `api.github.com/repos/{owner}/{repository}` matching the Tool identity |
| Maker `profileUrl` / rendered profile link | exact `github.com/{login}` matching the Maker login |
| Maker `sourceUrl` | exact `api.github.com/users/{login}` matching the Maker login |
| Maker `avatarUrl` / rendered image | exact `avatars.githubusercontent.com/u/{numeric-id}`; only GitHub's numeric `v` and `s` query parameters (for example `?v=4`) are preserved |
| Product-family evidence | exact `github.com` host with a repository or deeper evidence path |
| GeekNews mention/metric | `news.hada.io/topic?id={numeric-id}` |
| Hacker News mention/metric | `news.ycombinator.com/item?id={numeric-id}` |
| Product Hunt mention/metric | `producthunt.com` or `www.producthunt.com` with a non-root path |
| Oh My Feed metric | `ohmyfeed.stream` or `discover.ohmyfeed.stream` |
| Legacy official-feed article | `openai.com`, `github.blog`, `blog.cloudflare.com`, or `huggingface.co` with a non-root path |

The M2 UI's `safeHref` applies only the repository, profile, or avatar policy requested by that call site; the sibling legacy feed view uses the separate official-publisher policy above. It catches malformed values and returns `#` rather than throwing or passing through an unknown protocol/host. Snapshot validation runs before rendering, so malformed persisted URLs produce the catalog error state and no unsafe destination or image.

### Refresh safety

`npm run refresh:catalog` builds a complete schema-v2 snapshot in memory and runs `validateCatalogSnapshot` before any filesystem operation. A valid snapshot is serialized to an exclusive sibling temporary file and atomically renamed over `public/data/catalog.json`. Validation, collision, serialization, or rename failure leaves the previous catalog untouched; temporary files are removed in a `finally` path. Unit tests inject deterministic GitHub responses and filesystem operations, so malformed and canonical-ID-collision behavior is covered without live network access.

`migrateCatalogSnapshot` is the deterministic schema-v1 migration. It:

1. derives every Tool ID from `repositoryUrl`;
2. moves `makerId` into `toolMakerRelations`;
3. moves embedded source mentions into `sourceMentions`;
4. moves `stars` and `forks` into `github.repository` metric snapshots using the v1 `collectedAt` as `fetchedAt`;
5. removes `toolIds` from canonical Maker records;
6. never mutates the input snapshot.

`createCatalogView` projects either schema version into the existing M2 UI shape (`makerId`, `toolIds`, `stars`, and `forks`). When several GitHub metric snapshots exist, it selects the newest `fetchedAt` deterministically, independent of array order. This preserves current rendering and Popular sorting while keeping the persisted v2 schema normalized.
