import { createCatalogView, sortCatalog } from "./catalog.js";

document.documentElement.classList.add("js");
enableCloudflareWebAnalytics();

const elements = {
  tabs: [...document.querySelectorAll("[data-view]")],
  sorts: [...document.querySelectorAll("[data-sort]")],
  sortControls: document.querySelector("#sort-controls"),
  panel: document.querySelector("#catalog-panel"),
  title: document.querySelector("#catalog-title"),
  list: document.querySelector("#catalog-list"),
  toolCount: document.querySelector("#tool-count"),
  makerCount: document.querySelector("#maker-count"),
  snapshotTime: document.querySelector("#snapshot-time"),
};

const state = { view: "tools", sort: "popular", categoryId: null };
let catalog;

try {
  const response = await fetch("./data/catalog.json");
  if (!response.ok) throw new Error(`Catalog request failed with ${response.status}`);
  catalog = createCatalogView(await response.json());
  restoreStateFromLocation();
  bindControls();
  render();
  focusLocationTarget();
} catch (error) {
  elements.list.setAttribute("aria-busy", "false");
  elements.list.innerHTML = `<p class="error">The catalog could not be loaded. ${escapeHtml(error.message)}</p>`;
}

function bindControls() {
  elements.tabs.forEach((tab) => {
    tab.addEventListener("click", () => selectView(tab.dataset.view));
    tab.addEventListener("keydown", handleTabKey);
  });
  elements.sorts.forEach((button) => {
    button.addEventListener("click", () => {
      state.sort = button.dataset.sort;
      commitState();
    });
  });
  elements.list.addEventListener("click", (event) => {
    const makerLink = event.target.closest("[data-open-maker]");
    const toolLink = event.target.closest("[data-open-tool]");
    const categoryLink = event.target.closest("[data-open-category]");
    if (makerLink) openRelatedView(event, "people", `#maker-${makerLink.dataset.openMaker}`);
    if (toolLink) openRelatedView(event, "tools", `#tool-${slugId(toolLink.dataset.openTool)}`);
    if (categoryLink) {
      event.preventDefault();
      state.view = "tools";
      state.categoryId = categoryLink.dataset.openCategory;
      commitState();
    }
  });
  window.addEventListener("popstate", restoreFromHistory);
  window.addEventListener("hashchange", restoreFromHistory);
}

function handleTabKey(event) {
  const current = elements.tabs.indexOf(event.currentTarget);
  let next = current;
  if (event.key === "ArrowLeft") next = (current - 1 + elements.tabs.length) % elements.tabs.length;
  if (event.key === "ArrowRight") next = (current + 1) % elements.tabs.length;
  if (event.key === "Home") next = 0;
  if (event.key === "End") next = elements.tabs.length - 1;
  if (next === current && !["Home", "End"].includes(event.key)) return;
  event.preventDefault();
  elements.tabs[next].focus();
  selectView(elements.tabs[next].dataset.view);
}

function selectView(view) {
  state.view = view;
  state.categoryId = null;
  commitState();
}

function openRelatedView(event, view, hash) {
  event.preventDefault();
  state.view = view;
  state.categoryId = null;
  commitState(hash);
}

function commitState(hash = "") {
  const url = new URL(location.href);
  url.searchParams.delete("view");
  url.searchParams.delete("sort");
  url.searchParams.delete("category");
  if (state.view !== "tools") url.searchParams.set("view", state.view);
  if (state.sort !== "popular") url.searchParams.set("sort", state.sort);
  if (state.categoryId) url.searchParams.set("category", state.categoryId);
  url.hash = hash;
  history.pushState(null, "", url);
  render();
  focusLocationTarget();
}

function restoreFromHistory() {
  restoreStateFromLocation();
  render();
  focusLocationTarget();
}

function restoreStateFromLocation() {
  const url = new URL(location.href);
  const requestedView = url.searchParams.get("view");
  const requestedSort = url.searchParams.get("sort");
  const requestedCategory = url.searchParams.get("category");
  state.view = ["tools", "people", "categories"].includes(requestedView) ? requestedView : "tools";
  state.sort = ["popular", "newest"].includes(requestedSort) ? requestedSort : "popular";
  state.categoryId = catalog.categories.some(({ id }) => id === requestedCategory) ? requestedCategory : null;
  if (location.hash.startsWith("#maker-")) state.view = "people";
  if (location.hash.startsWith("#tool-")) state.view = "tools";
  if (state.view !== "tools") state.categoryId = null;
}

function focusLocationTarget() {
  if (!location.hash) return;
  requestAnimationFrame(() => document.querySelector(location.hash)?.focus({ preventScroll: true }));
}

