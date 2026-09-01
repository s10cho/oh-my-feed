import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  createSession,
  decideSuggestion,
  markOpened,
  setVisibility,
  visibleBrowseItems,
  visibleTodayItems,
} from "../src/domain.js";

const fixture = JSON.parse(
  await readFile(new URL("../mock/demo-data.json", import.meta.url), "utf8"),
);

test("agent review does not mark the human item as read", () => {
  const session = createSession(fixture);
  const item = session.items.find(({ id }) => id === "item-mcp-auth");

  assert.equal(item.agentState.reviewState, "reviewed");
  assert.equal(item.humanState.readState, "unread");

  markOpened(session, item.id);

  assert.equal(item.humanState.readState, "read");
  assert.equal(item.agentState.reviewState, "reviewed");
});

test("browse includes visible items without pretending they are personalized", () => {
  const session = createSession(fixture);

  assert.equal(visibleBrowseItems(session).length, 5);
  assert.equal(visibleTodayItems(session).length, 3);
});

test("hiding an item removes it from Today without deleting agent state", () => {
  const session = createSession(fixture);
  const itemId = "item-mcp-auth";

  setVisibility(session, itemId, "hidden");

  assert.equal(visibleTodayItems(session).some(({ id }) => id === itemId), false);
  assert.equal(
    session.items.find(({ id }) => id === itemId).agentState.reviewState,
    "reviewed",
  );
});

test("accepting a pending suggestion creates approved knowledge once", () => {
  const session = createSession(fixture);

  decideSuggestion(session, "accepted", fixture.acceptedKnowledgePreview);
  decideSuggestion(session, "accepted", fixture.acceptedKnowledgePreview);

  assert.equal(session.suggestion.status, "accepted");
  assert.equal(session.knowledge.length, 1);
  assert.equal(session.knowledge[0].approval, "human_approved");
});

test("rejecting a suggestion creates no knowledge", () => {
  const session = createSession(fixture);

  decideSuggestion(session, "rejected", fixture.acceptedKnowledgePreview);

  assert.equal(session.suggestion.status, "rejected");
  assert.deepEqual(session.knowledge, []);
});

test("a decided suggestion cannot be changed to the opposite decision", () => {
  const session = createSession(fixture);
  decideSuggestion(session, "accepted", fixture.acceptedKnowledgePreview);

  assert.throws(
    () => decideSuggestion(session, "rejected", fixture.acceptedKnowledgePreview),
    /already accepted/,
  );
});
