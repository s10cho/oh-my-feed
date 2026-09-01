# Oh My Feed Discover

## Deployed links and status

- Hub: https://ohmyfeed.stream (separate experiment hub, not deployed by this branch)
- Discover: https://discover.ohmyfeed.stream (target custom domain for this branch)
- Focus comparison: https://focus.ohmyfeed.stream (separate branch)

This branch implements M0 only: a public Discover Hello World page and a Worker `/healthz` endpoint. No deployment has been claimed or performed from this repository checkout. The deployment SHA is exposed only after Cloudflare Workers Builds runs `npm run build`.

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
5. Add `discover.ohmyfeed.stream` as the Worker Custom Domain. `wrangler.jsonc` declares that hostname for the `oh-my-feed-discover` Worker.
6. Let Workers Builds inject `WORKERS_CI_COMMIT_SHA` and `WORKERS_CI_BRANCH` only during the build. They are compiled into the public health metadata module, never read as runtime secrets.

GitHub Actions is quality-only. `.github/workflows/ci.yml` runs pinned actions, Node 22, `npm ci`, `npm test`, `npm run check`, `npm run build`, and `git diff --check`; it has no Cloudflare credentials or deploy step. Cloudflare Workers Builds owns preview and production deployment.

## Smoke and read-back

After Workers Builds deploys, verify the actual public deployment rather than only the build result:

```bash
curl --fail --silent --show-error https://discover.ohmyfeed.stream/healthz
curl --fail --silent --show-error https://discover.ohmyfeed.stream/ | grep -F '<title>Oh My Feed Discover</title>'
curl --fail --silent --show-error https://discover.ohmyfeed.stream/styles.css > /dev/null
curl --fail --silent --show-error https://discover.ohmyfeed.stream/app.js > /dev/null
```

Confirm `/healthz` returns HTTP 200 and exactly public `variant`, `branch`, `commitSha`, and `buildTimestamp` fields. Compare `variant` to `variant_b_discover`, `branch` to the Workers Builds branch, and `commitSha` to the deployment source SHA. Do not treat this README as evidence that the custom domain is live.

## Rollback

In Cloudflare Dashboard, open `oh-my-feed-discover` → Deployments, select the last known-good Worker version, and roll it back. Then repeat the smoke/read-back commands above and confirm the returned `commitSha` is the expected prior source SHA. Do not use a GitHub Actions deploy workflow to roll back: Workers Builds is the deployment owner for this branch.
