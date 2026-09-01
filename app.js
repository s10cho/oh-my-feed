import {
  confirmProjectLink,
  createSession,
  decideSuggestion,
  markOpened,
  setSaved,
  setVisibility,
  visibleTodayItems,
} from "./src/domain.js";

const data = await fetch("./mock/demo-data.json").then((response) => {
  if (!response.ok) throw new Error("샘플 데이터를 불러오지 못했습니다.");
  return response.json();
});

let session = createSession(data);
let selectedItemId = null;
let toastTimer;

const elements = {
  projectName: document.querySelector("#project-name"),
  newCount: document.querySelector("#new-count"),
  todayCount: document.querySelector("#today-count"),
  feedList: document.querySelector("#feed-list"),
  emptyFeed: document.querySelector("#empty-feed"),
  detailPanel: document.querySelector("#detail-panel"),
  knowledgeLedger: document.querySelector("#knowledge-ledger"),
  askForm: document.querySelector("#ask-form"),
  answer: document.querySelector("#answer"),
  resetButton: document.querySelector("#reset-button"),
  toast: document.querySelector("#toast"),
};

elements.projectName.textContent = data.project.name;
elements.newCount.textContent = data.displayMetrics.newItemCount;
elements.todayCount.textContent = data.displayMetrics.todayCount;

function render() {
  renderFeed();
  renderDetail();
  renderKnowledge();
}

function renderFeed() {
  const items = visibleTodayItems(session);
  elements.feedList.innerHTML = items.map(feedItemTemplate).join("");
  elements.emptyFeed.hidden = items.length > 0;

  elements.feedList.querySelectorAll(".feed-item").forEach((button) => {
    button.addEventListener("click", () => selectItem(button.dataset.itemId));
  });
}

function feedItemTemplate(item) {
  const active = item.id === selectedItemId;
  const high = (item.relevance?.score ?? 0) >= 0.85;
  return `
    <button class="feed-item ${high ? "high" : ""}" type="button"
      data-item-id="${item.id}" aria-current="${active}">
      <span class="priority-bar" aria-hidden="true"></span>
      <span>
        <span class="feed-source">${escapeHtml(item.source)} · ${Math.round(item.relevance.score * 100)}% related</span>
        <span class="feed-title">${escapeHtml(item.title)}</span>
      </span>
      <span class="state-rail" aria-label="사람과 에이전트 처리 상태">
        <span class="actor-state human ${item.humanState.readState === "read" ? "active" : ""}">나 ${item.humanState.readState}</span>
        <span class="actor-state agent ${item.agentState.reviewState === "reviewed" ? "active" : ""}">AI ${item.agentState.reviewState}</span>
      </span>
    </button>`;
}

function selectItem(itemId) {
  selectedItemId = itemId;
  markOpened(session, itemId);
  render();
}

