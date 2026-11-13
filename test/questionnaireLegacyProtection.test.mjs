import assert from "node:assert/strict";
import { test } from "node:test";

import {
  QUESTIONNAIRE_LEGACY_CATALOG_VERSION,
  questionnaireBuiltInTemplates,
} from "../src/lib/questionnaireBuiltIns.js";
import { getQuestionnaireDefinitionIssues } from "../src/lib/questionnaireDefinitions.js";
import {
  getLegacyQuestionnairePublishIssues,
  hydrateLegacyQuestionnaireDefinition,
  migrateLegacyQuestionnaireDefinition,
} from "../src/lib/questionnaireLegacyProtection.js";

function legacyPageWithChoices() {
  const page = questionnaireBuiltInTemplates
    .flatMap((definition) => definition.pages)
    .find((candidate) =>
      candidate.metadata?.renderer === "legacy" &&
      candidate.questions.some((question) => Array.isArray(question.options) && question.options.length)
    );
  assert.ok(page, "expected a shipped legacy page with answer choices");
  return structuredClone(page);
}

function activeDefinition(page) {
  return {
    id: "questionnaire-under-test",
    title: "Questionnaire under test",
    visaType: "temporary-work",
    visaContexts: ["482"],
    version: "1.0.0",
    status: "active",
    schemaVersion: 1,
    revision: 0,
    pages: [page],
  };
}

test("legacy publish contract ignores CRM mappings so they can be stored on built-in pages", () => {
  const page = legacyPageWithChoices();
  const question = page.questions.find((candidate) => candidate.answerKey === "family_name") || page.questions[0];
  question.metadata = {
    ...question.metadata,
    crm: question.type === "text"
      ? {
          mode: "field",
          target: "main_contact",
          module: "Contacts",
          fieldApiName: "Last_Name",
          transform: "text",
          clearPolicy: "preserve_when_empty",
        }
      : { mode: "portal_only" },
  };
  assert.deepEqual(getLegacyQuestionnairePublishIssues(activeDefinition(page)), []);
});

test("legacy protection still rejects structural changes while a page uses its legacy renderer", () => {
  const page = legacyPageWithChoices();
  const question = page.questions.find((candidate) => candidate.options?.length);
  question.options.push({ value: "new_choice", label: "New choice" });

  const issues = getLegacyQuestionnairePublishIssues(activeDefinition(page));

  assert.equal(issues.length, 1);
  assert.match(issues[0], /answer structure is preserved/i);
});

test("legacy protection rejects candidate-declared promotion without server certification", () => {
  const page = legacyPageWithChoices();
  const question = page.questions.find((candidate) => candidate.options?.length);
  question.options.push({ value: "new_choice", label: "New choice" });
  question.visibleIf = [{ field: "a_previous_answer", op: "equals", value: "yes" }];
  page.metadata = { ...page.metadata, renderer: "dynamic" };

  assert.ok(getLegacyQuestionnairePublishIssues(activeDefinition(page)).some((issue) => /not been certified/i.test(issue)));
});

test("a promoted built-in page with edited choices and a display rule remains structurally valid but unpublished", () => {
  const definition = structuredClone(questionnaireBuiltInTemplates[0]);
  const page = definition.pages.find((candidate) =>
    candidate.route.endsWith("/main-applicant/details")
  );
  const gender = page.questions.find((question) => question.answerKey === "gender");
  const marriageDate = page.questions.find(
    (question) => question.answerKey === "marital_status_date"
  );

  page.metadata = { ...page.metadata, renderer: "dynamic" };
  gender.options.push({ value: "self_described", label: "Self described" });
  marriageDate.visibleIf[0] = {
    field: "marital_status",
    op: "equals",
    value: "Married",
  };

  assert.ok(getLegacyQuestionnairePublishIssues(definition).some((issue) => /not been certified/i.test(issue)));
  assert.deepEqual(getQuestionnaireDefinitionIssues(definition), []);
});

