import assert from "node:assert/strict";
import { test } from "node:test";
import { questionnaireBuiltInTemplates } from "./questionnaireBuiltIns.js";
import { getClientQuestionnairePresentation } from "./questionnaireClientPresentation.js";

function definitionFor(definitionId) {
  const definition = questionnaireBuiltInTemplates.find((item) => item.id === definitionId);
  assert.ok(definition, `Missing definition ${definitionId}`);
  return definition;
}

function pageFor(definitionId, route) {
  const definition = definitionFor(definitionId);
  const page = definition.pages.find((item) => item.route === route);
  assert.ok(page, `Missing page ${route}`);
  return page;
}

test("temporary-work Employment mirrors the two client-facing question groups", () => {
  const definition = definitionFor("built-in-temporary-work-186");
  const page = pageFor(
    "built-in-temporary-work-186",
    "/intake/temporary-work/main-applicant/employment"
  );
  const presentation = getClientQuestionnairePresentation(page, definition);

  assert.equal(presentation.primaryCount, 2);
  assert.deepEqual(
    presentation.primaryEntries.map((entry) => entry.label),
    ["Are you currently Employed in a paid position?", "Employment History"]
  );
  assert.equal(presentation.primaryEntries[0].conditionalGroups.length, 1);
  assert.equal(presentation.primaryEntries[0].conditionalGroups[0].entries.length, 7);
  assert.equal(presentation.primaryEntries[1].kind, "repeater");
  assert.equal(presentation.primaryEntries[1].nestedEntries.length, 13);
  const visaHeld = presentation.primaryEntries[1].nestedEntries.find((entry) =>
    entry.questions.some((question) => question.answerKey === "visa_held")
  );
  assert.deepEqual(visaHeld.conditions, [{ field: "country", op: "equals", value: "Australia" }]);
  assert.deepEqual(
    presentation.storageQuestions.map((question) => question.answerKey),
    [
      "still_working",
      "current_end_date_day",
      "current_end_date_month",
      "current_end_date_year",
    ]
  );
});

test("482 Employment omits the 186-only visa field from its client dialog", () => {
  const definition = definitionFor("built-in-temporary-work-482");
  const page = pageFor(
    definition.id,
    "/intake/temporary-work/main-applicant/employment"
  );
  const presentation = getClientQuestionnairePresentation(page, definition);
  const history = presentation.primaryEntries.find((entry) => entry.kind === "repeater");

  assert.equal(history.nestedEntries.length, 12);
  assert.ok(!history.nestedEntries.some((entry) =>
    entry.questions.some((question) => question.answerKey === "visa_held")
  ));
});

test("partner Employment nests the fields its client page renders", () => {
  const page = pageFor(
    "built-in-partner",
    "/intake/partner/main-applicant/employment"
  );
  const presentation = getClientQuestionnairePresentation(page);

  assert.equal(presentation.primaryCount, 2);
  assert.deepEqual(
    presentation.primaryEntries.map((entry) => entry.label),
    ["Are you currently Employed in a paid position?", "Employment History"]
  );
  assert.equal(presentation.primaryEntries[0].conditionalGroups[0].entries.length, 6);
  assert.deepEqual(presentation.storageQuestions, []);
});

test("client presentation respects hidden keys and treats a date as one question", () => {
  const page = pageFor(
    "built-in-temporary-work-186",
    "/intake/temporary-work/main-applicant/details"
  );
  const presentation = getClientQuestionnairePresentation(page);
  const visibleLabels = presentation.primaryEntries.map((entry) => entry.label);

  assert.ok(visibleLabels.includes("Date of Birth - Day"));
  assert.ok(!presentation.displayedQuestionIds.some((id) =>
    presentation.storageQuestionIds.includes(id)
  ));
});

test("every top-level built-in field is represented or identified as storage-only", () => {
  questionnaireBuiltInTemplates.forEach((definition) => {
    definition.pages.forEach((page) => {
      const presentation = getClientQuestionnairePresentation(page, definition);
      const represented = [
        ...presentation.displayedQuestionIds,
        ...presentation.storageQuestionIds,
      ];
      assert.equal(
        new Set(represented).size,
        page.questions.length,
        `${definition.id}: ${page.route}`
      );
    });
  });
});
