# Oh My Feed Discover

## Deployed links and status

- Root: https://ohmyfeed.stream (temporarily serves Discover M0 until the neutral experiment hub is deployed)
- Discover: https://discover.ohmyfeed.stream (live manual M0 deployment)
- Cloudflare fallback: https://oh-my-feed-discover.runartica.workers.dev
- Focus comparison: https://focus.ohmyfeed.stream (separate branch)

This branch implements M0 only. The public Discover Hello World page is live from a manual Cloudflare static-assets deployment. GitHub quality CI is live for `spike/ai-tools-network`; automatic Cloudflare deployment is intentionally pending repository-owner approval for the Cloudflare GitHub App. The source-connected Worker and its `/healthz` deployment metadata contract are implemented and tested, but that endpoint is not claimed as part of the current manual static deployment.

## Problem and current experiment

Oh My Feed Discover will test whether people can quickly understand a service for finding AI tools and the people who make or maintain them. M0 is deliberately only the deployable walking skeleton. It does not contain a catalog, GitHub data, accounts, analytics, click tracking, D1, or product ranking claims.

## AI usage

The product uses no AI at M0. It has no AI classification, AI-generated summaries, or automated recommendations. Future GitHub metadata display must remain rule-based unless a later milestone implements and documents a real AI feature.

AI development tools used for this branch:

- Hermes Agent: implementation and local verification assistance.
- GStack: development workflow guidance.

## Local commands

Requires Node 22 or later and npm.

```bash
npm ci
npm test
npm run check
npm run build
npm run deploy:dry-run
npm start
```

`npm run build` generates `src/generated/build-metadata.js` from build-time values and bundles the Worker with Wrangler dry-run. The generated module is ignored by git. Locally it falls back to the current git branch and SHA when available, otherwise `local`; the timestamp is generated at build time.

## Cloudflare Workers Builds setup

1. Create or select the `oh-my-feed-discover` Worker in the `ohmyfeed.stream` Cloudflare account.
2. Connect this repository and set the production branch to `spike/ai-tools-network`.
3. Configure the build command as `npm run build`.
4. Configure production deploy as `npx wrangler deploy` and non-production deploy as `npx wrangler versions upload`. Workers Builds uses the project-local Wrangler version from `package-lock.json`.
5. Add `discover.ohmyfeed.stream` as the Worker Custom Domain. Until the neutral experiment hub is deployed, `ohmyfeed.stream` also points to this Worker so the purchased root domain never returns NXDOMAIN. `wrangler.jsonc` declares both temporary production hostnames.
6. Let Workers Builds inject `WORKERS_CI_COMMIT_SHA` and `WORKERS_CI_BRANCH` only during the build. They are compiled into the public health metadata module, never read as runtime secrets.

GitHub Actions is quality-only. `.github/workflows/ci.yml` runs pinned actions, Node 22, `npm ci`, `npm test`, `npm run check`, `npm run build`, and a commit-range whitespace check; it has no Cloudflare credentials or deploy step. Once the repository owner grants the Cloudflare GitHub App access to this single repository, Cloudflare Workers Builds will own preview and production deployment.

## Smoke and read-back

Verify the current manual M0 deployment rather than only the upload result:

```bash
curl --fail --silent --show-error https://discover.ohmyfeed.stream/ | grep -F '<title>Oh My Feed Discover</title>'
curl --fail --silent --show-error https://ohmyfeed.stream/ | grep -F '<title>Oh My Feed Discover</title>'
curl --fail --silent --show-error https://discover.ohmyfeed.stream/styles.css > /dev/null
curl --fail --silent --show-error https://discover.ohmyfeed.stream/app.js > /dev/null
```

After Workers Builds is connected, confirm `/healthz` returns HTTP 200 and exactly public `variant`, `branch`, `commitSha`, and `buildTimestamp` fields. Compare `variant` to `variant_b_discover`, `branch` to the Workers Builds branch, and `commitSha` to the pushed source SHA.

## Rollback

In Cloudflare Dashboard, open `oh-my-feed-discover` → Deployments, select the last known-good version, and roll it back. Repeat the smoke/read-back commands above. After Workers Builds is connected, also confirm the returned `commitSha` is the expected prior source SHA. Do not add an independent GitHub Actions deploy workflow: Cloudflare Workers Builds will remain the single deployment owner for this branch.
