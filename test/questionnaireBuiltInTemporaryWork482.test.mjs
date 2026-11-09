import assert from "node:assert";
import { describe, it } from "node:test";
import { getBuiltInQuestionnaireDefinition } from "../src/lib/questionnaireBuiltIns.js";
import { getQuestionnaireDefinitionIssues } from "../src/lib/questionnaireDefinitions.js";

const SKILLS_ROUTE = "/intake/temporary-work/main-applicant/skills";

const EXPECTED_482_ROUTES = [
  "/intake/temporary-work/main-applicant/details",
  "/intake/temporary-work/main-applicant/other",
  "/intake/temporary-work/main-applicant/identity",
  "/intake/temporary-work/main-applicant/contact-details",
  "/intake/temporary-work/main-applicant/employment",
  "/intake/temporary-work/main-applicant/education",
  "/intake/temporary-work/main-applicant/skills",
  "/intake/temporary-work/main-applicant/language",
  "/intake/temporary-work/spouse-partner/details",
  "/intake/temporary-work/spouse-partner/other-details",
  "/intake/temporary-work/spouse-partner/identity",
  "/intake/temporary-work/children/child-profile/details",
  "/intake/temporary-work/children/child-profile/other",
  "/intake/temporary-work/children/child-profile/identity",
  "/intake/temporary-work/children/child-profile/custody",
  "/intake/temporary-work/non-migrating/member-profile/details",
  "/intake/temporary-work/non-migrating/member-profile/passport",
  "/intake/temporary-work/non-migrating/member-profile/identity",
  "/intake/temporary-work/non-migrating/member-profile/other-names",
  "/intake/temporary-work/non-migrating/member-profile/citizenship",
  "/intake/temporary-work/non-migrating/member-profile/health",
  "/intake/temporary-work/all-applicants/visas",
  "/intake/temporary-work/all-applicants/travel-history",
  "/intake/temporary-work/all-applicants/countries-of-residence",
  "/intake/temporary-work/all-applicants/health",
  "/intake/temporary-work/all-applicants/character",
];

function collectQuestions(questions, callback) {
  for (const question of questions || []) {
    callback(question);
    collectQuestions(question.metadata?.fields, callback);
    collectQuestions(question.followUps, callback);
  }
}

function findQuestion(questions, answerKey) {
  let found = null;
  collectQuestions(questions, (question) => {
    if (!found && question.answerKey === answerKey) found = question;
  });
  return found;
}

function storedFieldCount(fields) {
  return (fields || []).reduce((sum, field) => sum + (field.type === "dateParts" ? 3 : 1), 0);
}

