export function createSession(data) {
  return {
    items: structuredClone(data.items),
    suggestion: structuredClone(data.suggestion),
    knowledge: [],
    projectLinks: {},
  };
}

export function visibleTodayItems(session) {
  return session.items.filter(
    (item) => item.selectedForToday && item.humanState.visibility === "visible",
  );
}

export function visibleBrowseItems(session) {
  return session.items.filter(
    (item) => !item.browseExcluded && item.humanState.visibility === "visible",
  );
}

export function markOpened(session, itemId) {
  const item = requireItem(session, itemId);
  item.humanState.readState = "read";
  return session;
}

export function setSaved(session, itemId, saved) {
  const item = requireItem(session, itemId);
  item.humanState.saved = Boolean(saved);
  return session;
}

export function setVisibility(session, itemId, visibility) {
  if (!["visible", "hidden"].includes(visibility)) {
    throw new Error(`Unknown visibility: ${visibility}`);
  }
  const item = requireItem(session, itemId);
  item.humanState.visibility = visibility;
  return session;
}

export function confirmProjectLink(session, itemId, projectId) {
  requireItem(session, itemId);
  session.projectLinks[itemId] = { projectId, status: "confirmed" };
  return session;
}

export function decideSuggestion(session, decision, knowledgePreview) {
  if (!["accepted", "rejected"].includes(decision)) {
    throw new Error(`Unknown decision: ${decision}`);
  }

  if (session.suggestion.status !== "pending") {
    if (session.suggestion.status === decision) return session;
    throw new Error(`Suggestion already ${session.suggestion.status}`);
  }

  session.suggestion.status = decision;
  if (decision === "accepted") {
    session.knowledge.push(structuredClone(knowledgePreview));
  }
  return session;
}

function requireItem(session, itemId) {
  const item = session.items.find((candidate) => candidate.id === itemId);
  if (!item) throw new Error(`Unknown item: ${itemId}`);
  return item;
}
