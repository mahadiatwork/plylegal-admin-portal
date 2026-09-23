import assert from "node:assert/strict";
import test from "node:test";
import {
  buildQuestionnairePrintGroups,
  buildQuestionnairePrintSections,
} from "./questionnairePrintSections.js";

test("print sections pair saved answers with definition labels across a full page", () => {
  const definition = { visaType: "temporary-work", pages: [{
    id: "details", route: "/intake/temporary-work/main-applicant/details",
    title: "Personal details", sectionKey: "details", metadata: { profileRole: "main_applicant" },
    questions: [
      { id: "name", answerKey: "given_names", label: "What are your given names?", type: "text" },
      { id: "citizen", answerKey: "citizen", label: "Are you a citizen?", type: "yesNo" },
      { id: "birth", answerKey: "birth", label: "Date of birth", type: "dateParts" },
      { id: "jobs", answerKey: "jobs", label: "Employment history", type: "repeater", metadata: { fields: [
        { id: "employer", answerKey: "employer", label: "Employer name", type: "text" },
      ] } },
      { id: "secret", answerKey: "secret", label: "Hidden question", type: "text", visibleIf: [{ field: "citizen", op: "equals", value: "no" }] },
    ],
  }] };
  const questionnaire = {
    profiles: [{ id: "main", relationship: "main_applicant", given_names: "Jane", family_name: "Doe" }],
    profiles_data: { main: { details: {
      given_names: "Jane", citizen: "yes", birth_day: "4", birth_month: "2", birth_year: "1990",
      jobs: [{ employer: "Acme" }], secret: "must stay hidden",
    } } },
  };
  const sections = buildQuestionnairePrintSections(questionnaire, definition);
  const details = sections.find((section) => section.title.includes("Personal details"));
  assert.ok(details);
  assert.deepEqual(details.answers, [
    { question: "What are your given names?", answer: "Jane" },
    { question: "Are you a citizen?", answer: "Yes" },
    { question: "Date of birth", answer: "4 February 1990" },
    { question: "Employment history — Item 1 — Employer name", answer: "Acme" },
    { question: "Family name", answer: "Doe" },
  ]);
  assert.equal(sections.some((section) => section.answers.some((answer) => answer.answer.includes("must stay hidden"))), false);
});

test("print sections include every saved raw subsection and preserve negative answers", () => {
  const sections = buildQuestionnairePrintSections({
    profiles: [{ id: "main", relationship: "main_applicant", given_names: "Jane" }],
    profiles_data: { main: { details: { given_names: "Jane", has_passport: false }, employment: { employer: "Acme" } } },
  });
  assert.equal(sections.length, 2);
  assert.equal(sections[0].title, "Jane (Main Applicant) — Details");
  assert.deepEqual(sections[0].answers, [
    { question: "Given names", answer: "Jane" },
    { question: "Has passport", answer: "No" },
  ]);
  assert.deepEqual(sections[1].answers, [{ question: "Employer", answer: "Acme" }]);
});

test("raw print view includes an applicant saved only in the profile roster", () => {
  const sections = buildQuestionnairePrintSections({
    profiles: [{ id: "main", relationship: "main_applicant", given_names: "Jane", family_name: "Doe" }],
  });
  assert.deepEqual(sections, [{
    key: "profile:main.roster", title: "Jane Doe — Details",
    answers: [
      { question: "Given names", answer: "Jane" },
      { question: "Family name", answer: "Doe" },
    ],
  }]);
});

test("PDF groups preserve overview, applicant, and subsection hierarchy", () => {
  const definition = { visaType: "protection", pages: [{
    id: "details",
    route: "/intake/protection/main-applicant/details",
    title: "Details",
    sectionKey: "details",
    metadata: { profileRole: "main_applicant" },
    questions: [{ id: "name", answerKey: "given_names", label: "Given names", type: "text" }],
  }] };
  const questionnaire = {
    started: true,
    profiles: [{ id: "main", relationship: "main_applicant", given_names: "Jane", family_name: "Doe" }],
    profiles_data: { main: { details: { given_names: "Jane" } } },
  };

  const groups = buildQuestionnairePrintGroups(questionnaire, definition);
  assert.equal(groups[0].key, "getting-started");
  assert.equal(groups[0].sections[0].title, "Getting Started");
  assert.equal(groups[2].title, "Jane Doe");
  assert.equal(groups[2].type, "applicant");
  assert.deepEqual(groups[2].sections[0].answers, [
    { question: "Given names", answer: "Jane" },
    { question: "Family name", answer: "Doe" },
  ]);
});

