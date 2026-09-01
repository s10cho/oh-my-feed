import {
  confirmProjectLink,
  createSession,
  decideSuggestion,
  markOpened,
  setSaved,
  setVisibility,
  visibleBrowseItems,
  visibleTodayItems,
} from "./src/domain.js";
import { safeHref } from "./public/url-safety.js";

const [data, liveFeed] = await Promise.all([
  fetchJson("./mock/demo-data.json"),
  fetchJson("./data/live-feed.json"),
]);

const runtimeData = {
  ...data,
  items: [
    ...liveFeed.items.map((item) => ({
      ...item,
      selectedForToday: false,
      humanState: { readState: "unread", saved: false, visibility: "visible" },
      agentState: { reviewState: "unseen" },
    })),
    ...data.items.map((item) => ({ ...item, browseExcluded: true })),
  ],
};

let session = createSession(runtimeData);
let mode = "browse";
let selectedItemId = null;
let toastTimer;

const elements = {
  projectChip: document.querySelector("#project-chip"),
  projectName: document.querySelector("#project-name"),
  modeButtons: document.querySelectorAll("[data-mode]"),
  briefEyebrow: document.querySelector("#brief-eyebrow"),
  briefTitle: document.querySelector("#brief-title"),
  briefDescription: document.querySelector("#brief-description"),
  summaryPrimary: document.querySelector("#summary-primary"),
  summaryPrimaryLabel: document.querySelector("#summary-primary-label"),
  summaryArrow: document.querySelector("#summary-arrow"),
  summarySecondary: document.querySelector("#summary-secondary"),
  summarySecondaryLabel: document.querySelector("#summary-secondary-label"),
  queueEyebrow: document.querySelector("#queue-eyebrow"),
  queueTitle: document.querySelector("#queue-title"),
  feedList: document.querySelector("#feed-list"),
  emptyFeed: document.querySelector("#empty-feed"),
  detailPanel: document.querySelector("#detail-panel"),
  knowledgeSection: document.querySelector("#knowledge"),
  knowledgeLedger: document.querySelector("#knowledge-ledger"),
  askForm: document.querySelector("#ask-form"),
  answer: document.querySelector("#answer"),
  resetButton: document.querySelector("#reset-button"),
  toast: document.querySelector("#toast"),
};

elements.projectName.textContent = data.project.name;
elements.modeButtons.forEach((button) => {
  button.addEventListener("click", () => setMode(button.dataset.mode));
});

function setMode(nextMode) {
  if (mode === nextMode) return;
  mode = nextMode;
  selectedItemId = null;
  elements.answer.hidden = true;
  render();
}

function render() {
  renderMode();
  renderFeed();
  renderDetail();
  renderKnowledge();
}

