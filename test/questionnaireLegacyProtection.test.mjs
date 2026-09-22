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

test("legacy protection still rejects structural changes while a page uses its legacy renderer", () => {
  const page = legacyPageWithChoices();
  const question = page.questions.find((candidate) => candidate.options?.length);
  question.options.push({ value: "new_choice", label: "New choice" });

  const issues = getLegacyQuestionnairePublishIssues(activeDefinition(page));

  assert.equal(issues.length, 1);
  assert.match(issues[0], /answer structure is preserved/i);
});

test("legacy protection allows structural changes after the page is promoted to the dynamic renderer", () => {
  const page = legacyPageWithChoices();
  const question = page.questions.find((candidate) => candidate.options?.length);
  question.options.push({ value: "new_choice", label: "New choice" });
  question.visibleIf = [{ field: "a_previous_answer", op: "equals", value: "yes" }];
  page.metadata = { ...page.metadata, renderer: "dynamic" };

  assert.deepEqual(getLegacyQuestionnairePublishIssues(activeDefinition(page)), []);
});

test("a promoted built-in page with edited choices and a display rule remains publishable", () => {
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

  assert.deepEqual(getLegacyQuestionnairePublishIssues(definition), []);
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

test("pre-migration saved snapshots receive current requirements before a page is promoted", () => {
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
  assert.deepEqual(getLegacyQuestionnairePublishIssues(upgraded), []);
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
