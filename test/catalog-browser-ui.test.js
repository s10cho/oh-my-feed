import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { Window } from "happy-dom";

const [html, snapshot] = await Promise.all([
  readFile(new URL("../public/index.html", import.meta.url), "utf8"),
  readFile(new URL("../public/data/catalog.json", import.meta.url), "utf8").then(JSON.parse),
]);

test("production UI synchronizes tabs, related links, and browser history with the URL", async () => {
  const window = new Window({ url: "https://discover.ohmyfeed.stream/" });
  window.document.write(html);
  window.fetch = async () => ({ ok: true, json: async () => snapshot });
  window.requestAnimationFrame = (callback) => {
    callback();
    return 1;
  };

  const previous = new Map();
  for (const [name, value] of Object.entries({
    window,
    document: window.document,
    location: window.location,
    history: window.history,
    fetch: window.fetch,
    requestAnimationFrame: window.requestAnimationFrame,
  })) {
    previous.set(name, globalThis[name]);
    globalThis[name] = value;
  }

  try {
    await import(`../public/app.js?browser-ui=${Date.now()}`);

    const peopleTab = window.document.querySelector('[data-view="people"]');
    peopleTab.click();
    assert.equal(new URL(window.location.href).searchParams.get("view"), "people");
    assert.equal(window.location.hash, "");
    assert.equal(window.document.querySelector('[aria-selected="true"]').dataset.view, "people");

    const gstackLink = [...window.document.querySelectorAll("[data-open-tool]")]
      .find((link) => link.textContent === "gstack");
    gstackLink.click();
    assert.equal(new URL(window.location.href).searchParams.get("view"), null);
    assert.equal(window.location.hash, "#tool-garrytan-gstack");
    assert.equal(window.document.querySelector('[aria-selected="true"]').dataset.view, "tools");

    window.history.back();
    await window.happyDOM.waitUntilComplete();
    assert.equal(new URL(window.location.href).searchParams.get("view"), "people");
    assert.equal(window.document.querySelector('[aria-selected="true"]').dataset.view, "people");

    const categoriesTab = window.document.querySelector('[data-view="categories"]');
    categoriesTab.click();
    assert.equal(new URL(window.location.href).searchParams.get("view"), "categories");
    assert.equal(window.location.hash, "");

    const codingAgents = [...window.document.querySelectorAll("[data-open-category]")]
      .find((link) => link.textContent === "Coding agents");
    codingAgents.click();
    const categoryUrl = new URL(window.location.href);
    assert.equal(categoryUrl.searchParams.get("view"), null);
    assert.equal(categoryUrl.searchParams.get("category"), "coding-agents");
    assert.equal(window.document.querySelector("#catalog-title").textContent, "Coding agents");

    window.document.querySelector('[data-sort="newest"]').click();
    const sortedUrl = new URL(window.location.href);
    assert.equal(sortedUrl.searchParams.get("sort"), "newest");
    assert.equal(sortedUrl.searchParams.get("category"), "coding-agents");

    const toolsTab = window.document.querySelector('[data-view="tools"]');
    toolsTab.dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    assert.equal(window.document.querySelector('[aria-selected="true"]').dataset.view, "people");
    assert.equal(window.document.activeElement.dataset.view, "people");
    window.document.activeElement.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Home", bubbles: true }));
    assert.equal(window.document.querySelector('[aria-selected="true"]').dataset.view, "tools");
  } finally {
    for (const [name, value] of previous) {
      if (value === undefined) delete globalThis[name];
      else globalThis[name] = value;
    }
    await window.happyDOM.close();
  }
});

test("production UI rejects malformed snapshots without rendering unsafe destinations", async () => {
  const malicious = structuredClone(snapshot);
  malicious.makers[0].profileUrl = "javascript:alert(1)";
  malicious.makers[0].avatarUrl = "https://evil.example/avatar.png";

  const window = new Window({ url: "https://discover.ohmyfeed.stream/" });
  window.document.write(html);
  window.fetch = async () => ({ ok: true, json: async () => malicious });

  const previous = new Map();
  for (const [name, value] of Object.entries({
    window,
    document: window.document,
    location: window.location,
    history: window.history,
    fetch: window.fetch,
    requestAnimationFrame: (callback) => { callback(); return 1; },
  })) {
    previous.set(name, globalThis[name]);
    globalThis[name] = value;
  }

  try {
    await assert.doesNotReject(() => import(`../public/app.js?unsafe-browser-ui=${Date.now()}`));
    assert.match(window.document.querySelector("#catalog-list").textContent, /could not be loaded/i);
    assert.equal(window.document.querySelector('a[href^="javascript:"]'), null);
    assert.equal(window.document.querySelector('img[src^="https://evil.example"]'), null);
  } finally {
    for (const [name, value] of previous) {
      if (value === undefined) delete globalThis[name];
      else globalThis[name] = value;
    }
    await window.happyDOM.close();
  }
});
