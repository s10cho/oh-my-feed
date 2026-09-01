import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [html, app, css] = await Promise.all([
  readFile(new URL("../public/index.html", import.meta.url), "utf8"),
  readFile(new URL("../public/app.js", import.meta.url), "utf8"),
  readFile(new URL("../public/styles.css", import.meta.url), "utf8"),
]);

test("first-screen source states the AI tool and maker discovery purpose", () => {
  assert.match(html, /AI tools/i);
  assert.match(html, /people (?:and organizations )?behind them/i);
  assert.match(html, /GitHub API snapshot/i);
  assert.match(html, /Clicks not collected yet/i);
});

test("catalog exposes accessible Tools, People, and Categories tabs plus Popular and Newest sorts", () => {
  for (const view of ["tools", "people", "categories"]) {
    assert.match(html, new RegExp(`role="tab"[^>]+data-view="${view}"`));
  }
  for (const sort of ["popular", "newest"]) {
    assert.match(html, new RegExp(`data-sort="${sort}"`));
  }
  assert.match(app, /aria-selected/);
  assert.match(app, /sortCatalog\(catalog\.tools, state\.sort\)/);
  assert.match(html, /role="tabpanel"/);
  assert.match(html, /aria-controls="catalog-panel"/);
  assert.match(app, /ArrowLeft/);
  assert.match(app, /ArrowRight/);
  assert.match(app, /Home/);
  assert.match(app, /End/);
});

test("UI source renders reciprocal tool-maker links and traceable GitHub destinations", () => {
  assert.match(app, /makerId/);
  assert.match(app, /toolIds/);
  assert.match(app, /repositoryUrl/);
  assert.match(app, /profileUrl/);
  assert.match(app, /sourceIdentifier/);
  assert.match(app, /#maker-/);
  assert.match(app, /#tool-/);
});

test("responsive CSS protects compact rows from overflow at 390px and 1440px", () => {
  assert.match(css, /max-width:\s*1200px/);
  assert.match(css, /overflow-x:\s*clip/);
  assert.match(css, /overflow-wrap:\s*anywhere/);
  assert.match(css, /min-width:\s*0/);
  assert.match(css, /@media\s*\(max-width:\s*640px\)/);
});

test("analytics integration point is disabled until a real Cloudflare token is configured", () => {
  assert.match(html, /name="cf-web-analytics-token" content=""/);
  assert.match(app, /static\.cloudflareinsights\.com\/beacon\.min\.js/);
  assert.match(app, /if \(!token\) return/);
});

test("UI labels explicit product families without folding inspired projects into them", () => {
  assert.match(app, /productFamilies/);
  assert.match(app, /familyId/);
  assert.match(app, /family\.name/);
});
