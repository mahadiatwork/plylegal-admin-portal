import assert from "node:assert/strict";
import test from "node:test";
import { buildQuestionnairePrintSections } from "./questionnairePrintSections.js";

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
