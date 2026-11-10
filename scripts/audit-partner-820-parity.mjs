/* Partner Visa (Subclass 820) questionnaire parity audit.
 * Usage: node scripts/audit-partner-820-parity.mjs
 * Generates JSON + Markdown reports in output/partner-820-parity/.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getBuiltInQuestionnaireDefinition } from "../src/lib/questionnaireBuiltIns.js";
import {
  QUESTIONNAIRE_OPTION_SOURCES,
  QUESTIONNAIRE_ROW_FORMATTERS,
  QUESTIONNAIRE_VALIDATOR_IDS,
} from "../src/lib/questionnaireDefinitions.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const outputDir = path.resolve(__dirname, "../output/partner-820-parity");
const EMPLOYMENT = "/intake/partner/main-applicant/employment";

function ensureDirectory(directory) {
  fs.mkdirSync(directory, { recursive: true });
}

function collectQuestions(questions, callback, prefix = "") {
  (questions || []).forEach((question, index) => {
    const questionPath = `${prefix}[${index}]`;
    callback(question, questionPath);
    collectQuestions(question.followUps, callback, `${questionPath}.followUps`);
    collectQuestions(question.metadata?.fields, callback, `${questionPath}.metadata.fields`);
  });
}

function countNodes(questions) {
  let count = 0;
  collectQuestions(questions, () => { count += 1; });
  return count;
}

function isDateFragment(question) {
  return /(?:^|_)(day|month|year)$/.test(question.answerKey || "")
    && ["text", "select"].includes(question.type);
}

function isCountryLike(question) {
  return /country|nationality|citizenship/i.test(question.answerKey || "")
    && !/country_?code|countrycode/i.test(question.answerKey || "")
    && ["text", "select"].includes(question.type);
}

function findQuestion(questions, answerKey) {
  let found = null;
  collectQuestions(questions, (question) => {
    if (!found && question.answerKey === answerKey) found = question;
  });
  return found;
}

function auditEmployment(page, issues) {
  const base = { pageId: page?.id, route: page?.route };
  if (!page) {
    issues.push({ category: "missing_fixture", message: "Employment page is missing", ...base });
    return;
  }
  if (page.title !== "Main Applicant's Employment") {
    issues.push({ category: "wrong_page_copy", message: `Employment title is "${page.title}"`, ...base });
  }
  const history = findQuestion(page.questions, "employment_history");
  if (!history) {
    issues.push({ category: "missing_fixture", message: "Employment history is missing", ...base });
    return;
  }
  if (history.label !== "Employment History") {
    issues.push({ category: "wrong_copy", message: "Employment history heading mismatch", ...base });
  }
  if (history.description !== "Enter details of all of your employment and unemployment since birth. There can be no gaps in dates.") {
    issues.push({ category: "wrong_copy", message: "Employment history help mismatch", ...base });
  }
  const expectedColumns = ["Date From", "Date To", "Status", "Position", "Country"];
  const actualColumns = history.metadata?.presentation?.columns?.map((column) => column.label) || [];
  if (actualColumns.join("|") !== expectedColumns.join("|")) {
    issues.push({ category: "wrong_presentation", message: `Employment columns are ${actualColumns.join(", ")}`, ...base });
  }
  if (history.metadata?.fields?.find((field) => field.answerKey === "business_address_street_line2")?.metadata?.storageOnly !== true) {
    issues.push({ category: "storage_only_visible", message: "business_address_street_line2 must be storage-only", ...base });
  }
  if ((history.metadata?.validation?.rules || []).some((rule) => rule.id === "continuousHistoryCoverage")) {
    issues.push({ category: "wrong_validation", message: "Partner employment must not invent continuous coverage", ...base });
  }
  for (const key of ["date_from", "date_to", "country"]) {
    const question = findQuestion(history.metadata.fields, key);
    if (key === "country" && (question?.type !== "select" || question?.optionsSource !== "countries")) {
      issues.push({ category: "wrong_option_source", message: "Employment country must use the country source", ...base });
    }
  }
  if (!findQuestion(page.questions, "is_currently_employed")?.required) {
    issues.push({ category: "wrong_requiredness", message: "Current employment question must be required", ...base });
  }
}

function auditRelationships(definition, issues) {
  const expected = {
    "/intake/partner/relationships/current-relationship": "relationships.currentRelationship",
    "/intake/partner/relationships/relationship-details": "relationships.relationshipDetails",
    "/intake/partner/relationships/previous-relationships": "relationships.previousRelationships",
    "/intake/partner/relationships/supporting-witnesses": "relationships.supportingWitnesses",
  };
  for (const [route, storagePath] of Object.entries(expected)) {
    const page = definition.pages.find((candidate) => candidate.route === route);
    if (!page) {
      issues.push({ category: "missing_in_admin", message: `Missing relationship page ${route}`, route });
      continue;
    }
    if (page.metadata?.storagePath !== storagePath) {
      issues.push({ category: "wrong_storage_path", message: `${route} storage is "${page.metadata?.storagePath}"`, route });
    }
    if (!Array.isArray(page.metadata?.legacyStorageAliases) || page.metadata.legacyStorageAliases.length === 0) {
      issues.push({ category: "wrong_storage_path", message: `${route} is missing its legacy storage alias`, route });
    }
  }

  const previous = definition.pages.find((page) => page.route === "/intake/partner/relationships/previous-relationships");
  for (const [listKey, controller] of [
    ["applicant_previous_relationships_list", "applicant_previous_relationships"],
    ["spouse_previous_relationships_list", "spouse_previous_relationships"],
  ]) {
    const list = previous?.questions.find((question) => question.answerKey === listKey);
    if (list?.visibleIf?.[0]?.field !== controller) {
      issues.push({ category: "wrong_condition", message: `${listKey} is not conditional on ${controller}`, route: previous?.route });
    }
  }

  const witnesses = definition.pages.find((page) => page.route === "/intake/partner/relationships/supporting-witnesses");
  if (witnesses?.title !== "Supporting Witnesses for Current Relationship") {
    issues.push({ category: "wrong_page_copy", message: `Witness title is "${witnesses?.title}"`, route: witnesses?.route });
  }
  const witnessRepeater = witnesses?.questions.find((question) => question.answerKey === "supporting_witnesses");
  const minRule = witnessRepeater?.metadata?.validation?.rules?.find((rule) => rule.id === "minimumRows");
  if (minRule?.config?.min !== 2) {
    issues.push({ category: "wrong_validation", message: "Witnesses must require a minimum of two rows", route: witnesses?.route });
  }
  const birth = findQuestion(witnessRepeater?.metadata?.fields, "birth");
  if (birth) {
    if (birth.type !== "dateParts" || birth.label !== "Date of Birth") {
      issues.push({ category: "wrong_copy", message: `Witness date of birth group is "${birth.label}"`, route: witnesses?.route });
    }
  } else {
    for (const key of ["birth_day", "birth_month", "birth_year"]) {
      const field = findQuestion(witnessRepeater?.metadata?.fields, key);
      if (field && field.label !== "Date of Birth") {
        issues.push({ category: "wrong_copy", message: `Witness ${key} label is "${field?.label}"`, route: witnesses?.route });
      }
    }
  }
}

function auditCharacter(definition, issues) {
  const page = definition.pages.find((candidate) => candidate.route === "/intake/partner/all-applicants/character");
  if (!page) {
    issues.push({ category: "missing_fixture", message: "All Applicants Character is missing", route: "/intake/partner/all-applicants/character" });
    return;
  }
  if (!Array.isArray(page.introBlocks) || page.introBlocks.length < 2) {
    issues.push({ category: "missing_page_copy", message: "Character instructions are missing", route: page.route });
  }
  const repeaters = page.questions.filter((question) => question.type === "repeater");
  const controllers = page.questions.filter((question) => question.type === "yesNo");
  if (repeaters.length !== 27) issues.push({ category: "wrong_field_count", message: `Character has ${repeaters.length} detail lists`, route: page.route });
  if (controllers.length !== 27) issues.push({ category: "wrong_field_count", message: `Character has ${controllers.length} declarations`, route: page.route });
  const unconditioned = repeaters.filter((question) => !question.visibleIf?.length);
  if (unconditioned.length) {
    issues.push({ category: "wrong_condition", message: `${unconditioned.length} Character lists have no visibility rule`, route: page.route });
  }
}

function auditHealth(definition, issues) {
  const page = definition.pages.find((candidate) => candidate.route === "/intake/partner/all-applicants/health");
  if (!page) {
    issues.push({ category: "missing_fixture", message: "Partner Health page is missing" });
    return;
  }
  for (const key of ["close_contact_tb", "tuberculosis_exposure_details"]) {
    if (!findQuestion(page.questions, key)) {
      issues.push({ category: "missing_in_admin", message: `Health is missing ${key}`, route: page.route });
    }
  }
  if (findQuestion(page.questions, "health_insurance")) {
    issues.push({ category: "inactive_source", message: "Commented Health Insurance must not be active", route: page.route });
  }
  const tb = findQuestion(page.questions, "tuberculosis_exposure_details");
  if (tb?.metadata?.fields?.[0]?.answerKey === "applicant_name" && tb.metadata.fields[0].optionsSource !== "applicants") {
    issues.push({ category: "wrong_option_source", message: "TB exposure applicant must use the applicants source", route: page.route });
  }
}

function auditAddresses(definition, issues) {
  const page = definition.pages.find((candidate) => candidate.route === "/intake/partner/all-applicants/addresses");
  const repeaters = page?.questions.find((question) => question.answerKey === "address_history");
  const selector = findQuestion(repeaters?.metadata?.fields, "applicant_ids");
  if (selector?.type !== "select" || selector?.optionsSource !== "applicants") {
    issues.push({ category: "wrong_type", message: "applicant_ids must be a multi-applicant selector", route: page?.route });
  }
}

function auditPage(page, allIds, issues) {
  const pageStorageKeys = new Set();

  function auditTree(questions, scopeKeys, scopeLabel) {
    (questions || []).forEach((question, index) => {
      const questionPath = `${scopeLabel}[${index}]`;
      const base = { pageId: page.id, route: page.route, questionId: question.id, answerKey: question.answerKey, path: questionPath };

      if (allIds.has(question.id)) issues.push({ category: "duplicate_id", message: `Duplicate question id "${question.id}"`, ...base });
      allIds.add(question.id);
      if (question.answerKey && scopeKeys.has(question.answerKey)) {
        issues.push({ category: "duplicate_answer_path", message: `Duplicate answer key "${question.answerKey}" in the same scope`, ...base });
      }
      if (question.answerKey) scopeKeys.add(question.answerKey);

      if (isDateFragment(question) && !question.metadata?.storageOnly) {
        issues.push({ category: "date_fragment_not_grouped", message: `Date fragment "${question.answerKey}" is not grouped dateParts`, ...base });
      }
      if (isCountryLike(question) && question.type === "text") {
        issues.push({ category: "country_not_option_source", message: `Country field "${question.answerKey}" is plain text`, ...base });
      }
      if (question.optionsSource && !QUESTIONNAIRE_OPTION_SOURCES.includes(question.optionsSource)) {
        issues.push({ category: "unallowlisted_option_source", message: `Option source "${question.optionsSource}" is not allowlisted`, ...base });
      }
      for (const rule of question.metadata?.validation?.rules || []) {
        if (!QUESTIONNAIRE_VALIDATOR_IDS.includes(rule.id)) {
          issues.push({ category: "unallowlisted_validator", message: `Validator "${rule.id}" is not allowlisted`, ...base });
        }
      }
      for (const column of question.metadata?.presentation?.columns || []) {
        if (column.format && !QUESTIONNAIRE_ROW_FORMATTERS.includes(column.format)) {
          issues.push({ category: "unallowlisted_formatter", message: `Column formatter "${column.format}" is not allowlisted`, ...base });
        }
      }
      if (question.type === "repeater") {
        if (!Array.isArray(question.metadata?.fields) || question.metadata.fields.length === 0) {
          issues.push({ category: "missing_nested_fields", message: `Repeater "${question.answerKey}" has no nested fields`, ...base });
        }
        if (!question.metadata?.presentation?.columns?.length) {
          issues.push({ category: "missing_presentation", message: `Repeater "${question.answerKey}" has no presentation columns`, ...base });
        }
        if (question.metadata?.collection === "object" && question.metadata?.presentation?.addLabel) {
          issues.push({ category: "fixed_group_has_add_action", message: `Fixed object "${question.answerKey}" exposes an add action`, ...base });
        }
      }

      if (Array.isArray(question.followUps)) auditTree(question.followUps, scopeKeys, `${questionPath}.followUps`);
      if (Array.isArray(question.metadata?.fields)) auditTree(question.metadata.fields, new Set(), `${questionPath}.metadata.fields`);
    });
  }

  auditTree(page.questions, pageStorageKeys, "questions");
}

function main() {
  const definition = getBuiltInQuestionnaireDefinition({ visaType: "partner" });
  if (!definition) {
    console.error("No Partner definition found");
    process.exit(1);
  }

  const issues = [];
  if (definition.pages.length !== 43) {
    issues.push({ category: "route_inventory", message: `Partner has ${definition.pages.length} pages (expected 43)` });
  }
  const legacyPages = definition.pages.filter((page) => page.metadata?.renderer === "legacy").length;
  if (legacyPages !== 43) issues.push({ category: "renderer_inventory", message: `Expected 43 legacy pages, found ${legacyPages}` });

  const allIds = new Set();
  definition.pages.forEach((page) => auditPage(page, allIds, issues));

  auditEmployment(definition.pages.find((page) => page.route === EMPLOYMENT), issues);
  auditRelationships(definition, issues);
  auditCharacter(definition, issues);
  auditHealth(definition, issues);
  auditAddresses(definition, issues);

  const summary = {
    generatedAt: new Date().toISOString(),
    pages: definition.pages.length,
    legacyPages,
    dynamicPages: definition.pages.filter((page) => page.metadata?.renderer !== "legacy").length,
    topLevelQuestions: definition.pages.reduce((sum, page) => sum + (page.questions?.length || 0), 0),
    totalQuestionNodes: countNodes(definition.pages.flatMap((page) => page.questions || [])),
    repeaters: 0,
    repeatersWithPresentation: 0,
    questionsWithValidation: 0,
    questionsWithConditions: 0,
    pagesWithNoIntro: 0,
    issues: issues.length,
  };
  const typeDistribution = {};
  collectQuestions(definition.pages.flatMap((page) => page.questions || []), (question) => {
    typeDistribution[question.type] = (typeDistribution[question.type] || 0) + 1;
    if (question.type === "repeater") {
      summary.repeaters += 1;
      if (question.metadata?.presentation?.columns?.length) summary.repeatersWithPresentation += 1;
    }
    if (question.metadata?.validation?.rules?.length) summary.questionsWithValidation += 1;
    if (Array.isArray(question.visibleIf) && question.visibleIf.length) summary.questionsWithConditions += 1;
  });
  definition.pages.forEach((page) => {
    if (!Array.isArray(page.introBlocks) || page.introBlocks.length === 0) summary.pagesWithNoIntro += 1;
  });

  const issuesByCategory = {};
  issues.forEach((issue) => {
    issuesByCategory[issue.category] = issuesByCategory[issue.category] || [];
    issuesByCategory[issue.category].push(issue);
  });
  summary.issues = issues.length;

  const report = { summary, typeDistribution, issues, issuesByCategory, routes: definition.pages.map((page) => page.route) };
  ensureDirectory(outputDir);
  fs.writeFileSync(path.join(outputDir, "audit-report.json"), JSON.stringify(report, null, 2));

  const markdownLines = [
    "# Partner Visa (Subclass 820) Parity Audit",
    "",
    `Generated: ${summary.generatedAt}`,
    "",
    "## Summary",
    "",
    "| Measure | Value |",
    "| --- | ---: |",
    `| Pages | ${summary.pages} |`,
    `| Legacy pages | ${summary.legacyPages} |`,
    `| Dynamic pages | ${summary.dynamicPages} |`,
    `| Top-level questions | ${summary.topLevelQuestions} |`,
    `| Total question nodes | ${summary.totalQuestionNodes} |`,
    `| Repeaters | ${summary.repeaters} |`,
    `| Repeaters with presentation | ${summary.repeatersWithPresentation} |`,
    `| Questions with validation rules | ${summary.questionsWithValidation} |`,
    `| Questions with conditions | ${summary.questionsWithConditions} |`,
    `| Pages with no intro | ${summary.pagesWithNoIntro} |`,
    `| Unresolved issues | ${summary.issues} |`,
    "",
    "## Type distribution",
    "",
    "| Type | Count |",
    "| --- | ---: |",
    ...Object.entries(typeDistribution).sort((a, b) => b[1] - a[1]).map(([type, count]) => `| ${type} | ${count} |`),
    "",
    "## Issues by category",
    "",
  ];

  for (const [category, categoryIssues] of Object.entries(issuesByCategory).sort((a, b) => b[1].length - a[1].length)) {
    markdownLines.push(`### ${category} (${categoryIssues.length})`, "");
    categoryIssues.slice(0, 80).forEach((issue) => {
      const context = [issue.route, issue.questionId, issue.answerKey].filter(Boolean).join(" / ");
      markdownLines.push(`- ${issue.message}${context ? ` (${context})` : ""}`);
    });
    if (categoryIssues.length > 80) markdownLines.push(`- ... and ${categoryIssues.length - 80} more`);
    markdownLines.push("");
  }

  fs.writeFileSync(path.join(outputDir, "audit-report.md"), markdownLines.join("\n"));

  console.log(`Partner 820 parity audit written to ${outputDir}`);
  console.log(`  Unresolved issues: ${summary.issues}`);
  if (issues.length > 0) process.exitCode = 1;
}

main();
