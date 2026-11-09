import assert from "node:assert";
import { describe, it } from "node:test";
import { getBuiltInQuestionnaireDefinition } from "../src/lib/questionnaireBuiltIns.js";
import { getQuestionnaireDefinitionIssues } from "../src/lib/questionnaireDefinitions.js";

function findQuestion(questions, predicate) {
  for (const question of questions || []) {
    if (predicate(question)) return question;
    const nested = question.metadata?.fields;
    if (nested) {
      const found = findQuestion(nested, predicate);
      if (found) return found;
    }
    const followUp = findQuestion(question.followUps, predicate);
    if (followUp) return followUp;
  }
  return null;
}

function collectQuestions(questions, callback) {
  for (const question of questions || []) {
    callback(question);
    collectQuestions(question.metadata?.fields, callback);
    collectQuestions(question.followUps, callback);
  }
}

describe("Protection Visa (Subclass 866) built-in parity", () => {
  const definition = getBuiltInQuestionnaireDefinition({ visaType: "protection" });

  it("has a valid protection definition with 29 content pages", () => {
    assert.ok(definition, "Protection definition should exist");
    assert.strictEqual(definition.pages.length, 29, "Expected 29 content page templates");
    const issues = getQuestionnaireDefinitionIssues(definition);
    assert.deepStrictEqual(issues, [], `Validation issues: ${issues.join("; ")}`);
  });

  it("Main Applicant Employment matches the acceptance fixture", () => {
    const page = definition.pages.find((p) => p.route === "/intake/protection/main-applicant/employment");
    assert.ok(page, "Employment page should exist");
    assert.strictEqual(page.title, "Main Applicant's Employment", "Page title should match client");
    assert.strictEqual(
      page.introBlocks?.[0]?.text,
      "In this section, provide details about the main applicant's employment history.",
      "Page intro should match client"
    );

    const currentlyEmployed = findQuestion(page.questions, (q) => q.answerKey === "is_currently_employed");
    assert.ok(currentlyEmployed, "Should have current-employment question");
    assert.strictEqual(currentlyEmployed.label, "Are you currently Employed in a paid position?");
    assert.deepStrictEqual(currentlyEmployed.options?.map((o) => o.value), ["yes", "no"]);

    const currentKeys = [
      "current_employer",
      "current_position",
      "current_country",
      "current_start_date",
      "current_employment_type",
      "current_address",
    ];
    for (const key of currentKeys) {
      const question = findQuestion(page.questions, (q) => q.answerKey === key);
      assert.ok(question, `Missing current employment field ${key}`);
      assert.deepStrictEqual(
        question.visibleIf,
        [{ field: "is_currently_employed", op: "equals", value: "yes" }],
        `${key} should be conditional on currently employed`
      );
    }

    const employmentHistory = findQuestion(page.questions, (q) => q.answerKey === "employment_history");
    assert.ok(employmentHistory, "Should have employment_history repeater");
    assert.strictEqual(
      employmentHistory.label,
      "Employment History for the Main Applicant ({mainApplicantName})"
    );
    assert.strictEqual(
      employmentHistory.description,
      "Enter all employment, unemployment, study and other activities since birth. There can be no gaps in dates."
    );

    const presentation = employmentHistory.metadata?.presentation;
    assert.ok(presentation, "Employment history should have presentation metadata");
    assert.strictEqual(presentation.addLabel, "Add");
    assert.strictEqual(presentation.emptyMessage, "No entries added");
    assert.strictEqual(presentation.addDialogTitle, "Add Entry");
    assert.strictEqual(presentation.editDialogTitle, "Edit Entry");
    assert.deepStrictEqual(presentation.columns.map((c) => c.label), [
      "Date From",
      "Date To",
      "Status",
      "Position",
      "Employer",
      "Country",
    ]);
    assert.strictEqual(presentation.actions?.edit, "Edit");
    assert.strictEqual(presentation.actions?.delete, "Delete");
    assert.strictEqual(presentation.actions?.cancel, "Cancel");
    assert.strictEqual(presentation.actions?.confirm, "Ok");
    assert.strictEqual(presentation.actions?.actionsHeading, "Actions");

    const fields = employmentHistory.metadata.fields;
    assert.ok(fields?.length, "Employment history should have nested fields");

    const dateFrom = findQuestion(fields, (q) => q.answerKey === "date_from");
    const dateTo = findQuestion(fields, (q) => q.answerKey === "date_to");
    assert.strictEqual(dateFrom?.type, "dateParts", "Date From should be grouped date parts");
    assert.strictEqual(dateTo?.type, "dateParts", "Date To should be grouped date parts");

    const status = findQuestion(fields, (q) => q.answerKey === "status");
    assert.ok(status, "Should have status field");
    assert.deepStrictEqual(status.options?.map((o) => o.value), [
      "Employed",
      "Student",
      "Retired",
      "Self-Employed",
      "Unemployed",
      "Work Experience/Internships",
      "Unpaid Employment/Volunteer",
    ]);

    const country = findQuestion(fields, (q) => q.answerKey === "country");
    assert.strictEqual(country?.type, "select");
    assert.strictEqual(country?.optionsSource, "countries");

    const currentCountry = findQuestion(page.questions, (q) => q.answerKey === "current_country");
    assert.strictEqual(currentCountry?.type, "select");
    assert.strictEqual(currentCountry?.optionsSource, "countries");
  });

  it("every repeater has nested fields and presentation metadata or an explicit exception", () => {
    const exceptions = new Set([
      // Workflow/system repeaters without client chrome can be documented here.
    ]);
    const missing = [];
    for (const page of definition.pages) {
      collectQuestions(page.questions, (question) => {
        if (question.type !== "repeater") return;
        if (exceptions.has(question.id)) return;
        if (!Array.isArray(question.metadata?.fields) || question.metadata.fields.length === 0) {
          missing.push(`${page.route} / ${question.answerKey}: no nested fields`);
        }
        if (!question.metadata?.presentation?.columns?.length) {
          missing.push(`${page.route} / ${question.answerKey}: no presentation columns`);
        }
      });
    }
    assert.deepStrictEqual(missing, [], `Repeaters missing parity metadata: ${missing.join("; ")}`);
  });
});