test("defined choices keep their labels before boolean formatting and text values stay literal", () => {
  const definition = { visaType: "temporary-work", pages: [{
    id: "choices", route: "/intake/temporary-work/main-applicant/choices", title: "Choices",
    sectionKey: "choices", metadata: { profileRole: "main_applicant" }, questions: [
      { id: "decision", answerKey: "decision", label: "Decision", type: "select", options: [{ value: "yes", label: "Accepted" }] },
      { id: "consent", answerKey: "consent", label: "Consent", type: "yesNo" },
      { id: "literal", answerKey: "literal", label: "Literal", type: "text" },
      { id: "flag", answerKey: "flag", label: "Flag", type: "checkbox" },
    ],
  }] };
  const sections = buildQuestionnairePrintSections({
    profiles: [{ id: "main", relationship: "main_applicant" }],
    profiles_data: { main: { choices: { decision: "yes", consent: "no", literal: "false", flag: false } } },
  }, definition);

  assert.deepEqual(sections.find((section) => section.key === "profile:main:choices").answers, [
    { question: "Decision", answer: "Accepted" },
    { question: "Consent", answer: "No" },
    { question: "Literal", answer: "false" },
    { question: "Flag", answer: "No" },
  ]);
});

test("definition print includes unmapped profile and root sections", () => {
  const definition = { visaType: "temporary-work", pages: [{
    id: "details", route: "/intake/temporary-work/main-applicant/details", title: "Details",
    sectionKey: "details", metadata: { profileRole: "main_applicant" },
    questions: [{ id: "name", answerKey: "given_names", label: "Given names", type: "text" }],
  }] };
  const questionnaire = {
    profiles: [{ id: "main", relationship: "main_applicant", given_names: "Alex" }],
    profiles_data: { main: { details: { given_names: "Alex" }, archived_notes: { reference: "Keep me" } } },
    legacy_root: { recorded_answer: "Keep this too" },
  };

  const sections = buildQuestionnairePrintSections(questionnaire, definition);
  assert.deepEqual(sections.find((section) => section.key === "profile:main:saved:archived_notes")?.answers, [
    { question: "Reference", answer: "Keep me" },
  ]);
  assert.deepEqual(sections.find((section) => section.key === "saved-root:legacy_root")?.answers, [
    { question: "Recorded answer", answer: "Keep this too" },
  ]);
  const groups = buildQuestionnairePrintGroups(questionnaire, definition);
  assert.ok(groups.find((group) => group.key === "profile:main").sections.some((section) => section.title === "Archived notes"));
  assert.ok(groups.find((group) => group.key === "saved-root:legacy_root"));
});

test("definition print retains unmapped non-migrating stored sections", () => {
  const definition = { visaType: "temporary-work", pages: [{
    id: "member-details", route: "/intake/temporary-work/non-migrating/member-profile/details",
    title: "Details", sectionKey: "details", metadata: { profileRole: "non_migrating" },
    questions: [{ id: "relationship", answerKey: "relationship", label: "Relationship", type: "text" }],
  }] };
  const questionnaire = {
    profiles: [{ id: "main", relationship: "main_applicant" }],
    non_migrating_members: [{ id: "parent", relationship: "parent" }],
    non_migrating_data: { parent: {
      details: { relationship: "parent" },
      archived_notes: { reference: "Keep member note" },
    } },
  };

  const groups = buildQuestionnairePrintGroups(questionnaire, definition);
  const member = groups.find((group) => group.key === "nonMigrating:parent");
  assert.ok(member);
  assert.deepEqual(member.sections.find((section) => section.title === "Archived notes")?.answers, [
    { question: "Reference", answer: "Keep member note" },
  ]);
});