function renderDetail() {
  if (!selectedItemId) return;
  const item = session.items.find(({ id }) => id === selectedItemId);
  if (!item || item.humanState.visibility === "hidden") {
    selectedItemId = null;
    elements.detailPanel.innerHTML = `<div class="detail-placeholder"><span class="placeholder-line"></span><p>다음 항목을 선택해 판단을 이어가세요.</p></div>`;
    return;
  }

  const reasons = item.relevance.reasons ?? ["프로젝트 기술과 주제가 일부 겹칩니다."];
  const impacts = item.relevance.impact ?? ["원문을 확인한 뒤 영향 여부를 판단하세요."];
  const link = session.projectLinks[item.id];
  const isSuggestionItem = session.suggestion.feedItemId === item.id;

  elements.detailPanel.innerHTML = `
    <article class="detail-card">
      <div class="detail-meta"><span>${escapeHtml(item.source)}</span><span>근거: ${escapeHtml(item.relevance.generatedBy)}</span></div>
      <h2>${escapeHtml(item.title)}</h2>
      <div class="status-explanation">
        <span class="status-pill human">나 · ${item.humanState.readState}</span>
        <span class="status-pill agent">Agent · ${item.agentState.reviewState}</span>
      </div>
      <section class="relevance-block" aria-labelledby="relevance-title">
        <div class="relevance-head"><strong id="relevance-title">${escapeHtml(data.project.name)}에 중요한 이유</strong><span class="relevance-score">${Math.round(item.relevance.score * 100)}%</span></div>
        <div class="relevance-grid">
          <div><h3>WHY IT MATTERS</h3><ul>${reasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join("")}</ul></div>
          <div><h3>POTENTIAL IMPACT</h3><ul>${impacts.map((impact) => `<li>${escapeHtml(impact)}</li>`).join("")}</ul></div>
        </div>
      </section>
      <div class="action-bar">
        <a class="button" href="${encodeURI(item.url)}" target="_blank" rel="noreferrer">원문 열기</a>
        <button class="button" type="button" data-action="save">${item.humanState.saved ? "저장 취소" : "저장"}</button>
        <button class="button primary" type="button" data-action="link" ${link ? "disabled" : ""}>${link ? "프로젝트에 연결됨" : "프로젝트 연결"}</button>
        <button class="button danger" type="button" data-action="hide">숨김</button>
      </div>
      ${isSuggestionItem ? suggestionTemplate() : ""}
    </article>`;

  elements.detailPanel.querySelector('[data-action="save"]').addEventListener("click", () => {
    setSaved(session, item.id, !item.humanState.saved);
    showToast(item.humanState.saved ? "나중에 볼 항목으로 저장했습니다." : "저장을 취소했습니다.");
    render();
  });
  elements.detailPanel.querySelector('[data-action="link"]').addEventListener("click", () => {
    confirmProjectLink(session, item.id, data.project.id);
    showToast(`${data.project.name}에 연결했습니다.`);
    render();
  });
  elements.detailPanel.querySelector('[data-action="hide"]').addEventListener("click", () => {
    setVisibility(session, item.id, "hidden");
    showToast("Today에서 숨겼습니다. Agent 기록은 유지됩니다.");
    render();
  });
  elements.detailPanel.querySelectorAll("[data-decision]").forEach((button) => {
    button.addEventListener("click", () => {
      const decision = button.dataset.decision;
      decideSuggestion(session, decision, data.acceptedKnowledgePreview);
      showToast(decision === "accepted" ? "내 AI가 사용할 지식으로 승인했습니다." : "제안을 거절했습니다.");
      render();
      if (decision === "accepted") document.querySelector("#knowledge").scrollIntoView({ behavior: "smooth" });
    });
  });
}

function suggestionTemplate() {
  const suggestion = session.suggestion;
  if (suggestion.status !== "pending") {
    return `<div class="suggestion"><span class="suggestion-label">AI KNOWLEDGE PROPOSAL · ${suggestion.status.toUpperCase()}</span><p>${escapeHtml(suggestion.statement)}</p></div>`;
  }
  return `
    <div class="suggestion">
      <span class="suggestion-label">AI KNOWLEDGE PROPOSAL · 사람 승인 필요</span>
      <p>${escapeHtml(suggestion.statement)}</p>
      <div class="decision-row">
        <button class="button primary" type="button" data-decision="accepted">AI 지식으로 승인</button>
        <button class="button" type="button" data-decision="rejected">거절</button>
      </div>
    </div>`;
}

function renderKnowledge() {
  const knowledge = session.knowledge[0];
  if (!knowledge) {
    elements.knowledgeLedger.innerHTML = '<p class="muted">아직 승인한 지식이 없습니다.</p>';
    return;
  }
  elements.knowledgeLedger.innerHTML = `
    <article class="knowledge-card">
      <p>${escapeHtml(knowledge.statement)}</p>
      <div class="knowledge-provenance">
        <span>PROJECT · ${escapeHtml(data.project.name)}</span>
        <span>APPROVAL · HUMAN</span>
        <span>SOURCE · ${escapeHtml(knowledge.sourceItemId)}</span>
      </div>
    </article>`;
}

elements.askForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const knowledge = session.knowledge[0];
  elements.answer.hidden = false;
  elements.answer.innerHTML = knowledge
    ? `<strong>영향 가능성이 있는 변화 1건을 찾았습니다.</strong><p>${escapeHtml(knowledge.statement)}</p><small>근거: 사용자가 승인한 Spring Blog 항목 · ${escapeHtml(data.project.name)}</small>`
    : "<strong>답변할 수 없습니다.</strong><p>아직 사람이 승인한 지식이 없습니다. 먼저 피드에서 AI 제안을 검토하세요.</p>";
});

elements.resetButton.addEventListener("click", () => {
  session = createSession(data);
  selectedItemId = null;
  elements.answer.hidden = true;
  showToast("데모 상태를 처음으로 돌렸습니다.");
  render();
});

function showToast(message) {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add("visible");
  toastTimer = setTimeout(() => elements.toast.classList.remove("visible"), 2400);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

render();
