import assert from "node:assert";
import { describe, it } from "node:test";
import { getBuiltInQuestionnaireDefinition } from "../src/lib/questionnaireBuiltIns.js";
import { getQuestionnaireDefinitionIssues } from "../src/lib/questionnaireDefinitions.js";

const EMPLOYMENT = "/intake/temporary-work/main-applicant/employment";
const SKILLS = "/intake/temporary-work/main-applicant/skills";
const EDUCATION = "/intake/temporary-work/spouse-partner/education";
const LANGUAGE = "/intake/temporary-work/spouse-partner/language";

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

function answerKeys(questions) {
  const keys = [];
  collectQuestions(questions, (question) => keys.push(question.answerKey));
  return keys;
}

describe("Employer Nomination Visa (Subclass 186) built-in parity", () => {
  const definition = getBuiltInQuestionnaireDefinition({ visaType: "temporary-work", visaContext: "186" });
  const definition482 = getBuiltInQuestionnaireDefinition({ visaType: "temporary-work", visaContext: "482" });

  it("has a valid 186 definition with 31 managed pages and five spouse pages", () => {
    assert.ok(definition);
    assert.strictEqual(definition.pages.length, 31);
    assert.strictEqual(definition.pages.filter((page) => page.metadata?.renderer === "legacy").length, 30);
    assert.strictEqual(definition.pages.filter((page) => page.metadata?.renderer !== "legacy").length, 1);
    const spouseRoutes = definition.pages
      .filter((page) => page.route.includes("/spouse-partner/"))
      .map((page) => page.route);
    assert.deepStrictEqual(spouseRoutes.sort(), [
      "/intake/temporary-work/spouse-partner/details",
      "/intake/temporary-work/spouse-partner/education",
      "/intake/temporary-work/spouse-partner/identity",
      "/intake/temporary-work/spouse-partner/language",
      "/intake/temporary-work/spouse-partner/other-details",
    ].sort());
    assert.deepStrictEqual(getQuestionnaireDefinitionIssues(definition), []);
  });

  it("ten-year employment contract keeps the Australia-only visa field", () => {
    const page = definition.pages.find((candidate) => candidate.route === EMPLOYMENT);
    assert.strictEqual(page.title, "Main Applicant's Employment");
    assert.strictEqual(page.introBlocks?.[0]?.text, "In this section, provide details about the main applicant's employment history.");
    const history = findQuestion(page.questions, "employment_history");
    assert.strictEqual(history.label, "Employment History (last 10 years)");
    assert.strictEqual(history.description, "Enter details of your employment history for the previous 10 years");
    assert.ok(
      !(history.metadata.validation?.rules || []).some((rule) => rule.id === "continuousHistoryCoverage"),
      "186 must not invent a continuous coverage rule"
    );
    assert.deepStrictEqual(
      history.metadata.presentation.columns.map((column) => column.label),
      ["Date From", "Date To", "Status", "Position", "Employer", "Duties", "Country"]
    );

    const visaHeld = findQuestion(history.metadata.fields, "visa_held");
    assert.ok(visaHeld, "186 employment history must keep visa_held");
    assert.deepStrictEqual(visaHeld.visaContexts, ["186"]);
    assert.deepStrictEqual(visaHeld.visibleIf, [{ field: "country", op: "equals", value: "Australia" }]);
    assert.strictEqual(visaHeld.label, "What visa(s) were held during this period?");
    assert.strictEqual(visaHeld.placeholder, "e.g., Employer Nomination (subclass 186)");
    assert.strictEqual(visaHeld.metadata.validation.rules[0].id, "requiredWhenEquals");
    assert.strictEqual(visaHeld.metadata.validation.rules[0].config.field, "country");
    assert.strictEqual(visaHeld.metadata.validation.rules[0].config.value, "Australia");
  });

  it("keeps 482 free of 186-only employment and spouse fields", () => {
    assert.ok(!definition482.pages.some((page) => page.route === EDUCATION));
    assert.ok(!definition482.pages.some((page) => page.route === LANGUAGE));
    const employment482 = definition482.pages.find((page) => page.route === EMPLOYMENT);
    assert.strictEqual(findQuestion(employment482.questions, "visa_held"), null);
    const history482 = findQuestion(employment482.questions, "employment_history");
    assert.strictEqual(history482.label, "Employment History (last 5 years)");
  });

  it("matches the Spouse Education fixture", () => {
    const page = definition.pages.find((candidate) => candidate.route === EDUCATION);
    assert.ok(page);
    assert.strictEqual(page.title, "Spouse/Partner's Education");
    assert.strictEqual(page.introBlocks?.[0]?.text, "In this section, provide details about the spouse/partner's education history.");
    const history = findQuestion(page.questions, "education_history");
    assert.strictEqual(history.label, "Education History");
    assert.strictEqual(storedFieldCount(history.metadata.fields), 18);
    assert.deepStrictEqual(
      history.metadata.presentation.columns.map((column) => column.label),
      ["Institution", "Qualification", "Course Name", "Year Started", "Country"]
    );
    assert.strictEqual(history.metadata.presentation.sections?.[0]?.heading, "Institution Details");
    assert.deepStrictEqual(
      findQuestion(history.metadata.fields, "qualification")?.options?.map((option) => option.value),
      ["Secondary", "Diploma/Certificate", "Bachelor's", "Master's", "Doctorate/PhD", "Other"]
    );
    assert.deepStrictEqual(
      findQuestion(history.metadata.fields, "course_status")?.options?.map((option) => option.value),
      ["Completed", "Current/Ongoing", "Deferred", "Withdrawn"]
    );
    const country = findQuestion(history.metadata.fields, "country");
    assert.strictEqual(country.type, "select");
    assert.strictEqual(country.optionsSource, "countries");
    assert.strictEqual(findQuestion(history.metadata.fields, "qualification").validation.requiredMessage, "Qualification is required");
  });

  it("matches the Spouse Language fixture including both popups", () => {
    const page = definition.pages.find((candidate) => candidate.route === LANGUAGE);
    assert.ok(page);
    assert.strictEqual(page.title, "Spouse/Partner's Language");
    assert.strictEqual(page.introBlocks?.[0]?.text, "In this section, provide details about the spouse/partner's language proficiency.");
    const byKey = new Map(page.questions.map((question) => [question.answerKey, question]));
    assert.deepStrictEqual(
      [...byKey.keys()],
      ["is_english_main_language", "languages", "has_english_test", "english_tests", "studied_in_english", "studied_in_english_details"]
    );

    const languages = byKey.get("languages");
    assert.strictEqual(languages.label, "Languages Used");
    assert.strictEqual(storedFieldCount(languages.metadata.fields), 3);
    assert.deepStrictEqual(
      languages.metadata.presentation.columns.map((column) => column.label),
      ["Language", "Proficiency", "Main Language?"]
    );
    assert.strictEqual(languages.metadata.presentation.columns[2].format, "yesNoLabel");

    const tests = byKey.get("english_tests");
    assert.strictEqual(tests.label, "English Test Results");
    assert.strictEqual(storedFieldCount(tests.metadata.fields), 11);
    assert.deepStrictEqual(
      tests.metadata.presentation.columns.map((column) => column.label),
      ["Date", "Test Type", "Location", "Reference Number", "Overall Score"]
    );
    assert.deepStrictEqual(
      findQuestion(tests.metadata.fields, "test_type")?.options?.map((option) => option.value),
      ["IELTS Academic", "IELTS General", "PTE Academic", "TOEFL iBT", "OET", "Other"]
    );

    const details = byKey.get("studied_in_english_details");
    assert.strictEqual(details.rows, 4);
    assert.match(details.placeholder, /University of Melbourne/);
    assert.strictEqual(details.metadata.validation.rules[0].id, "requiredWhenEquals");
    assert.deepStrictEqual(details.visibleIf, [{ field: "studied_in_english", op: "equals", value: "yes" }]);
  });

  it("shares the complete Skills semantic contract with 482", () => {
    const skills186 = definition.pages.find((page) => page.route === SKILLS);
    const skills482 = definition482.pages.find((page) => page.route === SKILLS);
    assert.deepStrictEqual(answerKeys(skills186.questions).sort(), answerKeys(skills482.questions).sort());
    assert.strictEqual(findQuestion(skills186.questions, "registrations").metadata.presentation.columns.length, 5);
    assert.strictEqual(findQuestion(skills186.questions, "assessments").metadata.presentation.sections.length, 2);
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
        if (question.metadata?.collection === "object" && question.metadata?.presentation?.addLabel) {
          missing.push(`${page.route} / ${question.answerKey}: fixed group exposes an add action`);
        }
      });
    }
    assert.deepStrictEqual(missing, [], `Repeater metadata gaps: ${missing.join("; ")}`);
  });

  it("applies Visas Path B and Travel/Contact shared contracts to 186", () => {
    const visas = definition.pages.find((page) => page.route === "/intake/temporary-work/all-applicants/visas");
    const entries = findQuestion(visas.questions, "visa_grant_entries");
    assert.deepStrictEqual(entries.metadata.fields.map((field) => field.answerKey), ["applicantId", "grantNumber"]);
    assert.strictEqual(findQuestion(entries.metadata.fields, "history"), null);

    const contact = definition.pages.find((page) => page.route === "/intake/temporary-work/main-applicant/contact-details");
    assert.strictEqual(findQuestion(contact.questions, "residential_address").metadata.collection, "object");

    const travel = definition.pages.find((page) => page.route === "/intake/temporary-work/all-applicants/travel-history");
    assert.strictEqual(travel.introBlocks.length, 2);
    assert.match(travel.introBlocks[1].text, /under 16 years of age/);

    const residence = definition.pages.find((page) => page.route === "/intake/temporary-work/all-applicants/countries-of-residence");
    const coverageRule = findQuestion(residence.questions, "residence_records").metadata.validation.rules.find((rule) => rule.id === "residenceHistoryCoverage");
    assert.strictEqual(coverageRule.config.years, 10);
    assert.strictEqual(coverageRule.config.minimumAge, 16);
  });

  it("shares all ten applicant-scoped Health dialog contracts with 482", () => {
    const health = definition.pages.find((page) => page.route === "/intake/temporary-work/all-applicants/health");
    const records = [
      "health_examinations", "visited_outside_details", "hospital_details", "healthcare_work_details",
      "aged_care_work_details", "childcare_work_details", "classroom_work_details", "tuberculosis_details",
      "health_conditions_details", "medical_assistance_details",
    ].map((answerKey) => findQuestion(health.questions, answerKey));
    assert.strictEqual(records.length, 10);
    assert.strictEqual(new Set(records.map((record) => record.label)).size, 10);
    records.forEach((record) => {
      assert.strictEqual(findQuestion(record.metadata.fields, "applicant_name")?.optionsSource, "applicants");
      assert.strictEqual(record.metadata.presentation.addDialogTitle, record.label);
    });
  });

  it("keeps non-migrating title interpolation aligned with 482", () => {
    const pages = definition.pages.filter((page) => page.route.includes("/non-migrating/member-profile/"));
    assert.strictEqual(pages.length, 6);
    assert.ok(pages.every((page) => page.metadata.titleIncludesPerson && page.metadata.titleTemplate.endsWith("{profileName}")));
  });
});
