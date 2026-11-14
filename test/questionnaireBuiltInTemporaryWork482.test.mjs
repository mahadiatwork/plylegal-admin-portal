import assert from "node:assert";
import { describe, it } from "node:test";
import { getBuiltInQuestionnaireDefinition } from "../src/lib/questionnaireBuiltIns.js";
import { getClientQuestionnairePresentation } from "../src/lib/questionnaireClientPresentation.js";
import { getQuestionnaireDefinitionIssues } from "../src/lib/questionnaireDefinitions.js";
import { groupQuestionnairePages } from "../src/lib/questionnairePageGroups.js";

const SKILLS_ROUTE = "/intake/temporary-work/main-applicant/skills";

const EXPECTED_482_ROUTES = [
  "/intake/temporary-work/start",
  "/intake/temporary-work/profile",
  "/intake/temporary-work/main-applicant/details",
  "/intake/temporary-work/main-applicant/other",
  "/intake/temporary-work/main-applicant/identity",
  "/intake/temporary-work/main-applicant/contact-details",
  "/intake/temporary-work/non-migrating",
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

  it("has a valid 482 definition with 29 managed pages and correct renderer split", () => {
    assert.ok(definition, "482 definition should exist");
    assert.strictEqual(definition.pages.length, 29);
    assert.deepStrictEqual(definition.pages.map((page) => page.route), EXPECTED_482_ROUTES);
    // 25 content pages are certified for the dynamic renderer (+ Character, always dynamic);
    // the three workflow pages (start, profile, non-migrating index) stay legacy.
    assert.deepStrictEqual(
      definition.pages.filter((page) => page.metadata?.renderer === "legacy").map((page) => page.route.split("/").pop()),
      ["start", "profile", "non-migrating"],
    );
    assert.strictEqual(definition.pages.filter((page) => page.metadata?.dynamicParity === "certified").length, 25);
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
    for (const key of ["still_working", "current_end_date_day", "current_end_date_month", "current_end_date_year"]) {
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
    // The live page stores profile ids (not names), so the dynamic renderer must too.
    assert.strictEqual(findQuestion(entries.metadata.fields, "applicantId")?.optionsSource, "applicantIds");
    assert.strictEqual(entries.metadata.presentation.layout, "inline");
    assert.strictEqual(entries.metadata.presentation.addLabel, "Add Applicant Visa Record");
  });

  it("renders Contact Details as a fixed object group and Travel with its full intro", () => {
    const contact = definition.pages.find((candidate) => candidate.route === "/intake/temporary-work/main-applicant/contact-details");
    const address = findQuestion(contact.questions, "residential_address");
    assert.strictEqual(address.metadata.collection, "object");
    assert.strictEqual(address.metadata.presentation.addLabel, undefined);

    const travel = definition.pages.find((candidate) => candidate.route === "/intake/temporary-work/all-applicants/travel-history");
    assert.strictEqual(travel.introBlocks.length, 3);
    assert.match(travel.introBlocks[0].text, /travelled outside their usual country of residence/);
    assert.deepStrictEqual(travel.introBlocks[1].items, ["work, study or training", "business", "holiday/leisure trips", "military deployment", "visits back to your own country"]);
    assert.match(travel.introBlocks[2].text, /under 16 years of age/);
    assert.strictEqual(findQuestion(travel.questions, "has_travel_history").label, travel.introBlocks[0].text);
  });

  it("attaches the ten-year residence coverage contract to the shared residence records", () => {
    const page = definition.pages.find((candidate) => candidate.route === "/intake/temporary-work/all-applicants/countries-of-residence");
    const records = findQuestion(page.questions, "residence_records");
    const rule = records.metadata.validation.rules.find((candidate) => candidate.id === "residenceHistoryCoverage");
    assert.deepStrictEqual(rule.config, {
      years: 10,
      minimumAge: 16,
      applicantField: "applicant_name",
      fromFields: ["date_from_day", "date_from_month", "date_from_year"],
      toFields: ["date_to_day", "date_to_month", "date_to_year"],
    });
    assert.deepStrictEqual(records.metadata.presentation.columns.map((column) => column.label), ["Applicant", "Country", "From", "To"]);
    // Stored as profile ids by the live page (dynamic parity).
    assert.strictEqual(findQuestion(records.metadata.fields, "applicant_name")?.optionsSource, "applicantIds");
  });

  it("shares main Education and Language popup contracts with the 186 spouse fixtures", () => {
    const education = definition.pages.find((page) => page.route.endsWith("/main-applicant/education"));
    const history = findQuestion(education.questions, "education_history");
    assert.deepStrictEqual(history.metadata.presentation.columns.map((column) => column.label), ["Institution", "Qualification", "Course Name", "Year Started", "Country"]);
    assert.deepStrictEqual(findQuestion(history.metadata.fields, "qualification").options.map((option) => option.value), ["Secondary", "Diploma/Certificate", "Bachelor's", "Master's", "Doctorate/PhD", "Other"]);

    const language = definition.pages.find((page) => page.route.endsWith("/main-applicant/language"));
    assert.deepStrictEqual(findQuestion(language.questions, "languages").metadata.presentation.columns.map((column) => column.label), ["Language", "Proficiency", "Main Language?"]);
    assert.deepStrictEqual(findQuestion(findQuestion(language.questions, "english_tests").metadata.fields, "test_type").options.map((option) => option.value), ["IELTS Academic", "IELTS General", "PTE Academic", "TOEFL iBT", "OET", "Other"]);
  });

  it("models Travel applicants and Identity gates exactly as mounted", () => {
    const travel = definition.pages.find((page) => page.route.endsWith("/all-applicants/travel-history"));
    const records = findQuestion(travel.questions, "travel_history");
    const applicants = findQuestion(records.metadata.fields, "applicant_ids");
    assert.strictEqual(applicants.type, "select");
    // An array of profile ids, as the live multi-select stores it.
    assert.strictEqual(applicants.optionsSource, "applicantIds");
    assert.strictEqual(applicants.metadata.collection, "multi-select-array");
    assert.deepStrictEqual(records.metadata.presentation.columns.map((column) => column.label), ["Applicant(s)", "Country", "Arrival Date", "Departure Date", "Reason for Travel"]);

    const identity = definition.pages.find((page) => page.route.endsWith("/main-applicant/identity"));
    const passports = findQuestion(identity.questions, "passports");
    const passportFields = new Map(passports.metadata.fields.map((field) => [field.answerKey, field]));
    for (const key of ["document_type", "document_number", "passport_country", "place_of_issue", "nationality", "gender", "name", "date_issued", "is_original_date", "document_status"]) {
      assert.strictEqual(passportFields.get(key)?.required, true, `${key} should match the mounted dialog`);
    }
    assert.ok(passports.metadata.validation.rules.some((rule) => rule.id === "minRowsWhenEquals"));
    const nationalId = findQuestion(identity.questions, "national_id_card");
    for (const key of ["family_name", "given_names", "identification_number", "country_of_issue"]) {
      assert.strictEqual(findQuestion(nationalId.metadata.fields, key)?.required, true);
    }
  });

  it("models all ten Health dialogs as distinct applicant-scoped records", () => {
    const page = definition.pages.find((candidate) => candidate.route === "/intake/temporary-work/all-applicants/health");
    const expected = {
      health_examinations: "Health Examinations",
      visited_outside_details: "Visited outside passport country",
      hospital_details: "Hospital / health care facility details",
      healthcare_work_details: "Health care work details",
      aged_care_work_details: "Aged care / disability care details",
      childcare_work_details: "Child care centre details",
      classroom_work_details: "Classroom details",
      tuberculosis_details: "Tuberculosis details",
      health_conditions_details: "Health condition details",
      medical_assistance_details: "Ongoing medical care details",
    };
    for (const [answerKey, heading] of Object.entries(expected)) {
      const record = findQuestion(page.questions, answerKey);
      assert.strictEqual(record.label, heading);
      assert.strictEqual(record.metadata.presentation.addDialogTitle, heading);
      assert.ok(record.metadata.presentation.columns.length >= 2);
      const applicant = findQuestion(record.metadata.fields, "applicant_name");
      assert.strictEqual(applicant.type, "select");
      assert.strictEqual(applicant.optionsSource, "applicants");
    }
  });

  it("models each non-migrating page title as profile-aware", () => {
    const pages = definition.pages.filter((page) => page.route.includes("/non-migrating/member-profile/"));
    assert.strictEqual(pages.length, 6);
    pages.forEach((page) => {
      assert.strictEqual(page.metadata.titleIncludesPerson, true);
      assert.strictEqual(page.metadata.titleTemplate, `${page.title} — {profileName}`);
      assert.strictEqual(page.metadata.adminHiddenInProposed, true);
    });
  });

  it("models the client Other Family dialog as one nested admin page", () => {
    const page = definition.pages.find((candidate) => candidate.route === "/intake/temporary-work/non-migrating");
    assert.ok(page);
    assert.strictEqual(page.metadata.adminNestedUnder, "main-applicant");
    assert.strictEqual(page.metadata.adminCompositePage, true);
    assert.strictEqual(page.metadata.profileRole, "non_migrating");

    const included = findQuestion(page.questions, "has_other_family");
    const members = findQuestion(page.questions, "members");
    assert.strictEqual(included.label, "Do you have any non-migrating family members not included in the application, such as a spouse or partner, child, parent or sibling?");
    assert.deepStrictEqual(members.visibleIf, [{ field: "has_other_family", op: "equals", value: "yes" }]);
    assert.deepStrictEqual(
      members.metadata.presentation.sections.map((section) => section.heading),
      ["Relationship", "Passport Details", "Identity Documents", "Place of Birth", "Address and Phone", "Other Names / Spellings", "Citizenship", "Health"],
    );
    assert.strictEqual(findQuestion(members.metadata.fields, "relationship").label, "Relationship to Main Applicant");
    assert.strictEqual(findQuestion(members.metadata.fields, "has_current_passport").label, "Does this person have a current passport?");
    assert.deepStrictEqual(findQuestion(members.metadata.fields, "passport_family_name").visibleIf, [{ field: "has_current_passport", op: "equals", value: "yes" }]);
    for (const key of ["place_of_birth_town", "place_of_birth_state", "place_of_birth_country"]) {
      assert.strictEqual(findQuestion(members.metadata.fields, key).metadata.group, "Place of Birth");
    }
    for (const key of ["contact_phone", "address_line_1", "address_line_2", "address_suburb", "address_state", "address_postcode", "address_country"]) {
      assert.strictEqual(findQuestion(members.metadata.fields, key).metadata.group, "Address and Phone");
    }
  });

  it("matches the Test 2 identity, contact, family and custody contracts", () => {
    const mainOther = definition.pages.find((page) => page.route.endsWith("/main-applicant/other"));
    const spouseOther = definition.pages.find((page) => page.route.endsWith("/spouse-partner/other-details"));
    const mainOtherNames = findQuestion(mainOther.questions, "other_names");
    const spouseOtherNames = findQuestion(spouseOther.questions, "other_names");
    assert.deepStrictEqual(mainOtherNames.visibleIf, [{ field: "has_other_names", op: "equals", value: "yes" }]);
    assert.deepStrictEqual(spouseOtherNames.visibleIf, [{ field: "has_other_names", op: "equals", value: "yes" }]);
    for (const records of [mainOtherNames, spouseOtherNames]) {
      const country = findQuestion(records.metadata.fields, "issuing_country");
      assert.strictEqual(country.type, "select");
      assert.strictEqual(country.optionsSource, "countries");
    }

    const identity = definition.pages.find((page) => page.route.endsWith("/main-applicant/identity"));
    assert.ok(findQuestion(identity.questions, "citizenships"));
    assert.ok(findQuestion(identity.questions, "permanent_residency_rights"));

    const contact = definition.pages.find((page) => page.route.endsWith("/main-applicant/contact-details"));
    assert.strictEqual(findQuestion(contact.questions, "emergency_contact_name").metadata.group, "Emergency Contact");
    assert.strictEqual(findQuestion(contact.questions, "emergency_contact_phone").metadata.group, "Emergency Contact");

    const education = definition.pages.find((page) => page.route.endsWith("/main-applicant/education"));
    assert.ok(findQuestion(findQuestion(education.questions, "education_history").metadata.fields, "certificate_number"));

    const custody = definition.pages.find((page) => page.route.endsWith("/children/child-profile/custody"));
    const presentation = getClientQuestionnairePresentation(custody, definition);
    assert.strictEqual(presentation.primaryCount, 4);
    assert.deepStrictEqual(
      presentation.primaryEntries.map((entry) => entry.label),
      [
        "Is this family member a child under 18 years of age?",
        "Is this child in the primary applicant's care and legal custody?",
        "Does any other person have custodial, access or guardianship rights to this child?",
        "Are there any legal impediments to this child's travel?",
      ]
    );
    assert.deepStrictEqual(
      presentation.primaryEntries.slice(1).map((entry) => entry.conditionalGroups[0]?.entries[0]?.label),
      ["Give details", "Give details", "Give details"]
    );

    const otherFamily = groupQuestionnairePages(definition.pages).find((group) => group.key === "non-migrating");
    assert.strictEqual(otherFamily.label, "Other family");
    assert.strictEqual(otherFamily.pages.length, 7);
  });
});
