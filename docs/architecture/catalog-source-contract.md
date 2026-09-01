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

Canonical repository metadata such as `id`, `name`, `fullName`, `repositoryUrl`, GitHub source identifiers, description, dates, topics, category, and family. It must not contain `makerId`, `stars`, `forks`, `clicks`, or embedded `sourceMentions`.

### `Maker`

Canonical GitHub person/organization metadata. It does not embed `toolIds`.

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

`validateCatalogSnapshot` rejects unsupported versions, missing v2 contract collections, duplicate IDs in every collection, dangling references, non-canonical or unsafe repository URLs, legacy embedded relation/metric fields, missing `fetchedAt`, negative/non-integer metrics, and namespace/key mixing.

`migrateCatalogSnapshot` is the deterministic schema-v1 migration. It:

1. derives every Tool ID from `repositoryUrl`;
2. moves `makerId` into `toolMakerRelations`;
3. moves embedded source mentions into `sourceMentions`;
4. moves `stars` and `forks` into `github.repository` metric snapshots using the v1 `collectedAt` as `fetchedAt`;
5. removes `toolIds` from canonical Maker records;
6. never mutates the input snapshot.

`createCatalogView` projects either schema version into the existing M2 UI shape (`makerId`, `toolIds`, `stars`, and `forks`). When several GitHub metric snapshots exist, it selects the newest `fetchedAt` deterministically, independent of array order. This preserves current rendering and Popular sorting while keeping the persisted v2 schema normalized.