function render() {
  elements.toolCount.textContent = catalog.tools.length;
  elements.makerCount.textContent = catalog.makers.length;
  elements.snapshotTime.textContent = `Collected ${formatDateTime(catalog.collectedAt)} · ${catalog.source.provider} ${catalog.source.apiVersion}`;
  elements.tabs.forEach((tab) => {
    const selected = tab.dataset.view === state.view;
    tab.setAttribute("aria-selected", String(selected));
    tab.tabIndex = selected ? 0 : -1;
  });
  const selectedTab = elements.tabs.find((tab) => tab.dataset.view === state.view);
  elements.panel.setAttribute("aria-labelledby", `${selectedTab.id} catalog-title`);
  elements.sorts.forEach((button) => {
    const selected = button.dataset.sort === state.sort;
    button.classList.toggle("active", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
  elements.sortControls.hidden = state.view !== "tools";

  if (state.view === "tools") renderTools();
  if (state.view === "people") renderPeople();
  if (state.view === "categories") renderCategories();
  elements.list.setAttribute("aria-busy", "false");
}

function renderTools() {
  const allTools = sortCatalog(catalog.tools, state.sort);
  const tools = state.categoryId
    ? allTools.filter(({ categoryId }) => categoryId === state.categoryId)
    : allTools;
  const category = catalog.categories.find(({ id }) => id === state.categoryId);
  elements.title.textContent = category ? category.name : "Tools";
  elements.list.innerHTML = tools.map((tool, index) => toolTemplate(tool, index + 1)).join("");
}

function toolTemplate(tool, rank) {
  const maker = catalog.makers.find(({ id }) => id === tool.makerId);
  const category = catalog.categories.find(({ id }) => id === tool.categoryId);
  const family = catalog.productFamilies.find(({ id }) => id === tool.familyId);
  return `<article class="catalog-row tool-row" id="tool-${slugId(tool.id)}" tabindex="-1" data-source-id="${escapeHtml(tool.sourceIdentifier)}">
    <span class="rank" aria-label="Rank ${rank}">${rank}.</span>
    <div class="row-main">
      <div class="title-line">
        <a class="item-title" href="${safeHref(tool.repositoryUrl)}" target="_blank" rel="noreferrer">${escapeHtml(tool.name)}</a>
        <span class="host">(${escapeHtml(tool.fullName)})</span>
      </div>
      <p>${escapeHtml(tool.description)}</p>
      <div class="row-links">
        <a href="#maker-${escapeHtml(tool.makerId)}" data-open-maker="${escapeHtml(tool.makerId)}">by ${escapeHtml(maker.displayName)}</a>
        <a href="#category-${escapeHtml(tool.categoryId)}" data-open-category="${escapeHtml(tool.categoryId)}">${escapeHtml(category.name)}</a>
        ${family ? `<span class="family-label">family · ${escapeHtml(family.name)}</span>` : ""}
      </div>
    </div>
    <div class="row-stats">
      <strong>★ ${formatNumber(tool.stars)}</strong>
      <span>${formatNumber(tool.forks)} forks</span>
      <span>created ${formatDate(tool.createdAt)}</span>
      <code>${escapeHtml(tool.sourceIdentifier)}</code>
    </div>
  </article>`;
}

function renderPeople() {
  elements.title.textContent = "People & organizations";
  const makers = [...catalog.makers].sort((left, right) => left.displayName.localeCompare(right.displayName, "en"));
  elements.list.innerHTML = makers.map((maker, index) => makerTemplate(maker, index + 1)).join("");
}

function makerTemplate(maker, rank) {
  const tools = maker.toolIds
    .map((toolId) => catalog.tools.find(({ id }) => id === toolId))
    .filter(Boolean);
  return `<article class="catalog-row person-row" id="maker-${escapeHtml(maker.id)}" tabindex="-1" data-source-id="${escapeHtml(maker.sourceIdentifier)}">
    <span class="rank" aria-label="Row ${rank}">${rank}.</span>
    <img src="${safeHref(maker.avatarUrl)}" alt="" width="42" height="42" loading="lazy" />
    <div class="row-main">
      <div class="title-line"><a class="item-title" href="${safeHref(maker.profileUrl)}" target="_blank" rel="noreferrer">${escapeHtml(maker.displayName)}</a><span class="host">(@${escapeHtml(maker.login)} · ${escapeHtml(maker.type)})</span></div>
      <p>${escapeHtml(maker.description || "GitHub profile")}</p>
      <div class="row-links">${tools.map((tool) => `<a href="#tool-${slugId(tool.id)}" data-open-tool="${escapeHtml(tool.id)}">${escapeHtml(tool.name)}</a>`).join("")}</div>
    </div>
    <div class="row-stats"><strong>${tools.length} tool${tools.length === 1 ? "" : "s"}</strong><code>${escapeHtml(maker.sourceIdentifier)}</code></div>
  </article>`;
}

function renderCategories() {
  elements.title.textContent = "Categories";
  elements.list.innerHTML = catalog.categories.map((category, index) => {
    const tools = catalog.tools.filter(({ categoryId }) => categoryId === category.id);
    return `<article class="catalog-row category-row" id="category-${escapeHtml(category.id)}">
      <span class="rank" aria-label="Row ${index + 1}">${index + 1}.</span>
      <div class="row-main">
        <div class="title-line"><a class="item-title" href="#category-${escapeHtml(category.id)}" data-open-category="${escapeHtml(category.id)}">${escapeHtml(category.name)}</a></div>
        <p>${escapeHtml(category.description)}</p>
        <div class="row-links">${tools.map((tool) => `<a href="#tool-${slugId(tool.id)}" data-open-tool="${escapeHtml(tool.id)}">${escapeHtml(tool.name)}</a>`).join("")}</div>
      </div>
      <div class="row-stats"><strong>${tools.length} tool${tools.length === 1 ? "" : "s"}</strong></div>
    </article>`;
  }).join("");
}

function enableCloudflareWebAnalytics() {
  const token = document.querySelector('meta[name="cf-web-analytics-token"]')?.content.trim();
  if (!token) return;
  const beacon = document.createElement("script");
  beacon.defer = true;
  beacon.src = "https://static.cloudflareinsights.com/beacon.min.js";
  beacon.dataset.cfBeacon = JSON.stringify({ token });
  document.head.append(beacon);
}

function slugId(value) {
  return value.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-").replaceAll(/^-|-$/g, "");
}

function safeHref(value) {
  const url = new URL(value);
  return url.protocol === "https:" ? escapeHtml(url.href) : "#";
}

function formatNumber(value) {
  return new Intl.NumberFormat("en", { notation: value >= 10_000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(value);
}

function formatDate(value) {
  return new Intl.DateTimeFormat("en", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(value));
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(value));
}

function escapeHtml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}