test("PDF headings use the same edited-title rule as the review pane", () => {
  const questionnaire = {
    profiles: [{ id: "main", relationship: "main_applicant" }],
    profiles_data: { main: { identity: { answer: "Saved" }, details: { answer: "Saved" } } },
  };
  const definition = { visaType: "temporary-work", pages: [
    {
      id: "identity", route: "/intake/temporary-work/main-applicant/identity",
      title: "Updated identity heading", sectionKey: "identity",
      metadata: { profileRole: "main_applicant", navigationTitle: "Identity", originalDisplayTitle: "Identity" },
      questions: [{ id: "identity-answer", answerKey: "answer", label: "Answer", type: "text" }],
    },
    {
      id: "details", route: "/intake/temporary-work/main-applicant/details",
      title: "Details — Main Applicant", sectionKey: "details",
      metadata: { profileRole: "main_applicant", renderer: "legacy", navigationTitle: "Details", originalDisplayTitle: "Details — Main Applicant", originalTitle: "Details" },
      questions: [{ id: "details-answer", answerKey: "answer", label: "Answer", type: "text" }],
    },
  ] };
  const group = buildQuestionnairePrintGroups(questionnaire, definition).find((candidate) => candidate.key === "profile:main");

  assert.deepEqual(group.sections.map((section) => section.title), ["Updated identity heading", "Details"]);
});

test("pages sharing storage print unmatched fields once without stealing each other's answers", () => {
  const shared = { storagePath: "shared_answers" };
  const definition = { visaType: "temporary-work", pages: [
    { id: "one", route: "/intake/temporary-work/all-applicants/one", title: "One", sectionKey: "missing_one", metadata: shared, questions: [{ id: "first", answerKey: "first", label: "First", type: "text" }] },
    { id: "two", route: "/intake/temporary-work/all-applicants/two", title: "Two", sectionKey: "missing_two", metadata: shared, questions: [{ id: "second", answerKey: "second", label: "Second", type: "text" }] },
  ] };
  const sections = buildQuestionnairePrintSections({ shared_answers: { first: "A", second: "B", unmatched: "C" } }, definition);
  const allAnswers = sections.flatMap((section) => section.answers);

  assert.equal(allAnswers.filter((answer) => answer.question === "First").length, 1);
  assert.equal(allAnswers.filter((answer) => answer.question === "Second").length, 1);
  assert.equal(allAnswers.filter((answer) => answer.question === "Unmatched" && answer.answer === "C").length, 1);
});

test("raw groups use stable identities for duplicate names and names containing separators", () => {
  const questionnaire = {
    profiles: [
      { id: "one", relationship: "child", given_names: "Same", family_name: "Name" },
      { id: "two", relationship: "child", given_names: "Same", family_name: "Name" },
      { id: "three", relationship: "child", given_names: "Anne — Marie", family_name: "Name" },
    ],
    profiles_data: {
      one: { details: { note: "First" } },
      two: { details: { note: "Second" } },
      three: { details: { note: "Third" } },
    },
  };
  const groups = buildQuestionnairePrintGroups(questionnaire);

  assert.deepEqual(groups.filter((group) => group.type === "applicant").map((group) => group.key), ["profile:one", "profile:two", "profile:three"]);
  assert.equal(groups.find((group) => group.key === "profile:three").title, "Anne — Marie Name (Child)");
});

test("raw print includes non-migrating members that only exist in the roster", () => {
  const sections = buildQuestionnairePrintSections({
    non_migrating_members: [{ id: "parent", passport: { given_names: "Pat", family_name: "Parent" }, relationship: "parent" }],
  });
  assert.deepEqual(sections, [{
    key: "nonMigrating:parent.roster", title: "Pat Parent — Details",
    answers: [{ question: "Passport — Given names", answer: "Pat" }, { question: "Passport — Family name", answer: "Parent" }],
  }]);
});
