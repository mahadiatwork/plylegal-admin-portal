import assert from "node:assert/strict";
import test from "node:test";
import { createQuestionnaireDraft, createQuestionnaireDraftForMatterType } from "./questionnaireDrafts.js";
import { normalizeQuestionnaireDefinition } from "./questionnaireDefinitions.js";
import { questionnaireBuiltInTemplates } from "./questionnaireBuiltIns.js";
import { getLegacyQuestionnairePublishIssues } from "./questionnaireLegacyProtection.js";
import { temporaryWork482Definition } from "./questionnaireStarterTemplates.js";
import { getRegisteredQuestionnaireRoutes } from "./routes.js";

test("draft copies preserve answers and leave the published questionnaire untouched", () => {
  const published = {
    ...structuredClone(temporaryWork482Definition),
    revision: 7,
    publishedAt: "2026-09-16T00:00:00Z",
    publishedBy: "admin",
    createdBy: "admin",
  };
  const draft = createQuestionnaireDraft(published, "questionnaire-new-draft");

  assert.equal(draft.id, "questionnaire-new-draft");
  assert.equal(draft.status, "draft");
  assert.equal(draft.revision, 0);
  assert.deepEqual(draft.visaContexts, ["482"]);
  assert.deepEqual(draft.pages, published.pages);
  assert.equal(draft.publishedAt, undefined);
  assert.equal(draft.publishedBy, undefined);
  assert.equal(draft.createdBy, undefined);

  draft.pages[0].questions[0].label = "Revised wording";
  assert.notEqual(draft.pages[0].questions[0].label, published.pages[0].questions[0].label);
  assert.equal(published.status, "active");
  assert.equal(published.revision, 7);
});

test("482 Character starter validates and only targets a registered client page", () => {
  const draft = createQuestionnaireDraft(temporaryWork482Definition, "starter-draft");
  const normalized = normalizeQuestionnaireDefinition(draft);
  const registeredRoutes = new Set(
    getRegisteredQuestionnaireRoutes(normalized.visaType, normalized.visaContexts)
      .map((route) => route.href)
  );
  assert.equal(normalized.pages.length, 1);
  assert.equal(normalized.pages[0].questions.length, 18);
  assert.equal(normalized.pages[0].sectionKey, "temporary_work_character");
  assert.ok(registeredRoutes.has(normalized.pages[0].route));
  assert.ok(normalized.pages[0].questions.every((question) => question.followUps.length === 2));
});

test("copying between 482 and 186 keeps compatible questions and uses target-specific sections", () => {
  for (const [from, to, expectedPages] of [["482", "186", 31], ["186", "482", 29]]) {
    const source = questionnaireBuiltInTemplates.find((item) =>
      item.visaType === "temporary-work" && item.visaContexts.includes(from)
    );
    const sourceSnapshot = structuredClone(source);
    const draft = createQuestionnaireDraftForMatterType(source, `copy-${from}-to-${to}`, {
      visaType: "temporary-work",
      visaContexts: [to],
    });

    assert.equal(draft.status, "draft");
    assert.deepEqual(draft.visaContexts, [to]);
    assert.equal(draft.pages.length, expectedPages);
    assert.deepEqual(draft.pages.find((page) => page.route.endsWith("/main-applicant/details")),
      source.pages.find((page) => page.route.endsWith("/main-applicant/details")));
    assert.deepEqual(getLegacyQuestionnairePublishIssues({ ...draft, status: "active" }), []);
    assert.deepEqual(source, sourceSnapshot, "copying must leave the source questionnaire untouched");
  }
});

test("copying into an unrelated visa family is rejected", () => {
  const source = questionnaireBuiltInTemplates.find((item) => item.visaContexts?.includes("482"));
  assert.throws(() => createQuestionnaireDraftForMatterType(source, "copy", {
    visaType: "partner",
    visaContexts: [],
  }), /same visa family/);
});
