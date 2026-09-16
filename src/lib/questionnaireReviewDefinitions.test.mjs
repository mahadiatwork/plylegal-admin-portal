import test from "node:test";
import assert from "node:assert/strict";
import {
  inferQuestionnaireAudience,
  loadQuestionnaireReviewDefinition,
  mergeQuestionnaireReviewPages,
  selectCurrentQuestionnaireDefinition,
} from "./questionnaireReviewDefinitions.js";

test("resolves 186 matter when legacy application has no visa type code", () => {
  assert.deepEqual(inferQuestionnaireAudience({ type: "Employer Nomination Scheme (Subclass 186)" }), {
    visaType: "temporary-work", visaContext: "186",
  });
});

test("resolves a numeric legacy protection visa code", () => {
  assert.deepEqual(inferQuestionnaireAudience({ visaTypeCode: 866 }), {
    visaType: "protection", visaContext: undefined,
  });
});

test("selects the same specific current active questionnaire as the client", () => {
  const definitions = [
    { id: "generic", status: "active", visaType: "temporary-work", updatedAt: "2026-09-16" },
    { id: "186", status: "active", visaType: "temporary-work", visaContext: "186" },
    { id: "old", status: "active", visaType: "temporary-work", visaContext: "482", updatedAt: "2026-09-10" },
    { id: "new", status: "active", visaType: "temporary-work", visaContext: "482", updatedAt: "2026-09-15" },
    { id: "draft", status: "draft", visaType: "temporary-work", visaContext: "482", updatedAt: "2026-09-16" },
  ];
  assert.equal(selectCurrentQuestionnaireDefinition(definitions, { visaType: "temporary-work", visaContext: "482" }).id, "new");
});

test("retains built-in questions outside a partially managed definition", () => {
  const builtIn = { pages: [{ route: "details", title: "Details" }, { route: "character", title: "Original", metadata: { renderer: "legacy" } }] };
  const remote = { id: "published", pages: [{ route: "character", title: "Edited" }] };
  const merged = mergeQuestionnaireReviewPages(builtIn, remote);
  assert.equal(merged.pages.length, 2);
  assert.equal(merged.pages.find((page) => page.route === "character").title, "Edited");
  assert.equal(merged.pages.find((page) => page.route === "character").metadata.navigationTitle, "Original");
  assert.equal(merged.pages.find((page) => page.route === "character").metadata.renderer, undefined);
});

test("database outage preserves the full built-in definition", async () => {
  const fallback = { pages: [{ route: "details", questions: [{ label: "Family Name" }] }] };
  const db = { collection() { throw new Error("offline"); } };
  assert.deepEqual(await loadQuestionnaireReviewDefinition(db, {}, fallback), { definition: fallback, source: "built-in" });
});

test("a stalled template read returns the built-in questionnaire within its deadline", async () => {
  const fallback = { pages: [{ route: "details" }] };
  const db = { collection: () => ({ where: () => ({ get: () => new Promise(() => {}) }) }) };
  assert.deepEqual(await loadQuestionnaireReviewDefinition(db, {}, fallback, { timeoutMs: 5 }), {
    definition: fallback, source: "built-in",
  });
});

test("malformed published template falls back without losing saved-answer display", async () => {
  const fallback = { pages: [{ route: "details" }] };
  const doc = { id: "broken", data: () => ({ status: "active", visaType: "partner", pages: "invalid" }) };
  const db = { collection: () => ({ where: () => ({ get: async () => ({ docs: [doc] }) }) }) };
  assert.deepEqual(await loadQuestionnaireReviewDefinition(db, { visaType: "partner" }, fallback), { definition: fallback, source: "built-in" });
});