describe("Skills in Demand Visa (Subclass 482) built-in parity", () => {
  const definition = getBuiltInQuestionnaireDefinition({ visaType: "temporary-work", visaContext: "482" });
  const definition186 = getBuiltInQuestionnaireDefinition({ visaType: "temporary-work", visaContext: "186" });

  it("has a valid 482 definition with 26 content pages and correct renderer split", () => {
    assert.ok(definition, "482 definition should exist");
    assert.strictEqual(definition.pages.length, 26);
    assert.deepStrictEqual([...definition.pages.map((page) => page.route)].sort(), [...EXPECTED_482_ROUTES].sort());
    assert.strictEqual(definition.pages.filter((page) => page.metadata?.renderer === "legacy").length, 25);
    assert.strictEqual(definition.pages.filter((page) => page.metadata?.renderer !== "legacy").length, 1);
    assert.deepStrictEqual(getQuestionnaireDefinitionIssues(definition), []);
  });

  it("keeps 482 and 186 context boundaries", () => {
    const routes482 = definition.pages.map((page) => page.route);
    assert.ok(!routes482.includes("/intake/temporary-work/spouse-partner/education"));
    assert.ok(!routes482.includes("/intake/temporary-work/spouse-partner/language"));
    assert.ok(findQuestion(definition.pages.flatMap((page) => page.questions || []), "visa_held") === null, "482 must not expose visa_held");
    assert.ok(findQuestion(definition186.pages.flatMap((page) => page.questions || []), "visa_held"), "186 must retain visa_held");
  });

  it("matches the Skills acceptance fixture", () => {
    const page = definition.pages.find((candidate) => candidate.route === SKILLS_ROUTE);
    assert.ok(page);
    assert.strictEqual(page.title, "Main Applicant's Skills");
    assert.strictEqual(
      page.introBlocks?.[0]?.text,
      "In this section, provide details about the main applicant's professional registrations and skills assessments."
    );

    const registrationGate = findQuestion(page.questions, "has_occupational_registration");
    const registrationRepeater = findQuestion(page.questions, "registrations");
    assert.strictEqual(registrationGate?.label, "Do you hold any Occupational Registrations, Licences or Professional Memberships?");
    assert.deepStrictEqual(registrationGate?.options?.map((option) => option.value), ["yes", "no"]);
    assert.deepStrictEqual(registrationRepeater?.visibleIf, [{ field: "has_occupational_registration", op: "equals", value: "yes" }]);
    assert.strictEqual(registrationRepeater?.label, "Registrations/Licences");
    assert.strictEqual(storedFieldCount(registrationRepeater?.metadata?.fields), 13);

    const assessmentGate = findQuestion(page.questions, "has_skills_assessment");
    const assessmentRepeater = findQuestion(page.questions, "assessments");
    assert.strictEqual(assessmentGate?.label, "Have you applied for a Skills Assessment from an Australian Skills Assessing body?");
    assert.deepStrictEqual(assessmentGate?.options?.map((option) => option.value), ["yes", "no"]);
    assert.deepStrictEqual(assessmentRepeater?.visibleIf, [{ field: "has_skills_assessment", op: "equals", value: "yes" }]);
    assert.strictEqual(assessmentRepeater?.label, "Skills Assessments");
    assert.strictEqual(storedFieldCount(assessmentRepeater?.metadata?.fields), 12);

    const issueDate = findQuestion(registrationRepeater.metadata.fields, "issue_date");
    assert.strictEqual(issueDate?.type, "dateParts");
    assert.deepStrictEqual(issueDate?.parts, {
      day: "issue_date_day",
      month: "issue_date_month",
      year: "issue_date_year",
    });
    const expiryDate = findQuestion(registrationRepeater.metadata.fields, "expiry_date");
    assert.strictEqual(expiryDate?.type, "dateParts");
    assert.strictEqual(expiryDate?.required, false);

    const registrationCountry = findQuestion(registrationRepeater.metadata.fields, "country");
    assert.strictEqual(registrationCountry?.type, "select");
    assert.strictEqual(registrationCountry?.optionsSource, "countries");

    assert.deepStrictEqual(
      registrationRepeater.metadata.presentation.columns.map((column) => column.label),
      ["Authority", "Title", "Licence Number", "Year", "Country"]
    );
    assert.deepStrictEqual(
      assessmentRepeater.metadata.presentation.columns.map((column) => column.label),
      ["Authority", "Type", "ANZSCO", "Outcome"]
    );
    assert.deepStrictEqual(
      assessmentRepeater.metadata.presentation.sections.map((section) => section.heading),
      ["Skills Assessment", "Assessment Outcome"]
    );
    assert.strictEqual(assessmentRepeater.metadata.presentation.sections[0].description, "Enter details of the Skill Assessment you have applied for");
    assert.strictEqual(assessmentRepeater.metadata.presentation.sections[1].description, "Enter details on the outcome of the Skills Assessment");

    assert.deepStrictEqual(
      findQuestion(assessmentRepeater.metadata.fields, "assessment_type")?.options?.map((option) => option.value),
      ["Full Skills Assessment", "Provisional Skills Assessment", "Job Ready Program", "Points Test Advice", "Other"]
    );
    assert.deepStrictEqual(
      findQuestion(assessmentRepeater.metadata.fields, "outcome")?.options?.map((option) => option.value),
      ["Positive", "Negative", "Unexpected", "Pending", "Other"]
    );

    assert.deepStrictEqual(
      registrationRepeater.metadata.validation.rules.map((rule) => rule.id),
      ["datePartsAllOrNone", "requiredWhenEquals"]
    );
    assert.deepStrictEqual(
      assessmentRepeater.metadata.validation.rules.map((rule) => rule.id),
      ["datePartsRequiredUnlessValue"]
    );
    assert.strictEqual(findQuestion(registrationRepeater.metadata.fields, "english_requirement_details")?.validation?.requiredMessage, "Details are required");
  });

  it("gives every repeater nested fields, presentation chrome and a valid collection kind", () => {
    const missing = [];
    for (const page of definition.pages) {
      collectQuestions(page.questions, (question) => {
        if (question.type !== "repeater") return;
        if (!Array.isArray(question.metadata?.fields) || question.metadata.fields.length === 0) {
          missing.push(`${page.route} / ${question.answerKey}: no nested fields`);
        }
        if (!question.metadata?.presentation?.columns?.length) {
          missing.push(`${page.route} / ${question.answerKey}: no presentation columns`);
        }
        if (!question.metadata?.presentation?.actions?.edit || !question.metadata?.presentation?.actions?.delete) {
          missing.push(`${page.route} / ${question.answerKey}: no action copy`);
        }
        if (!["array", "object", "nested-array", "multi-select-array"].includes(question.metadata?.collection || "array")) {
          missing.push(`${page.route} / ${question.answerKey}: invalid collection kind`);
        }
        if (question.metadata?.collection === "object" && question.metadata?.presentation?.addLabel) {
          missing.push(`${page.route} / ${question.answerKey}: fixed group exposes an add action`);
        }
        for (const column of question.metadata?.presentation?.columns || []) {
          if (!column.key || !column.label) missing.push(`${page.route} / ${question.answerKey}: incomplete column`);
        }
      });
    }
    assert.deepStrictEqual(missing, [], `Repeater metadata gaps: ${missing.join("; ")}`);
  });

  it("uses five-year employment copy and hides storage-only compatibility keys", () => {
    const page = definition.pages.find((candidate) => candidate.route === "/intake/temporary-work/main-applicant/employment");
    const history = findQuestion(page.questions, "employment_history");
    assert.strictEqual(history.label, "Employment History (last 5 years)");
    assert.strictEqual(history.description, "Enter details of your employment history for the previous 5 years");
    for (const key of ["still_working", "current_end_date"]) {
      const question = findQuestion(page.questions, key);
      assert.strictEqual(question?.metadata?.storageOnly, true, `${key} should be storage-only`);
    }
    assert.strictEqual(findQuestion(page.questions, "visa_held"), null);
  });

  it("resolves the Visas dead-source hybrid without deleting the compatibility history property", () => {
    const page = definition.pages.find((candidate) => candidate.route === "/intake/temporary-work/all-applicants/visas");
    const entries = findQuestion(page.questions, "visa_grant_entries");
    assert.ok(entries);
    assert.deepStrictEqual(entries.metadata.fields.map((field) => field.answerKey), ["applicantId", "grantNumber"]);
    assert.strictEqual(findQuestion(entries.metadata.fields, "history"), null);
    assert.strictEqual(findQuestion(entries.metadata.fields, "applicantId")?.optionsSource, "applicants");
    assert.strictEqual(entries.metadata.presentation.addLabel, "Add Applicant Visa Record");
  });

  it("renders Contact Details as a fixed object group and Travel with its full intro", () => {
    const contact = definition.pages.find((candidate) => candidate.route === "/intake/temporary-work/main-applicant/contact-details");
    const address = findQuestion(contact.questions, "residential_address");
    assert.strictEqual(address.metadata.collection, "object");
    assert.strictEqual(address.metadata.presentation.addLabel, undefined);

    const travel = definition.pages.find((candidate) => candidate.route === "/intake/temporary-work/all-applicants/travel-history");
    assert.strictEqual(travel.introBlocks.length, 2);
    assert.match(travel.introBlocks[0].text, /travelled outside their usual country of residence/);
    assert.match(travel.introBlocks[1].text, /under 16 years of age/);
    assert.strictEqual(findQuestion(travel.questions, "has_travel_history").label, travel.introBlocks[0].text);
  });
});