test("legacy pages continue to allow visible wording and choice-label edits", () => {
  const page = legacyPageWithChoices();
  const question = page.questions.find((candidate) => candidate.options?.length);
  page.title = "Reworded page title";
  question.label = "Reworded question?";
  question.options[0].label = "Reworded choice";

  assert.deepEqual(getLegacyQuestionnairePublishIssues(activeDefinition(page)), []);
});

function visitQuestions(questions, visit) {
  for (const question of questions || []) {
    visit(question);
    visitQuestions(question.followUps, visit);
    visitQuestions(question.metadata?.fields, visit);
  }
}

function firstRequiredQuestion(page) {
  let match = null;
  visitQuestions(page.questions, (question) => {
    if (!match && question.required === true) match = question;
  });
  return match;
}

function questionById(page, id) {
  let match = null;
  visitQuestions(page.questions, (question) => {
    if (question.id === id) match = question;
  });
  return match;
}

test("pre-migration saved snapshots receive current requirements but cannot self-certify promotion", () => {
  const definition = structuredClone(questionnaireBuiltInTemplates[0]);
  const requiredPages = definition.pages.filter((page) => firstRequiredQuestion(page));
  const migratedPageIds = new Set(
    definition.pages
      .filter((page) => page.metadata?.renderer === "legacy")
      .map((page) => page.id),
  );
  assert.ok(requiredPages.length > 1, "the built-in should contain migrated requirements on several pages");

  for (const page of definition.pages) {
    delete page.metadata.legacyCatalogVersion;
    visitQuestions(page.questions, (question) => {
      if (question.required === true) question.required = false;
    });
  }
  const promotedPage = requiredPages[0];
  promotedPage.metadata.renderer = "dynamic";
  migratedPageIds.add(promotedPage.id);
  assert.equal(firstRequiredQuestion(promotedPage), null, "the simulated old page should contain no requirements");

  const upgraded = hydrateLegacyQuestionnaireDefinition(definition);
  const upgradedPromotedPage = upgraded.pages.find((page) => page.id === promotedPage.id);

  assert.equal(
    upgraded.pages
      .filter((page) => migratedPageIds.has(page.id))
      .every((page) =>
        page.metadata.legacyCatalogVersion === QUESTIONNAIRE_LEGACY_CATALOG_VERSION
      ),
    true,
  );
  assert.ok(
    firstRequiredQuestion(upgradedPromotedPage),
    "the page promoted during the migration save must receive current dynamic validation",
  );
  assert.ok(getLegacyQuestionnairePublishIssues(upgraded).some((issue) => /not been certified/i.test(issue)));
  assert.deepEqual(getQuestionnaireDefinitionIssues(upgraded), []);
});

test("required-contract compatibility does not permit unrelated legacy structure changes", () => {
  const definition = structuredClone(questionnaireBuiltInTemplates[0]);
  const page = definition.pages.find((candidate) => firstRequiredQuestion(candidate));
  const originalAnswerKey = page.questions[0].answerKey;
  delete page.metadata.legacyCatalogVersion;
  firstRequiredQuestion(page).required = false;
  page.questions[0].answerKey = "tampered_answer_key";

  const upgraded = hydrateLegacyQuestionnaireDefinition(definition);
  const upgradedPage = upgraded.pages.find((candidate) => candidate.id === page.id);

  assert.equal(upgradedPage.questions[0].answerKey, originalAnswerKey);
  assert.deepEqual(getLegacyQuestionnairePublishIssues(upgraded), []);
});

test("current snapshots cannot use the compatibility path to remove a requirement", () => {
  const definition = structuredClone(questionnaireBuiltInTemplates[0]);
  const page = definition.pages.find((candidate) => firstRequiredQuestion(candidate));
  const required = firstRequiredQuestion(page);
  const requiredId = required.id;
  required.required = false;

  const upgraded = hydrateLegacyQuestionnaireDefinition(definition);
  const upgradedPage = upgraded.pages.find((candidate) => candidate.id === page.id);

  assert.equal(questionById(upgradedPage, requiredId).required, false);
  assert.ok(getLegacyQuestionnairePublishIssues(upgraded).length > 0);
});

