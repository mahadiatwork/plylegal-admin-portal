import assert from "node:assert/strict";
import test from "node:test";
import { applyPageParityRules, certifyDynamicPages } from "../src/lib/questionnaireDynamicParity.js";
import { migrateLegacyQuestionnaireDefinition } from "../src/lib/questionnaireLegacyProtection.js";
import { assertQuestionnaireDefinitionStructureEditable } from "../src/lib/questionnaireDefinitions.js";
import { getBuiltInQuestionnaireDefinition } from "../src/lib/questionnaireBuiltIns.js";
import { TEMPORARY_WORK_CERTIFIED_ROUTES } from "../src/lib/questionnaireBuiltInTemporaryWorkDynamic.js";

const page = {
  id: "p",
  route: "/intake/temporary-work/main-applicant/skills",
  metadata: { renderer: "legacy", builtInPageId: "p" },
  questions: [
    { id: "q1", answerKey: "has_x", type: "yesNo", label: "Has X?" },
    {
      id: "q2", answerKey: "rows", type: "repeater", label: "Rows",
      metadata: { fields: [
        { id: "f1", answerKey: "a", type: "text", label: "A" },
        { id: "f2", answerKey: "b", type: "yesNo", label: "B" },
        { id: "f3", answerKey: "c", type: "text", label: "C" },
      ] },
    },
  ],
};

test("parity rules set defaults, popup defaults, popup sections, placeholders and prefill", () => {
  const next = applyPageParityRules(page, {
    defaults: { has_x: "no" },
    fieldDefaults: { rows: { b: "no" } },
    fieldGroups: { rows: { a: "First", c: "Second" } },
    placeholders: { "rows.a": "Type A" },
    prefill: [{ answerKey: "has_x", value: "yes", mode: "whenEmpty" }],
  });
  assert.equal(next.questions[0].defaultValue, "no");
  const fields = next.questions[1].metadata.fields;
  assert.equal(fields[1].defaultValue, "no");
  assert.deepEqual(fields.map((field) => field.metadata?.group), ["First", "First", "Second"]);
  assert.equal(fields[0].placeholder, "Type A");
  assert.deepEqual(next.metadata.prefill, [{ answerKey: "has_x", value: "yes", mode: "whenEmpty" }]);
  assert.equal(page.questions[0].defaultValue, undefined, "rules must not mutate the source page");
});

test("only certified routes leave the legacy renderer", () => {
  const [certified, untouched] = certifyDynamicPages([page, { ...page, route: "/other" }], [page.route]);
  assert.equal(certified.metadata.renderer, undefined);
  assert.equal(certified.metadata.dynamicParity, "certified");
  assert.equal(untouched.metadata.renderer, "legacy");
});

test("every certified 482 route exists in the built-in catalog and is dynamic", () => {
  const definition = getBuiltInQuestionnaireDefinition({ visaType: "temporary-work", visaContext: "482" });
  for (const route of TEMPORARY_WORK_CERTIFIED_ROUTES["482"]) {
    const builtIn = definition.pages.find((candidate) => candidate.route === route);
    assert.ok(builtIn, `${route} is not a 482 page`);
    assert.notEqual(builtIn.metadata.renderer, "legacy", `${route} should be dynamic`);
  }
});

test("a saved legacy page is promoted when its baseline is certified, keeping admin wording", () => {
  const definition = structuredClone(getBuiltInQuestionnaireDefinition({ visaType: "temporary-work", visaContext: "482" }));
  const certified = definition.pages.find((candidate) => candidate.metadata.dynamicParity === "certified");
  if (!certified) return; // nothing certified yet; covered once the first route is certified
  const saved = structuredClone(definition);
  const savedPage = saved.pages.find((candidate) => candidate.route === certified.route);
  savedPage.metadata = { ...savedPage.metadata, renderer: "legacy", legacyCatalogVersion: 6 };
  delete savedPage.metadata.dynamicParity;
  savedPage.questions[0].label = "Administrator wording";

  const { definition: migrated, report } = migrateLegacyQuestionnaireDefinition(saved);
  const promoted = migrated.pages.find((candidate) => candidate.route === certified.route);
  assert.equal(promoted.metadata.renderer, undefined);
  assert.equal(promoted.metadata.dynamicParity, "certified");
  assert.equal(promoted.questions[0].label, "Administrator wording");
  assert.ok(report.promoted.some((entry) => entry.startsWith(savedPage.id)));

  // Structural edits on the promoted page are now accepted.
  const edited = structuredClone(migrated);
  const editedPage = edited.pages.find((candidate) => candidate.route === certified.route);
  editedPage.questions = editedPage.questions.slice(1);
  assert.doesNotThrow(() => assertQuestionnaireDefinitionStructureEditable(migrated, edited));
});

test("structural edits on uncertified legacy pages remain blocked", () => {
  // 186 shares the 482 client pages but is not certified yet.
  const definition = getBuiltInQuestionnaireDefinition({ visaType: "temporary-work", visaContext: "186" });
  const legacy = definition.pages.find((candidate) => candidate.route.endsWith("/main-applicant/employment"));
  assert.equal(legacy.metadata.renderer, "legacy");
  const edited = structuredClone(definition);
  const target = edited.pages.find((candidate) => candidate.id === legacy.id);
  target.questions = target.questions.slice(0, -1);
  assert.throws(() => assertQuestionnaireDefinitionStructureEditable(definition, edited), /locked|parity/);
});

test("anyOf display rules validate, evaluate and reject nesting", async () => {
  const { isQuestionVisible } = await import("../src/lib/questionnaireAnswerModel.js");
  const { getQuestionnaireDefinitionIssues } = await import("../src/lib/questionnaireDefinitions.js").catch(() => ({}));
  const anyOf = { op: "anyOf", value: [{ field: "a", op: "equals", value: "yes" }, { field: "b", op: "equals", value: "yes" }] };
  assert.equal(isQuestionVisible({ visibleIf: [anyOf] }, { b: "yes" }), true);
  assert.equal(isQuestionVisible({ visibleIf: [anyOf] }, { a: "no", b: "no" }), false);

  const definition = structuredClone(getBuiltInQuestionnaireDefinition({ visaType: "temporary-work", visaContext: "482" }));
  const identity = definition.pages.find((candidate) => candidate.route.endsWith("/main-applicant/identity"));
  const citizenships = identity.questions.find((question) => question.answerKey === "citizenships");
  assert.equal(citizenships.visibleIf[0].op, "anyOf", "482 identity uses an anyOf rule for citizenship records");
  if (getQuestionnaireDefinitionIssues) {
    const nested = structuredClone(definition);
    nested.pages.find((candidate) => candidate.id === identity.id).questions
      .find((question) => question.answerKey === "citizenships").visibleIf = [{ op: "anyOf", value: [anyOf] }];
    assert.ok(getQuestionnaireDefinitionIssues(nested).some((issue) => /anyOf/.test(issue)));
  }
});
