/* Skills in Demand Visa (Subclass 482) questionnaire parity audit.
 * Usage: node scripts/audit-temporary-work-482-parity.mjs
 * Generates JSON + Markdown reports in output/temporary-work-482-parity/.
 *
 * The audit is intentionally read-only. It compares the admin built-in
 * catalog against the audited client contract in the 482 guide and fails
 * (non-zero exit) while any active mismatch remains.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getBuiltInQuestionnaireDefinition } from "../src/lib/questionnaireBuiltIns.js";
import {
  QUESTIONNAIRE_INTERPOLATION_TOKENS,
  QUESTIONNAIRE_OPTION_SOURCES,
  QUESTIONNAIRE_ROW_FORMATTERS,
  QUESTIONNAIRE_VALIDATOR_IDS,
} from "../src/lib/questionnaireDefinitions.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientRoot = path.resolve(__dirname, "../../plylegal-client-portal");
const outputDir = path.resolve(__dirname, "../output/temporary-work-482-parity");

const EXPECTED_ROUTES = [
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

const EXCLUDED_482_ROUTES = [
  "/intake/temporary-work/spouse-partner/education",
  "/intake/temporary-work/spouse-partner/language",
];

const STORAGE_ONLY_KEYS = new Set([
  "still_working",
  "current_end_date_day",
  "current_end_date_month",
  "current_end_date_year",
]);

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
    && ["text", "select"].includes(question.type);
}

function storedFieldCount(fields) {
  return (fields || []).reduce((sum, field) => sum + (field.type === "dateParts" ? 3 : 1), 0);
}

function loadClientRouteSource() {
  const routeFile = path.join(clientRoot, "src/lib/routes.js");
  if (!fs.existsSync(routeFile)) return "";
  return fs.readFileSync(routeFile, "utf8");
}

function auditRepeaterMetadata(page, question, questionPath, issues) {
  if (question.type !== "repeater") return;
  const base = {
    pageId: page.id,
    route: page.route,
    questionId: question.id,
    answerKey: question.answerKey,
    path: questionPath,
  };
  if (!Array.isArray(question.metadata?.fields) || question.metadata.fields.length === 0) {
    issues.push({ category: "missing_nested_fields", message: `Repeater "${question.answerKey}" has no nested fields`, ...base });
  }
  const presentation = question.metadata?.presentation;
  if (!presentation) {
    issues.push({ category: "missing_presentation", message: `Repeater "${question.answerKey}" has no presentation metadata`, ...base });
    return;
  }
  if (!Array.isArray(presentation.columns) || presentation.columns.length === 0) {
    issues.push({ category: "missing_presentation_columns", message: `Repeater "${question.answerKey}" is missing presentation columns`, ...base });
  }
  if (!presentation.actions || !presentation.actions.edit || !presentation.actions.delete) {
    issues.push({ category: "missing_presentation_actions", message: `Repeater "${question.answerKey}" is missing action copy`, ...base });
  }
  if (question.metadata?.collection === "object" && presentation.addLabel) {
    issues.push({ category: "fixed_group_has_add_action", message: `Fixed object group "${question.answerKey}" must not expose an add action`, ...base });
  }
}

function auditSkillsFixture(page, issues) {
  const base = { pageId: page.id || "temporary-work-main-applicant-skills", route: page.route };
  if (!page) {
    issues.push({ category: "missing_fixture", message: "Skills page is missing", ...base });
    return;
  }
  if (page.title !== "Main Applicant's Skills") {
    issues.push({ category: "wrong_page_copy", message: `Skills title is "${page.title}"`, ...base });
  }
  const expectedIntro = "In this section, provide details about the main applicant's professional registrations and skills assessments.";
  if (page.introBlocks?.[0]?.text !== expectedIntro) {
    issues.push({ category: "wrong_page_copy", message: "Skills intro does not match the client", ...base });
  }
  const byKey = new Map((page.questions || []).map((question) => [question.answerKey, question]));
  const registrationGate = byKey.get("has_occupational_registration");
  const assessmentGate = byKey.get("has_skills_assessment");
  if (registrationGate?.label !== "Do you hold any Occupational Registrations, Licences or Professional Memberships?") {
    issues.push({ category: "wrong_copy", message: "Registration gate label mismatch", ...base });
  }
  if (assessmentGate?.label !== "Have you applied for a Skills Assessment from an Australian Skills Assessing body?") {
    issues.push({ category: "wrong_copy", message: "Assessment gate label mismatch", ...base });
  }
  for (const [gate, key, expectedFields] of [
    [registrationGate, "registrations", 13],
    [assessmentGate, "assessments", 12],
  ]) {
    const repeater = byKey.get(key);
    if (!repeater) {
      issues.push({ category: "missing_fixture", message: `Skills repeater "${key}" is missing`, ...base });
      continue;
    }
    if (!Array.isArray(gate?.options) || gate.options.map((o) => o.value).join(",") !== "yes,no") {
      issues.push({ category: "wrong_options", message: `Skills gate "${gate?.answerKey}" must be yes/no`, ...base });
    }
    if (!Array.isArray(repeater.visibleIf) || repeater.visibleIf[0]?.field !== gate?.answerKey) {
      issues.push({ category: "wrong_condition", message: `Skills repeater "${key}" is not conditional on its gate`, ...base });
    }
    if (storedFieldCount(repeater.metadata?.fields || []) !== expectedFields) {
      issues.push({ category: "wrong_field_count", message: `Skills repeater "${key}" stores ${storedFieldCount(repeater.metadata?.fields || [])} fields (expected ${expectedFields})`, ...base });
    }
    for (const field of repeater.metadata?.fields || []) {
      if (field.answerKey === "country") {
        if (field.type !== "select" || field.optionsSource !== "countries") {
          issues.push({ category: "wrong_option_source", message: `Skills ${key}.country does not use the countries source`, ...base });
        }
      }
      if (/(issue|lodgement|expiry|outcome)_date$/.test(field.answerKey)) {
        if (field.type !== "dateParts" || !field.parts?.day || !field.parts?.month || !field.parts?.year) {
          issues.push({ category: "wrong_type", message: `Skills ${key}.${field.answerKey} is not grouped date parts`, ...base });
        }
      }
    }
  }

  const registrations = byKey.get("registrations");
  const assessments = byKey.get("assessments");
  const expectedRegistrationColumns = ["Authority", "Title", "Licence Number", "Year", "Country"];
  const actualRegistrationColumns = registrations?.metadata?.presentation?.columns?.map((column) => column.label) || [];
  if (actualRegistrationColumns.join("|") !== expectedRegistrationColumns.join("|")) {
    issues.push({ category: "wrong_presentation", message: `Registration columns are ${actualRegistrationColumns.join(", ")}`, ...base });
  }
  const expectedAssessmentColumns = ["Authority", "Type", "ANZSCO", "Outcome"];
  const actualAssessmentColumns = assessments?.metadata?.presentation?.columns?.map((column) => column.label) || [];
  if (actualAssessmentColumns.join("|") !== expectedAssessmentColumns.join("|")) {
    issues.push({ category: "wrong_presentation", message: `Assessment columns are ${actualAssessmentColumns.join(", ")}`, ...base });
  }
  if (!assessments?.metadata?.presentation?.sections?.length) {
    issues.push({ category: "missing_presentation_sections", message: "Assessment dialog is missing its internal section headings", ...base });
  }
  const assessmentTypes = assessments?.metadata?.fields?.find((field) => field.answerKey === "assessment_type")?.options?.map((option) => option.value) || [];
  const expectedAssessmentTypes = ["Full Skills Assessment", "Provisional Skills Assessment", "Job Ready Program", "Points Test Advice", "Other"];
  if (assessmentTypes.join("|") !== expectedAssessmentTypes.join("|")) {
    issues.push({ category: "wrong_options", message: "Assessment type options do not match the client", ...base });
  }
  const outcomes = assessments?.metadata?.fields?.find((field) => field.answerKey === "outcome")?.options?.map((option) => option.value) || [];
  const expectedOutcomes = ["Positive", "Negative", "Unexpected", "Pending", "Other"];
  if (outcomes.join("|") !== expectedOutcomes.join("|")) {
    issues.push({ category: "wrong_options", message: "Assessment outcome options do not match the client", ...base });
  }
}

function auditPage(page, allIds, issues) {
  const pageBase = { pageId: page.id, route: page.route };

  if (!page.title) issues.push({ category: "missing_page_title", message: "Page title is missing", ...pageBase });
  if (!page.title) {
    issues.push({ category: "wrong_page_title", message: "Page title looks like a fallback", ...pageBase });
  }

  const pageStorageKeys = new Set();

  function auditTree(questions, scopeKeys, scopeLabel) {
    (questions || []).forEach((question, index) => {
      const questionPath = `${scopeLabel}[${index}]`;
      const base = { pageId: page.id, route: page.route, questionId: question.id, answerKey: question.answerKey, path: questionPath };

      if (allIds.has(question.id)) issues.push({ category: "duplicate_id", message: `Duplicate question id "${question.id}"`, ...base });
      allIds.add(question.id);
      const storageKey = question.answerKey;
      if (storageKey && scopeKeys.has(storageKey)) {
        issues.push({ category: "duplicate_answer_path", message: `Duplicate answer key "${storageKey}" in the same scope`, ...base });
      }
      if (storageKey) scopeKeys.add(storageKey);

      if (isDateFragment(question) && !question.metadata?.storageOnly) {
        issues.push({ category: "date_fragment_not_grouped", message: `Date fragment "${question.answerKey}" is not grouped dateParts`, ...base });
      }
      if (isCountryLike(question) && question.type === "text") {
        issues.push({ category: "country_not_option_source", message: `Country field "${question.answerKey}" is plain text`, ...base });
      }
      if (question.optionsSource && !QUESTIONNAIRE_OPTION_SOURCES.includes(question.optionsSource)) {
        issues.push({ category: "unallowlisted_option_source", message: `Option source "${question.optionsSource}" is not allowlisted`, ...base });
      }
      if (question.label?.includes("{") && !QUESTIONNAIRE_INTERPOLATION_TOKENS.some((token) => question.label.includes(token))) {
        issues.push({ category: "unallowlisted_interpolation", message: "Question label uses an unknown interpolation token", ...base });
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
      if (question.metadata?.presentation?.rowFormatter && !QUESTIONNAIRE_ROW_FORMATTERS.includes(question.metadata.presentation.rowFormatter)) {
        issues.push({ category: "unallowlisted_formatter", message: `Row formatter "${question.metadata.presentation.rowFormatter}" is not allowlisted`, ...base });
      }
      auditRepeaterMetadata(page, question, questionPath, issues);

      if (question.answerKey === "visa_held") {
        const contexts = question.visaContexts || question.metadata?.visaContexts;
        if (!Array.isArray(contexts) || !contexts.includes("186") || contexts.includes("482")) {
          issues.push({ category: "context_leak", message: "186-only visa_held is exposed without a 482 exclusion", ...base });
        }
      }

      if (Array.isArray(question.followUps)) {
        auditTree(question.followUps, scopeKeys, `${questionPath}.followUps`);
      }
      if (Array.isArray(question.metadata?.fields)) {
        auditTree(question.metadata.fields, new Set(), `${questionPath}.metadata.fields`);
      }
    });
  }

  auditTree(page.questions, pageStorageKeys, "questions");
}

function auditStorageOnly(page, issues) {
  collectQuestions(page.questions, (question, questionPath) => {
    if (!STORAGE_ONLY_KEYS.has(question.answerKey)) return;
    if (!question.metadata?.storageOnly) {
      issues.push({
        category: "storage_only_visible",
        message: `Storage-only key "${question.answerKey}" is presented as a normal question`,
        pageId: page.id,
        route: page.route,
        questionId: question.id,
        answerKey: question.answerKey,
        path: questionPath,
      });
    }
  });
}

function main() {
  const definition = getBuiltInQuestionnaireDefinition({ visaType: "temporary-work", visaContext: "482" });
  if (!definition) {
    console.error("No 482 definition found");
    process.exit(1);
  }

  const routeSource = loadClientRouteSource();
  const issues = [];
  const adminRoutes = definition.pages.map((page) => page.route);

  if (definition.pages.length !== EXPECTED_ROUTES.length) {
    issues.push({
      category: "route_inventory",
      message: `482 has ${definition.pages.length} pages (expected ${EXPECTED_ROUTES.length})`,
    });
  }
  for (const route of EXPECTED_ROUTES) {
    if (!adminRoutes.includes(route)) issues.push({ category: "missing_in_admin", message: `Missing 482 page ${route}`, route });
  }
  for (const route of adminRoutes) {
    if (!EXPECTED_ROUTES.includes(route)) issues.push({ category: "extra_in_admin", message: `Unexpected 482 page ${route}`, route });
  }
  for (const route of EXCLUDED_482_ROUTES) {
    if (adminRoutes.includes(route)) issues.push({ category: "context_leak", message: `186-only page ${route} is in the 482 catalog`, route });
    if (routeSource.includes(route) && routeSource.includes("TEMPORARY_WORK_VISA_ROUTES")) {
      // Presence in source is expected; the dynamic builder must exclude it for 482.
    }
  }

  const legacyPages = definition.pages.filter((page) => page.metadata?.renderer === "legacy").length;
  const dynamicPages = definition.pages.filter((page) => page.metadata?.renderer !== "legacy" && page.questions?.length).length;
  if (legacyPages !== 25) issues.push({ category: "renderer_inventory", message: `Expected 25 legacy pages, found ${legacyPages}` });
  if (dynamicPages !== 1) issues.push({ category: "renderer_inventory", message: `Expected 1 dynamic page, found ${dynamicPages}` });

  const allIds = new Set();
  definition.pages.forEach((page) => {
    auditPage(page, allIds, issues);
    auditStorageOnly(page, issues);
  });

  auditSkillsFixture(definition.pages.find((page) => page.route === "/intake/temporary-work/main-applicant/skills"), issues);

  const source480Visa = getBuiltInQuestionnaireDefinition({ visaType: "temporary-work", visaContext: "186" });
  const has186VisaHeld = (() => {
    let found = false;
    for (const page of source480Visa?.pages || []) {
      collectQuestions(page.questions, (question) => { if (question.answerKey === "visa_held") found = true; });
    }
    return found;
  })();
  if (!has186VisaHeld) issues.push({ category: "context_regression", message: "186 lost the visa_held employment field" });

  const summary = {
    generatedAt: new Date().toISOString(),
    pages: definition.pages.length,
    legacyPages,
    dynamicPages,
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

  const report = {
    summary,
    typeDistribution,
    issues,
    issuesByCategory,
    adminRoutes,
    expectedRoutes: EXPECTED_ROUTES,
  };

  ensureDirectory(outputDir);
  const jsonPath = path.join(outputDir, "audit-report.json");
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));

  const markdownLines = [
    "# Skills in Demand Visa (Subclass 482) Parity Audit",
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

  const markdownPath = path.join(outputDir, "audit-report.md");
  fs.writeFileSync(markdownPath, markdownLines.join("\n"));

  console.log(`482 parity audit written to ${outputDir}`);
  console.log(`  JSON: ${jsonPath}`);
  console.log(`  Markdown: ${markdownPath}`);
  console.log(`  Unresolved issues: ${issues.length}`);
  if (issues.length > 0) process.exitCode = 1;
}

main();