test("old saved legacy pages gain current choices while retaining visible copy edits", () => {
  const definition = structuredClone(questionnaireBuiltInTemplates[0]);
  const page = definition.pages.find((candidate) =>
    candidate.route.endsWith("/main-applicant/details")
  );
  const gender = page.questions.find((question) => question.answerKey === "gender");
  const maritalStatus = page.questions.find(
    (question) => question.answerKey === "marital_status"
  );
  const countryOfBirth = page.questions.find(
    (question) => question.answerKey === "country_of_birth"
  );
  const citizenships = page.questions.find(
    (question) => question.answerKey === "citizenships"
  );
  const editedOption = maritalStatus.options[0];

  delete page.metadata.legacyCatalogVersion;
  page.title = "Personal profile";
  page.introBlocks[0].text = "Please check these personal details.";
  gender.label = "Gender identity";
  gender.type = "text";
  delete gender.options;
  delete gender.metadata.originalOptions;
  editedOption.label = "Never wed";
  countryOfBirth.placeholder = "Select a country";
  countryOfBirth.required = false;
  citizenships.description = "Add every other citizenship held.";

  const hydrated = hydrateLegacyQuestionnaireDefinition(definition);
  const hydratedPage = hydrated.pages.find((candidate) => candidate.id === page.id);
  const hydratedGender = questionById(hydratedPage, gender.id);
  const hydratedMaritalStatus = questionById(hydratedPage, maritalStatus.id);
  const hydratedCountry = questionById(hydratedPage, countryOfBirth.id);
  const hydratedCitizenships = questionById(hydratedPage, citizenships.id);

  assert.equal(hydratedPage.metadata.legacyCatalogVersion, QUESTIONNAIRE_LEGACY_CATALOG_VERSION);
  assert.equal(hydratedPage.title, "Personal profile");
  assert.equal(hydratedPage.introBlocks[0].text, "Please check these personal details.");
  assert.equal(hydratedGender.type, "radio");
  assert.deepEqual(hydratedGender.options.map((option) => option.label), ["Male", "Female", "Other"]);
  assert.equal(hydratedGender.label, "Gender identity");
  assert.equal(
    hydratedMaritalStatus.options.find((option) => option.value === editedOption.value).label,
    "Never wed",
  );
  assert.equal(hydratedCountry.placeholder, "Select a country");
  assert.equal(hydratedCountry.required, true);
  assert.equal(hydratedCitizenships.description, "Add every other citizenship held.");
  assert.deepEqual(getLegacyQuestionnairePublishIssues(hydrated), []);
  assert.deepEqual(getQuestionnaireDefinitionIssues(hydrated), []);
});

test("version-3 migration advances untouched copy without losing presentation edits or promoted pages", () => {
  const definition = structuredClone(questionnaireBuiltInTemplates.find((candidate) => candidate.id === "built-in-temporary-work-482"));
  definition.pages.forEach((page) => { page.metadata.legacyCatalogVersion = 3; });
  const health = definition.pages.find((page) => page.route.endsWith("/all-applicants/health"));
  const hospital = questionById(health, "temporary-work-all-applicants-health-hospital_details");
  hospital.label = "Has any applicant undertaken a health examination for an Australian visa in the past 12 months?";
  hospital.metadata.originalLabel = hospital.label;
  hospital.metadata.presentation.addLabel = "Add hospital visit";
  hospital.metadata.originalPresentation.addLabel = "Add";
  hospital.metadata.customAuditTag = "preserve-me";

  const promoted = definition.pages.find((page) => page.route.endsWith("/main-applicant/education"));
  promoted.metadata.renderer = "dynamic";
  promoted.questions.push({
    id: "custom-promoted-question",
    answerKey: "custom_promoted_answer",
    label: "Custom promoted question",
    type: "text",
    required: false,
  });

  const hydrated = hydrateLegacyQuestionnaireDefinition(definition);
  const hydratedHospital = questionById(
    hydrated.pages.find((page) => page.id === health.id),
    hospital.id,
  );
  const hydratedPromoted = hydrated.pages.find((page) => page.id === promoted.id);

  assert.equal(hydratedHospital.label, "Hospital / health care facility details");
  assert.equal(hydratedHospital.metadata.presentation.addLabel, "Add hospital visit");
  assert.equal(hydratedHospital.metadata.presentation.addDialogTitle, "Hospital / health care facility details");
  assert.equal(hydratedHospital.metadata.customAuditTag, "preserve-me");
  assert.ok(questionById(hydratedPromoted, "custom-promoted-question"));
  assert.deepEqual(hydrateLegacyQuestionnaireDefinition(hydrated), hydrated);
});

