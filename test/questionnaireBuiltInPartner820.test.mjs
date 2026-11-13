import assert from "node:assert";
import { describe, it } from "node:test";
import { getBuiltInQuestionnaireDefinition } from "../src/lib/questionnaireBuiltIns.js";
import { getQuestionnaireDefinitionIssues } from "../src/lib/questionnaireDefinitions.js";

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

describe("Partner Visa (Subclass 820) built-in parity", () => {
  const definition = getBuiltInQuestionnaireDefinition({ visaType: "partner" });

  it("has a valid 46-page legacy Partner definition", () => {
    assert.ok(definition);
    assert.strictEqual(definition.pages.length, 46);
    assert.strictEqual(definition.pages.filter((page) => page.metadata?.renderer === "legacy").length, 46);
    assert.deepStrictEqual(getQuestionnaireDefinitionIssues(definition), []);
  });

  it("matches the Main Applicant Employment fixture", () => {
    const page = definition.pages.find((candidate) => candidate.route === "/intake/partner/main-applicant/employment");
    assert.strictEqual(page.title, "Main Applicant's Employment");
    const history = findQuestion(page.questions, "employment_history");
    assert.strictEqual(history.label, "Employment History");
    assert.strictEqual(history.description, "Enter details of all of your employment and unemployment since birth. There can be no gaps in dates.");
    assert.deepStrictEqual(
      history.metadata.presentation.columns.map((column) => column.label),
      ["Date From", "Date To", "Status", "Position", "Country"]
    );
    assert.ok(!(history.metadata.validation?.rules || []).some((rule) => rule.id === "continuousHistoryCoverage"));
    assert.strictEqual(findQuestion(history.metadata.fields, "business_address_street_line2")?.metadata?.storageOnly, true);
    assert.strictEqual(findQuestion(history.metadata.fields, "country")?.optionsSource, "countries");
    const dateFrom = findQuestion(history.metadata.fields, "date_from");
    assert.strictEqual(dateFrom?.type, "dateParts");
    assert.deepStrictEqual(dateFrom?.parts, { day: "date_from_day", month: "date_from_month", year: "date_from_year" });
    assert.strictEqual(findQuestion(page.questions, "is_currently_employed")?.required, true);
    for (const key of ["current_employer", "current_position", "current_country", "current_start_date", "current_employment_type", "current_address"]) {
      const question = findQuestion(page.questions, key);
      assert.ok(question, `missing ${key}`);
      assert.deepStrictEqual(question.visibleIf, [{ field: "is_currently_employed", op: "equals", value: "yes" }]);
    }
  });

  it("uses runtime relationship storage paths with legacy aliases", () => {
    const expected = {
      "/intake/partner/relationships/current-relationship": "relationships.currentRelationship",
      "/intake/partner/relationships/relationship-details": "relationships.relationshipDetails",
      "/intake/partner/relationships/previous-relationships": "relationships.previousRelationships",
      "/intake/partner/relationships/supporting-witnesses": "relationships.supportingWitnesses",
    };
    for (const [route, storagePath] of Object.entries(expected)) {
      const page = definition.pages.find((candidate) => candidate.route === route);
      assert.strictEqual(page.metadata.storagePath, storagePath);
      assert.ok(Array.isArray(page.metadata.legacyStorageAliases) && page.metadata.legacyStorageAliases.length > 0);
    }

    const previous = definition.pages.find((page) => page.route.endsWith("/relationships/previous-relationships"));
    assert.deepStrictEqual(findQuestion(previous.questions, "applicant_previous_relationships_list").visibleIf, [
      { field: "applicant_previous_relationships", op: "equals", value: "Yes" },
    ]);
    assert.deepStrictEqual(findQuestion(previous.questions, "spouse_previous_relationships_list").visibleIf, [
      { field: "spouse_previous_relationships", op: "equals", value: "Yes" },
    ]);
  });

  it("requires at least two supporting witnesses and groups their birth date", () => {
    const page = definition.pages.find((candidate) => candidate.route.endsWith("/relationships/supporting-witnesses"));
    assert.strictEqual(page.title, "Supporting Witnesses for Current Relationship");
    const witnesses = findQuestion(page.questions, "supporting_witnesses");
    const rule = witnesses.metadata.validation.rules.find((candidate) => candidate.id === "minimumRows");
    assert.strictEqual(rule.config.min, 2);
    assert.strictEqual(rule.config.message, "At least two supporting witnesses are required");
    const birth = findQuestion(witnesses.metadata.fields, "birth");
    assert.strictEqual(birth?.type, "dateParts");
    assert.strictEqual(birth?.label, "Date of Birth");
    assert.deepStrictEqual(birth?.parts, { day: "birth_day", month: "birth_month", year: "birth_year" });
  });

  it("represents all 27 All Applicants Character declarations and detail lists", () => {
    const page = definition.pages.find((candidate) => candidate.route === "/intake/partner/all-applicants/character");
    assert.ok(page.introBlocks.length >= 2);
    assert.strictEqual(page.introBlocks[1].type, "list");
    const controllers = page.questions.filter((question) => question.type === "yesNo");
    const details = page.questions.filter((question) => question.type === "repeater");
    assert.strictEqual(controllers.length, 27);
    assert.strictEqual(details.length, 27);
    assert.ok(controllers.every((question) => question.required === true));
    assert.strictEqual(details.filter((question) => question.visibleIf?.length).length, 27);
    details.forEach((question) => {
      const minimum = question.metadata.validation.rules.find((rule) => rule.id === "minRowsWhenEquals");
      assert.strictEqual(minimum.field, question.answerKey);
      assert.strictEqual(minimum.config.field, question.visibleIf[0].field);
      assert.strictEqual(findQuestion(question.metadata.fields, "applicant_name")?.optionsSource, "applicants");
    });
    const nationalSecurity = page.questions.find((question) => question.answerKey === "national_security_details");
    assert.deepStrictEqual(nationalSecurity.visibleIf, [{ field: "national_security_risk", op: "equals", value: "yes" }]);
  });

  it("captures mounted Partner headings, introductions, branches and compatibility fields", () => {
    const expectedCopy = {
      "/intake/partner/main-applicant/family": "Family",
      "/intake/partner/family-sponsor/details": "Details",
      "/intake/partner/family-sponsor/other": "Other Personal Details",
      "/intake/partner/family-sponsor/family": "Family",
      "/intake/partner/all-applicants/future-travel": "Future Travel Plans",
      "/intake/partner/all-applicants/future-addresses": "Future Addresses",
      "/intake/partner/relationships/supporting-witnesses": "Supporting Witnesses for Current Relationship",
      "/intake/partner/all-applicants/contacts": "Additional Contact Information",
    };
    for (const [route, title] of Object.entries(expectedCopy)) {
      const page = definition.pages.find((candidate) => candidate.route === route);
      assert.strictEqual(page.title, title);
      assert.ok(page.introBlocks.length > 0, `${route} needs mounted introduction copy`);
    }

    const custody = definition.pages.find((page) => page.route.endsWith("/children/child-profile/custody"));
    assert.strictEqual(custody.metadata.titleTemplate, "Custody — {profileName}");

    const futureTravel = findQuestion(
      definition.pages.find((page) => page.route.endsWith("/all-applicants/future-travel")).questions,
      "future_travel",
    );
    assert.strictEqual(futureTravel.required, false);
    assert.deepStrictEqual(findQuestion(futureTravel.metadata.fields, "other_reason_details")?.visibleIf, [
      { field: "reason", op: "equals", value: "Other" },
    ]);

    const visas = findQuestion(
      definition.pages.find((page) => page.route.endsWith("/all-applicants/visas")).questions,
      "visa_history",
    );
    assert.deepStrictEqual(findQuestion(visas.metadata.fields, "date_granted")?.visibleIf, [
      { field: "outcome", op: "equals", value: "Granted" },
    ]);
    assert.strictEqual(findQuestion(visas.metadata.fields, "decision_date")?.visibleIf, undefined);

    const contacts = findQuestion(
      definition.pages.find((page) => page.route.endsWith("/all-applicants/contacts")).questions,
      "family_in_australia",
    );
    assert.strictEqual(findQuestion(contacts.metadata.fields, "city_of_birth")?.metadata?.storageOnly, true);
  });

  it("adds active TB exposure and excludes commented Health Insurance", () => {
    const page = definition.pages.find((candidate) => candidate.route === "/intake/partner/all-applicants/health");
    assert.ok(findQuestion(page.questions, "close_contact_tb"));
    const exposure = findQuestion(page.questions, "tuberculosis_exposure_details");
    assert.ok(exposure);
    assert.deepStrictEqual(exposure.visibleIf, [{ field: "close_contact_tb", op: "equals", value: "yes" }]);
    assert.strictEqual(findQuestion(exposure.metadata.fields, "applicant_name")?.optionsSource, "applicants");
    assert.strictEqual(findQuestion(page.questions, "health_insurance"), null);
    const expectedHeadings = [
      "Health Examinations",
      "Hospital / health care facility details",
      "Health care work details",
      "Aged care / disability care details",
      "Child care centre details",
      "Classroom details",
      "Tuberculosis details",
      "Tuberculosis exposure details",
      "Health condition details",
      "Ongoing medical care details",
    ];
    const records = page.questions.filter((question) => expectedHeadings.includes(question.label));
    assert.strictEqual(records.length, expectedHeadings.length);
    records.forEach((record) => {
      assert.strictEqual(record.metadata.presentation.addDialogTitle, record.label);
      assert.strictEqual(findQuestion(record.metadata.fields, "applicant_name")?.optionsSource, "applicants");
    });
  });

  it("models the address applicant selector as a multi-applicant source", () => {
    const page = definition.pages.find((candidate) => candidate.route === "/intake/partner/all-applicants/addresses");
    const history = findQuestion(page.questions, "address_history");
    const selector = findQuestion(history.metadata.fields, "applicant_ids");
    assert.strictEqual(selector.type, "select");
    assert.strictEqual(selector.optionsSource, "applicants");
    assert.strictEqual(selector.metadata.collection, "multi-select-array");
  });

  it("classifies client-derived compatibility values as locked storage-only fields", () => {
    const expected = {
      "/intake/partner/all-applicants/future-travel": ["from_to", "start_date"],
      "/intake/partner/all-applicants/future-addresses": ["address_display", "date_from", "date_to", "address"],
    };
    for (const [route, keys] of Object.entries(expected)) {
      const page = definition.pages.find((candidate) => candidate.route === route);
      keys.forEach((key) => {
        const field = findQuestion(page.questions, key);
        assert.strictEqual(field?.metadata?.storageOnly, true, `${route} ${key}`);
        assert.strictEqual(field?.metadata?.derived, true, `${route} ${key}`);
        assert.strictEqual(field?.metadata?.editorLocked, true, `${route} ${key}`);
      });
    }
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
});