function renderMode() {
  const personalized = mode === "personalized";
  elements.modeButtons.forEach((button) => {
    const active = button.dataset.mode === mode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  elements.projectChip.hidden = !personalized;
  elements.knowledgeSection.hidden = !personalized;

  if (personalized) {
    elements.briefEyebrow.textContent = "PERSONALIZED · SAMPLE";
    elements.briefTitle.innerHTML = `${escapeHtml(data.project.name)}와 관련된<br />새 소식`;
    elements.briefDescription.textContent = `${data.project.name}의 목표와 기술 구성을 기준으로 한 개인화 방식 검토용 샘플입니다.`;
    elements.summaryPrimary.textContent = data.displayMetrics.newItemCount;
    elements.summaryPrimaryLabel.textContent = "새 글";
    elements.summaryArrow.textContent = "→";
    elements.summarySecondary.textContent = data.displayMetrics.todayCount;
    elements.summarySecondaryLabel.textContent = `${data.project.name} 관련`;
    elements.queueEyebrow.textContent = "PERSONALIZED FEED";
    elements.queueTitle.textContent = "내 피드";
  } else {
    elements.briefEyebrow.textContent = `${formatSnapshotTime(liveFeed.fetchedAt)} · LIVE SNAPSHOT`;
    elements.briefTitle.textContent = "새로 나온 소식";
    elements.briefDescription.textContent = "OpenAI, GitHub, Cloudflare, Hugging Face 공식 피드에서 가져왔습니다.";
    elements.summaryPrimary.textContent = liveFeed.items.length;
    elements.summaryPrimaryLabel.textContent = "최신 글";
    elements.summaryArrow.textContent = "·";
    elements.summarySecondary.textContent = liveFeed.sourceCount;
    elements.summarySecondaryLabel.textContent = "공식 소스";
    elements.queueEyebrow.textContent = "LATEST FEED";
    elements.queueTitle.textContent = "새 글";
  }
}

function currentItems() {
  return mode === "personalized" ? visibleTodayItems(session) : visibleBrowseItems(session);
}

function renderFeed() {
  const items = currentItems();
  elements.feedList.innerHTML = mode === "browse"
    ? browseGroupsTemplate(items)
    : items.map(personalizedItemTemplate).join("");
  elements.emptyFeed.hidden = items.length > 0;
  elements.feedList.querySelectorAll(".feed-item").forEach((button) => {
    button.addEventListener("click", () => selectItem(button.dataset.itemId));
  });
}

function browseGroupsTemplate(items) {
  const categoryOrder = ["공식 업데이트", "도구와 제품", "연구와 논문", "개발 가이드"];
  return categoryOrder.map((category) => {
    const categoryItems = items.filter((item) => item.category === category);
    if (!categoryItems.length) return "";
    return `<section class="feed-group" aria-labelledby="category-${slug(category)}">
      <h3 id="category-${slug(category)}" class="category-heading">${escapeHtml(category)} <span>${categoryItems.length}</span></h3>
      ${categoryItems.map(browseItemTemplate).join("")}
    </section>`;
  }).join("");
}

function browseItemTemplate(item) {
  return `<button class="feed-item" type="button" data-item-id="${item.id}" aria-current="${item.id === selectedItemId}">
    <span class="priority-bar" aria-hidden="true"></span>
    <span><span class="feed-source">${escapeHtml(item.source)} · ${formatPublishedDate(item.publishedAt)}</span><span class="feed-title">${escapeHtml(item.title)}</span></span>
    ${stateRailTemplate(item)}
  </button>`;
}

function personalizedItemTemplate(item) {
  const high = (item.relevance?.score ?? 0) >= 0.85;
  return `<button class="feed-item ${high ? "high" : ""}" type="button" data-item-id="${item.id}" aria-current="${item.id === selectedItemId}">
    <span class="priority-bar" aria-hidden="true"></span>
    <span><span class="feed-source">${escapeHtml(item.source)} · ${Math.round(item.relevance.score * 100)}% 관련</span><span class="feed-title">${escapeHtml(item.title)}</span></span>
    ${stateRailTemplate(item)}
  </button>`;
}

function stateRailTemplate(item) {
  return `<span class="state-rail" aria-label="사람과 에이전트 처리 상태">
    <span class="actor-state human ${item.humanState.readState === "read" ? "active" : ""}">나 ${item.humanState.readState}</span>
    <span class="actor-state agent ${item.agentState.reviewState === "reviewed" ? "active" : ""}">AI ${item.agentState.reviewState}</span>
  </span>`;
}

function selectItem(itemId) {
  selectedItemId = itemId;
  markOpened(session, itemId);
  render();
}

function renderDetail() {
  if (!selectedItemId) {
    const message = mode === "personalized"
      ? "글을 선택하면<br />프로젝트 관련 근거를 확인할 수 있습니다."
      : "글을 선택하면<br />내용을 확인할 수 있습니다.";
    elements.detailPanel.innerHTML = `<div class="detail-placeholder"><span class="placeholder-line"></span><p>${message}</p></div>`;
    return;
  }

  const item = session.items.find(({ id }) => id === selectedItemId);
  if (!item || item.humanState.visibility === "hidden") {
    selectedItemId = null;
    renderDetail();
    return;
  }
  elements.detailPanel.innerHTML = mode === "personalized" ? personalizedDetailTemplate(item) : browseDetailTemplate(item);
  bindDetailActions(item);
}

function detailHeaderTemplate(item, contextLabel) {
  return `<div class="detail-meta"><span>${escapeHtml(item.source)}</span><span>${escapeHtml(contextLabel)}</span></div>
    <h2>${escapeHtml(item.title)}</h2>
    <div class="status-explanation"><span class="status-pill human">나 · ${item.humanState.readState}</span><span class="status-pill agent">Agent · ${item.agentState.reviewState}</span></div>`;
}

function browseDetailTemplate(item) {
  return `<article class="detail-card">
    ${detailHeaderTemplate(item, item.category)}
    <section class="story-summary" aria-labelledby="story-summary-title"><h3 id="story-summary-title">RSS에서 제공한 설명</h3><p>${escapeHtml(item.summary || "이 피드는 설명을 제공하지 않습니다. 자세한 내용은 원문에서 확인하세요.")}</p></section>
    ${commonActionsTemplate(item, false)}
    <div class="personalization-invite"><strong>개인화는 다음 단계에서 연결합니다</strong><p>현재 내 피드는 동작 방식 검토용 샘플입니다. 실제 글의 관련도는 아직 계산하지 않습니다.</p><button class="button primary" type="button" data-action="open-personalized">샘플 내 피드 보기</button></div>
  </article>`;
}

function personalizedDetailTemplate(item) {
  const reasons = item.relevance.reasons ?? ["프로젝트의 관심 주제와 일부 겹칩니다."];
  const impacts = item.relevance.impact ?? ["원문을 확인한 뒤 영향 여부를 판단하세요."];
  const isSuggestionItem = session.suggestion.feedItemId === item.id;
  return `<article class="detail-card">
    ${detailHeaderTemplate(item, `맞춤 기준 · ${data.project.name}`)}
    <section class="relevance-block" aria-labelledby="relevance-title">
      <div class="relevance-head"><strong id="relevance-title">${escapeHtml(data.project.name)}과 관련된 이유</strong><span class="relevance-score">${Math.round(item.relevance.score * 100)}%</span></div>
      <div class="relevance-grid"><div><h3>관련 근거</h3><ul>${reasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join("")}</ul></div><div><h3>살펴볼 점</h3><ul>${impacts.map((impact) => `<li>${escapeHtml(impact)}</li>`).join("")}</ul></div></div>
    </section>
    <div class="matching-basis" aria-label="맞춤 기준"><span>맞춤 기준</span>${data.project.technologies.slice(1).map((technology) => `<b>${escapeHtml(technology)}</b>`).join("")}</div>
    ${commonActionsTemplate(item, true)}
    ${isSuggestionItem ? suggestionTemplate() : ""}
  </article>`;
}

function commonActionsTemplate(item, personalized) {
  const link = session.projectLinks[item.id];
  return `<div class="action-bar">
    <a class="button" href="${escapeHtml(safeHref(item.url, "external.article"))}" target="_blank" rel="noreferrer">원문 열기</a>
    <button class="button" type="button" data-action="save">${item.humanState.saved ? "저장 취소" : "저장"}</button>
    ${personalized ? `<button class="button primary" type="button" data-action="link" ${link ? "disabled" : ""}>${link ? "Orbit에 연결됨" : "Orbit에 연결"}</button>` : ""}
    <button class="button danger" type="button" data-action="hide">숨김</button>
  </div>`;
}

function bindDetailActions(item) {
  elements.detailPanel.querySelector('[data-action="save"]').addEventListener("click", () => {
    setSaved(session, item.id, !item.humanState.saved);
    showToast(item.humanState.saved ? "나중에 볼 글로 저장했습니다." : "저장을 취소했습니다.");
    render();
  });
  elements.detailPanel.querySelector('[data-action="hide"]').addEventListener("click", () => {
    setVisibility(session, item.id, "hidden");
    showToast("피드에서 숨겼습니다. Agent 기록은 유지됩니다.");
    render();
  });
  elements.detailPanel.querySelector('[data-action="open-personalized"]')?.addEventListener("click", () => {
    mode = "personalized";
    selectedItemId = null;
    render();
  });
  elements.detailPanel.querySelector('[data-action="link"]')?.addEventListener("click", () => {
    confirmProjectLink(session, item.id, data.project.id);
    showToast(`${data.project.name}에 연결했습니다.`);
    render();
  });
  elements.detailPanel.querySelectorAll("[data-decision]").forEach((button) => {
    button.addEventListener("click", () => {
      const decision = button.dataset.decision;
      decideSuggestion(session, decision, data.acceptedKnowledgePreview);
      showToast(decision === "accepted" ? "내 AI가 사용할 지식으로 승인했습니다." : "제안을 거절했습니다.");
      render();
      if (decision === "accepted") elements.knowledgeSection.scrollIntoView({ behavior: "smooth" });
    });
  });
}

function suggestionTemplate() {
  const suggestion = session.suggestion;
  if (suggestion.status !== "pending") {
    const label = suggestion.status === "accepted" ? "승인됨" : "거절됨";
    return `<div class="suggestion"><span class="suggestion-label">AI 지식 제안 · ${label}</span><p>${escapeHtml(suggestion.statement)}</p></div>`;
  }
  return `<div class="suggestion"><span class="suggestion-label">AI 지식 제안 · 승인 필요</span><p>${escapeHtml(suggestion.statement)}</p><div class="decision-row"><button class="button primary" type="button" data-decision="accepted">AI 지식으로 승인</button><button class="button" type="button" data-decision="rejected">거절</button></div></div>`;
}

function renderKnowledge() {
  const knowledge = session.knowledge[0];
  if (!knowledge) {
    elements.knowledgeLedger.innerHTML = '<p class="muted">아직 승인한 지식이 없습니다.</p>';
    return;
  }
  elements.knowledgeLedger.innerHTML = `<article class="knowledge-card"><p>${escapeHtml(knowledge.statement)}</p><div class="knowledge-provenance"><span>PROJECT · ${escapeHtml(data.project.name)}</span><span>APPROVAL · HUMAN</span><span>SOURCE · ${escapeHtml(knowledge.sourceItemId)}</span></div></article>`;
}

elements.askForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const knowledge = session.knowledge[0];
  const sourceItem = knowledge ? session.items.find((item) => item.id === knowledge.sourceItemId) : null;
  elements.answer.hidden = false;
  elements.answer.innerHTML = knowledge
    ? `<strong>설계에 반영할 변화 1건을 찾았습니다.</strong><p>${escapeHtml(knowledge.statement)}</p><small>근거: 사용자가 승인한 ${escapeHtml(sourceItem?.source ?? "원문")} 항목 · ${escapeHtml(data.project.name)}</small>`
    : "<strong>답변할 근거가 없습니다.</strong><p>먼저 내 피드에서 AI 지식 제안을 검토하세요.</p>";
});

elements.resetButton.addEventListener("click", () => {
  session = createSession(runtimeData);
  selectedItemId = null;
  elements.answer.hidden = true;
  showToast("피드 상태를 처음으로 돌렸습니다.");
  render();
});

function showToast(message) {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add("visible");
  toastTimer = setTimeout(() => elements.toast.classList.remove("visible"), 2400);
}

function slug(value) {
  return [...value].map((character) => character.codePointAt(0).toString(16)).join("-");
}

function formatSnapshotTime(value) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Seoul",
  }).format(new Date(value));
}

function formatPublishedDate(value) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Seoul",
  }).format(new Date(value));
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} 데이터를 불러오지 못했습니다.`);
  return response.json();
}

function escapeHtml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

render();