test("catalog migration preserves unknown nodes and recorded deletions with an idempotent report", () => {
  const definition = structuredClone(questionnaireBuiltInTemplates[0]);
  definition.status = "draft";
  definition.revision = 37;
  definition.pages.forEach((page) => { page.metadata.legacyCatalogVersion = QUESTIONNAIRE_LEGACY_CATALOG_VERSION; });
  const page = definition.pages.find((candidate) => candidate.route.endsWith("/main-applicant/details"));
  const oldQuestionIds = [];
  visitQuestions(page.questions, (question) => oldQuestionIds.push(question.id));
  page.metadata.legacyCatalogVersion = QUESTIONNAIRE_LEGACY_CATALOG_VERSION - 1;
  page.metadata.legacyCatalogBaseline = {
    version: QUESTIONNAIRE_LEGACY_CATALOG_VERSION - 1,
    questionIds: oldQuestionIds,
    introBlockCount: page.introBlocks.length,
    presentationSectionCounts: {},
  };

  const deleted = page.questions.pop();
  const gender = page.questions.find((question) => question.answerKey === "gender");
  gender.options[0].externalCode = "legacy-male";
  gender.metadata.presentation = { customChrome: "retain" };
  page.questions.push({
    id: "custom-saved-question",
    answerKey: "custom_saved_answer",
    label: "Custom saved question",
    type: "text",
    required: false,
    customField: "retain",
  });
  page.introBlocks.push({ type: "paragraph", text: "Administrator-added note", customBlock: true });

  const migration = migrateLegacyQuestionnaireDefinition(definition);
  const migratedPage = migration.definition.pages.find((candidate) => candidate.id === page.id);
  assert.equal(migration.definition.status, "draft");
  assert.equal(migration.definition.revision, 37);
  assert.equal(questionById(migratedPage, deleted.id), null);
  assert.equal(questionById(migratedPage, "custom-saved-question").customField, "retain");
  assert.equal(questionById(migratedPage, gender.id).options[0].externalCode, "legacy-male");
  assert.equal(questionById(migratedPage, gender.id).metadata.presentation.customChrome, "retain");
  assert.equal(migratedPage.introBlocks.at(-1).text, "Administrator-added note");
  assert.ok(migration.report.preserved.some((entry) => entry.includes(`deletion of ${deleted.id}`)));
  assert.ok(migration.report.preserved.some((entry) => entry.includes("custom-saved-question")));

  const repeated = migrateLegacyQuestionnaireDefinition(migration.definition);
  assert.strictEqual(repeated.definition, migration.definition);
  assert.deepEqual(repeated.report, { added: [], preserved: [], conflicts: [], unresolved: [] });
});

test("catalog migration advances native dynamic pages even when every legacy page is current", () => {
  const definition = structuredClone(questionnaireBuiltInTemplates[0]);
  definition.pages.forEach((page) => { page.metadata.legacyCatalogVersion = QUESTIONNAIRE_LEGACY_CATALOG_VERSION; });
  const character = definition.pages.find((page) => page.metadata?.renderer !== "legacy");
  character.metadata.legacyCatalogVersion = QUESTIONNAIRE_LEGACY_CATALOG_VERSION - 1;

  const migration = migrateLegacyQuestionnaireDefinition(definition);
  const migrated = migration.definition.pages.find((page) => page.id === character.id);
  assert.equal(migrated.metadata.legacyCatalogVersion, QUESTIONNAIRE_LEGACY_CATALOG_VERSION);
  assert.ok(migration.report.preserved.some((entry) => entry.includes("preserved dynamic structure")));
});
