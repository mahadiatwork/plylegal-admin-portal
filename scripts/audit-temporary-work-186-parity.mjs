/* Employer Nomination Visa (Subclass 186) questionnaire parity audit.
 * Usage: node scripts/audit-temporary-work-186-parity.mjs
 * Generates JSON + Markdown reports in output/temporary-work-186-parity/.
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
const outputDir = path.resolve(__dirname, "../output/temporary-work-186-parity");

const SHARED_ROUTES = [
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

const EXPECTED_ROUTES = [
  ...SHARED_ROUTES.slice(0, 10),
  "/intake/temporary-work/spouse-partner/education",
  "/intake/temporary-work/spouse-partner/language",
  ...SHARED_ROUTES.slice(10),
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
  if (!presentation.actions?.edit || !presentation.actions?.delete) {
    issues.push({ category: "missing_presentation_actions", message: `Repeater "${question.answerKey}" is missing action copy`, ...base });
  }
  if (question.metadata?.collection === "object" && presentation.addLabel) {
    issues.push({ category: "fixed_group_has_add_action", message: `Fixed object group "${question.answerKey}" must not expose an add action`, ...base });
  }
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
  if (page.introBlocks?.[0]?.text !== "In this section, provide details about the main applicant's employment history.") {
    issues.push({ category: "wrong_page_copy", message: "Employment intro does not match the client", ...base });
  }
  const history = (page.questions || []).find((question) => question.answerKey === "employment_history");
  if (!history) {
    issues.push({ category: "missing_fixture", message: "Employment history repeater is missing", ...base });
    return;
  }
  if (history.label !== "Employment History (last 10 years)") {
    issues.push({ category: "wrong_copy", message: `Employment history label is "${history.label}"`, ...base });
  }
  if (history.description !== "Enter details of your employment history for the previous 10 years") {
    issues.push({ category: "wrong_copy", message: "Employment history help is not the ten-year wording", ...base });
  }
  const visaHeld = (history.metadata.fields || []).find((field) => field.answerKey === "visa_held");
  if (!visaHeld) {
    issues.push({ category: "missing_fixture", message: "186 employment history is missing visa_held", ...base });
  } else {
    if (!Array.isArray(visaHeld.visaContexts) || visaHeld.visaContexts.join(",") !== "186") {
      issues.push({ category: "wrong_context", message: "visa_held must be restricted to 186", ...base });
    }
    if (visaHeld.visibleIf?.[0]?.field !== "country" || visaHeld.visibleIf?.[0]?.value !== "Australia") {
      issues.push({ category: "wrong_condition", message: "visa_held must be visible only when country is Australia", ...base });
    }
    if (visaHeld.metadata?.validation?.rules?.[0]?.id !== "requiredWhenEquals") {
      issues.push({ category: "wrong_validation", message: "visa_held must be conditionally required for Australia", ...base });
    }
    if (visaHeld.label !== "What visa(s) were held during this period?") {
      issues.push({ category: "wrong_copy", message: "visa_held label does not match the client", ...base });
    }
    if (visaHeld.placeholder !== "e.g., Employer Nomination (subclass 186)") {
      issues.push({ category: "wrong_copy", message: "visa_held placeholder does not match the client", ...base });
    }
  }
  const coverageRule = (history.metadata?.validation?.rules || []).find((rule) => rule.id === "continuousHistoryCoverage");
  if (coverageRule) {
    issues.push({ category: "wrong_validation", message: "186 must not invent a continuous coverage rule", ...base });
  }
  const expectedColumns = ["Date From", "Date To", "Status", "Position", "Employer", "Duties", "Country"];
  const actualColumns = history.metadata?.presentation?.columns?.map((column) => column.label) || [];
  if (actualColumns.join("|") !== expectedColumns.join("|")) {
    issues.push({ category: "wrong_presentation", message: `Employment columns are ${actualColumns.join(", ")}`, ...base });
  }
}

function auditSpouseEducation(page, issues) {
  const base = { pageId: page?.id, route: page?.route };
  if (!page) {
    issues.push({ category: "missing_fixture", message: "Spouse Education page is missing", ...base });
    return;
  }
  if (page.title !== "Spouse/Partner's Education") {
    issues.push({ category: "wrong_page_copy", message: `Education title is "${page.title}"`, ...base });
  }
  if (page.introBlocks?.[0]?.text !== "In this section, provide details about the spouse/partner's education history.") {
    issues.push({ category: "wrong_page_copy", message: "Education intro does not match the client", ...base });
  }
  const repeaters = (page.questions || []).filter((question) => question.answerKey === "education_history");
  const history = repeaters[0];
  if (!history) {
    issues.push({ category: "missing_fixture", message: "Education history repeater is missing", ...base });
    return;
  }
  if (storedFieldCount(history.metadata.fields) !== 18) {
    issues.push({ category: "wrong_field_count", message: `Education history stores ${storedFieldCount(history.metadata.fields)} fields`, ...base });
  }
  const expectedColumns = ["Institution", "Qualification", "Course Name", "Year Started", "Country"];
  const actualColumns = history.metadata?.presentation?.columns?.map((column) => column.label) || [];
  if (actualColumns.join("|") !== expectedColumns.join("|")) {
    issues.push({ category: "wrong_presentation", message: `Education columns are ${actualColumns.join(", ")}`, ...base });
  }
  if (history.metadata?.presentation?.sections?.[0]?.heading !== "Institution Details") {
    issues.push({ category: "missing_presentation_sections", message: "Education popup is missing the Institution Details heading", ...base });
  }
  const country = (history.metadata.fields || []).find((field) => field.answerKey === "country");
  if (country?.type !== "select" || country?.optionsSource !== "countries") {
    issues.push({ category: "wrong_option_source", message: "Education country must use the country source", ...base });
  }
  const qualification = (history.metadata.fields || []).find((field) => field.answerKey === "qualification");
  const expectedQualifications = ["Secondary", "Diploma/Certificate", "Bachelor's", "Master's", "Doctorate/PhD", "Other"];
  if ((qualification?.options?.map((option) => option.value) || []).join("|") !== expectedQualifications.join("|")) {
    issues.push({ category: "wrong_options", message: "Education qualification options do not match the client", ...base });
  }
  const status = (history.metadata.fields || []).find((field) => field.answerKey === "course_status");
  const expectedStatuses = ["Completed", "Current/Ongoing", "Deferred", "Withdrawn"];
  if ((status?.options?.map((option) => option.value) || []).join("|") !== expectedStatuses.join("|")) {
    issues.push({ category: "wrong_options", message: "Education course status options do not match the client", ...base });
  }
}

function auditSpouseLanguage(page, issues) {
  const base = { pageId: page?.id, route: page?.route };
  if (!page) {
    issues.push({ category: "missing_fixture", message: "Spouse Language page is missing", ...base });
    return;
  }
  if (page.title !== "Spouse/Partner's Language") {
    issues.push({ category: "wrong_page_copy", message: `Language title is "${page.title}"`, ...base });
  }
  if (page.introBlocks?.[0]?.text !== "In this section, provide details about the spouse/partner's language proficiency.") {
    issues.push({ category: "wrong_page_copy", message: "Language intro does not match the client", ...base });
  }
  const byKey = new Map((page.questions || []).map((question) => [question.answerKey, question]));
  for (const key of ["is_english_main_language", "languages", "has_english_test", "english_tests", "studied_in_english", "studied_in_english_details"]) {
    if (!byKey.has(key)) issues.push({ category: "missing_fixture", message: `Language page is missing "${key}"`, ...base });
  }
  const languages = byKey.get("languages");
  if (languages) {
    if (languages.label !== "Languages Used") issues.push({ category: "wrong_copy", message: "Languages Used heading mismatch", ...base });
    if (storedFieldCount(languages.metadata.fields) !== 3) issues.push({ category: "wrong_field_count", message: "Languages must keep three fields", ...base });
  }
  const tests = byKey.get("english_tests");
  if (tests) {
    if (tests.label !== "English Test Results") issues.push({ category: "wrong_copy", message: "English Test Results heading mismatch", ...base });
    if (storedFieldCount(tests.metadata.fields) !== 11) issues.push({ category: "wrong_field_count", message: "English tests must keep eleven stored fields", ...base });
    const expectedColumns = ["Date", "Test Type", "Location", "Reference Number", "Overall Score"];
    const actualColumns = tests.metadata?.presentation?.columns?.map((column) => column.label) || [];
    if (actualColumns.join("|") !== expectedColumns.join("|")) {
      issues.push({ category: "wrong_presentation", message: `English test columns are ${actualColumns.join(", ")}`, ...base });
    }
    const expectedTypes = ["IELTS Academic", "IELTS General", "PTE Academic", "TOEFL iBT", "OET", "Other"];
    const testType = (tests.metadata.fields || []).find((field) => field.answerKey === "test_type");
    if ((testType?.options?.map((option) => option.value) || []).join("|") !== expectedTypes.join("|")) {
      issues.push({ category: "wrong_options", message: "English test type options do not match the client", ...base });
    }
  }
  const details = byKey.get("studied_in_english_details");
  if (details) {
    if (details.rows !== 4) issues.push({ category: "wrong_presentation", message: "Studied-in-English textarea must be four rows", ...base });
    if (!details.placeholder?.startsWith("e.g. University of Melbourne") || !details.placeholder.includes("2018") || !details.placeholder.includes("2021")) {
      issues.push({ category: "wrong_copy", message: "Studied-in-English placeholder mismatch", ...base });
    }
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
        if (!Array.isArray(contexts) || !contexts.includes("186")) {
          issues.push({ category: "wrong_context", message: "visa_held must be present for 186", ...base });
        }
      }

      if (Array.isArray(question.followUps)) auditTree(question.followUps, scopeKeys, `${questionPath}.followUps`);
      if (Array.isArray(question.metadata?.fields)) auditTree(question.metadata.fields, new Set(), `${questionPath}.metadata.fields`);
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

function collectSemanticPaths(page) {
  const paths = new Set();
  collectQuestions(page.questions, (question) => {
    paths.add(question.answerKey);
  });
  return paths;
}

function main() {
  const definition = getBuiltInQuestionnaireDefinition({ visaType: "temporary-work", visaContext: "186" });
  if (!definition) {
    console.error("No 186 definition found");
    process.exit(1);
  }

  const issues = [];
  const adminRoutes = definition.pages.map((page) => page.route);

  if (definition.pages.length !== 28) {
    issues.push({ category: "route_inventory", message: `186 has ${definition.pages.length} pages (expected 28)` });
  }
  for (const route of EXPECTED_ROUTES) {
    if (!adminRoutes.includes(route)) issues.push({ category: "missing_in_admin", message: `Missing 186 page ${route}`, route });
  }
  for (const route of adminRoutes) {
    if (!EXPECTED_ROUTES.includes(route)) issues.push({ category: "extra_in_admin", message: `Unexpected 186 page ${route}`, route });
  }

  const legacyPages = definition.pages.filter((page) => page.metadata?.renderer === "legacy").length;
  const dynamicPages = definition.pages.filter((page) => page.metadata?.renderer !== "legacy" && page.questions?.length).length;
  if (legacyPages !== 27) issues.push({ category: "renderer_inventory", message: `Expected 27 legacy pages, found ${legacyPages}` });
  if (dynamicPages !== 1) issues.push({ category: "renderer_inventory", message: `Expected 1 dynamic page, found ${dynamicPages}` });

  const allIds = new Set();
  definition.pages.forEach((page) => {
    auditPage(page, allIds, issues);
    auditStorageOnly(page, issues);
  });

  auditEmployment(definition.pages.find((page) => page.route === "/intake/temporary-work/main-applicant/employment"), issues);
  auditSpouseEducation(definition.pages.find((page) => page.route === "/intake/temporary-work/spouse-partner/education"), issues);
  auditSpouseLanguage(definition.pages.find((page) => page.route === "/intake/temporary-work/spouse-partner/language"), issues);

  const definition482 = getBuiltInQuestionnaireDefinition({ visaType: "temporary-work", visaContext: "482" });
  if (definition482) {
    const routes482 = definition482.pages.map((page) => page.route);
    for (const route of ["/intake/temporary-work/spouse-partner/education", "/intake/temporary-work/spouse-partner/language"]) {
      if (routes482.includes(route)) issues.push({ category: "context_leak", message: `482 must not contain ${route}`, route });
    }
    collectQuestions(definition482.pages.flatMap((page) => page.questions || []), (question) => {
      if (question.answerKey === "visa_held") {
        issues.push({ category: "context_leak", message: "482 must not contain visa_held" });
      }
    });
    const skills482 = definition482.pages.find((page) => page.route === "/intake/temporary-work/main-applicant/skills");
    const skills186 = definition.pages.find((page) => page.route === "/intake/temporary-work/main-applicant/skills");
    const paths482 = collectSemanticPaths(skills482);
    const paths186 = collectSemanticPaths(skills186);
    const missing = [...paths482].filter((key) => !paths186.has(key));
    const extra = [...paths186].filter((key) => !paths482.has(key));
    if (missing.length || extra.length) {
      issues.push({ category: "shared_skills_divergence", message: `Skills path mismatch. Missing: ${missing.join(", ") || "none"}; extra: ${extra.join(", ") || "none"}` });
    }
  }

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
    spousePages: definition.pages.filter((page) => page.route.includes("/spouse-partner/")).length,
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
  if (summary.spousePages !== 5) issues.push({ category: "route_inventory", message: `Expected five spouse pages, found ${summary.spousePages}` });

  const issuesByCategory = {};
  issues.forEach((issue) => {
    issuesByCategory[issue.category] = issuesByCategory[issue.category] || [];
    issuesByCategory[issue.category].push(issue);
  });
  summary.issues = issues.length;

  const report = { summary, typeDistribution, issues, issuesByCategory, adminRoutes, expectedRoutes: EXPECTED_ROUTES };

  ensureDirectory(outputDir);
  fs.writeFileSync(path.join(outputDir, "audit-report.json"), JSON.stringify(report, null, 2));

  const markdownLines = [
    "# Employer Nomination Visa (Subclass 186) Parity Audit",
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
    `| Spouse pages | ${summary.spousePages} |`,
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

  console.log(`186 parity audit written to ${outputDir}`);
  console.log(`  Unresolved issues: ${summary.issues}`);
  if (issues.length > 0) process.exitCode = 1;
}

main();
