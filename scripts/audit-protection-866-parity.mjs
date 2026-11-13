/* Protection Visa (Subclass 866) questionnaire parity audit.
 * Usage: node scripts/audit-protection-866-parity.mjs
 * Generates JSON + Markdown reports in output/protection-866-parity/.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getBuiltInQuestionnaireDefinition } from "../src/lib/questionnaireBuiltIns.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientRoot = path.resolve(__dirname, "../../plylegal-client-portal");
const outputDir = path.resolve(__dirname, "../output/protection-866-parity");

const KNOWN_SHARED_OPTION_SOURCES = new Set(["countries", "daysOfMonth", "months", "rollingYears", "applicants"]);
const KNOWN_FORMATTERS = new Set(["protectionDate", "protectionDateOrOngoing"]);
const KNOWN_VALIDATORS = new Set([
  "datePartsAllOrNone",
  "dateToNotBeforeDateFrom",
  "maxLength",
  "requiredWhenStatusIn",
  "continuousHistoryCoverage",
]);
const KNOWN_TOKENS = new Set(["{mainApplicantName}", "{spouseName}", "{profileName}"]);

function ensureDirectory(directory) {
  fs.mkdirSync(directory, { recursive: true });
}

function collectQuestions(questions, callback, prefix = "") {
  (questions || []).forEach((question, index) => {
    const path = `${prefix}[${index}]`;
    callback(question, path);
    collectQuestions(question.followUps, callback, `${path}.followUps`);
    collectQuestions(question.metadata?.fields, callback, `${path}.metadata.fields`);
  });
}

function countNodes(questions) {
  let count = 0;
  collectQuestions(questions, () => { count += 1; });
  return count;
}

function countByType(questions) {
  const counts = {};
  collectQuestions(questions, (question) => {
    counts[question.type] = (counts[question.type] || 0) + 1;
  });
  return counts;
}

function collectRepeaters(questions, callback, prefix = "") {
  collectQuestions(questions, (question, path) => {
    if (question.type === "repeater") callback(question, path);
  }, prefix);
}

function isDateFragment(question) {
  return /(?:^|_)(day|month|year)$/.test(question.answerKey || "") && question.type === "text";
}

function isCountryLike(question) {
  const answerKey = question.answerKey || "";
  return !/(?:^|_)country_code$/.test(answerKey)
    && /country|nationality|citizenship/i.test(answerKey)
    && question.type === "text";
}

function exportedArray(source, name) {
  const declaration = `export const ${name}`;
  const start = source.indexOf(declaration);
  if (start < 0) throw new Error(`Could not find ${name} in the client route registry`);
  const open = source.indexOf("[", start);
  const close = source.indexOf("];", open);
  if (open < 0 || close < 0) throw new Error(`Could not parse ${name} in the client route registry`);
  return source.slice(open, close + 1);
}

function loadClientRouteTemplates() {
  const routeFile = path.join(clientRoot, "src/lib/routes.js");
  const source = fs.readFileSync(routeFile, "utf8");
  const routes = [
    ...exportedArray(source, "PROTECTION_VISA_ROUTES").matchAll(/href:\s*"([^"]+)"/g),
    ...exportedArray(source, "PROTECTION_MAIN_APPLICANT_PROFILE_SUBPAGES").matchAll(/href:\s*"([^"]+)"/g),
    ...exportedArray(source, "PROTECTION_SPOUSE_PROFILE_SUBPAGES").matchAll(/href:\s*"([^"]+)"/g),
  ].map((match) => match[1]).filter((route) =>
    !/(?:start|profile|submit)$/.test(route)
      && route !== "/intake/protection/children"
  );
  for (const match of exportedArray(source, "PROTECTION_CHILD_PROFILE_SUBPAGES").matchAll(/pathSuffix:\s*"([^"]+)"/g)) {
    routes.push(`/intake/protection/children/child-profile/${match[1]}`);
  }
  for (const match of exportedArray(source, "NON_MIGRATING_MEMBER_SUBPAGES").matchAll(/pathSuffix:\s*"([^"]+)"/g)) {
    routes.push(`/intake/protection/non-migrating/member-profile/${match[1]}`);
  }
  return [...new Set(routes)];
}

function auditPage(page) {
  const issues = [];
  const pageId = page.id;
  const route = page.route;

  if (!page.title?.trim()) {
    issues.push({ category: "presentation_not_represented", message: "Page title is missing", pageId, route });
  }
  if (page.metadata?.renderer === "legacy" && !page.metadata?.originalDisplayTitle?.trim()) {
    issues.push({ category: "presentation_not_represented", message: "Legacy page title has no captured display baseline", pageId, route });
  }
  for (const token of page.metadata?.titleTemplate?.match(/\{[^}]+\}/g) || []) {
    if (!KNOWN_TOKENS.has(token)) {
      issues.push({ category: "presentation_not_represented", message: `Page title uses unsupported interpolation token ${token}`, pageId, route });
    }
  }

  if (!Array.isArray(page.introBlocks) || page.introBlocks.length === 0) {
    const pageKnownToNeedIntro = [
      "protection-main-applicant-details",
      "protection-main-applicant-other",
      "protection-main-applicant-identity",
      "protection-main-applicant-employment",
      "protection-spouse-partner-details",
      "protection-spouse-partner-other-details",
      "protection-spouse-partner-identity",
      "protection-children-child-profile-details",
      "protection-children-child-profile-other",
      "protection-children-child-profile-identity",
      "protection-non-migrating-member-profile-details",
      "protection-non-migrating-member-profile-passport",
      "protection-non-migrating-member-profile-identity",
      "protection-non-migrating-member-profile-other-names",
      "protection-non-migrating-member-profile-citizenship",
      "protection-non-migrating-member-profile-health",
      "protection-all-applicants-languages",
    ].includes(pageId);
    if (pageKnownToNeedIntro) {
      issues.push({ category: "presentation_not_represented", message: "Expected page intro block is missing", pageId, route });
    }
  }

  collectQuestions(page.questions, (question, qPath) => {
    if (isDateFragment(question)) {
      issues.push({ category: "type_mismatch", message: `Date fragment "${question.answerKey}" represented as text`, pageId, route, questionId: question.id, answerKey: question.answerKey, path: qPath });
    }
    if (isCountryLike(question) && question.type === "text" && question.optionsSource !== "countries") {
      issues.push({ category: "type_mismatch", message: `Country/nationality field "${question.answerKey}" represented as text`, pageId, route, questionId: question.id, answerKey: question.answerKey, path: qPath });
    }
    if (question.type === "repeater") {
      if (!Array.isArray(question.metadata?.fields) || question.metadata.fields.length === 0) {
        issues.push({ category: "presentation_not_represented", message: `Repeater "${question.answerKey}" has no nested fields`, pageId, route, questionId: question.id, answerKey: question.answerKey, path: qPath });
      }
      const presentation = question.metadata?.presentation;
      if (!presentation || !Array.isArray(presentation.columns) || presentation.columns.length === 0) {
        issues.push({ category: "presentation_not_represented", message: `Repeater "${question.answerKey}" is missing presentation.columns`, pageId, route, questionId: question.id, answerKey: question.answerKey, path: qPath });
      }
    }
  });

  return issues;
}

function main() {
  const definition = getBuiltInQuestionnaireDefinition({ visaType: "protection" });
  if (!definition) {
    console.error("No Protection definition found");
    process.exit(1);
  }

  const activeRoutes = loadClientRouteTemplates();
  const adminRoutes = new Set(definition.pages.map((page) => page.route));
  const missingRoutes = activeRoutes.filter((route) => !adminRoutes.has(route));
  const extraRoutes = [...adminRoutes].filter((route) => !activeRoutes.includes(route));

  const summary = {
    generatedAt: new Date().toISOString(),
    activeClientRoutes: activeRoutes.length,
    adminPages: definition.pages.length,
    topLevelQuestions: definition.pages.reduce((sum, page) => sum + (page.questions?.length || 0), 0),
    totalQuestionNodes: countNodes(definition.pages.flatMap((page) => page.questions || [])),
    repeaters: 0,
    questionsWithDescription: 0,
    questionsWithConditions: 0,
    questionsWithPlaceholder: 0,
    pagesWithNoIntro: 0,
    typeDistribution: {},
  };

  const issues = [];

  missingRoutes.forEach((route) => issues.push({ category: "missing_in_admin", message: `Active route not in admin definition`, route }));
  extraRoutes.forEach((route) => issues.push({ category: "extra_in_admin", message: `Admin page not in active route registry`, route }));

  definition.pages.forEach((page) => {
    if (!Array.isArray(page.introBlocks) || page.introBlocks.length === 0) summary.pagesWithNoIntro += 1;
    issues.push(...auditPage(page));
  });

  collectQuestions(definition.pages.flatMap((page) => page.questions || []), (question) => {
    summary.typeDistribution[question.type] = (summary.typeDistribution[question.type] || 0) + 1;
    if (question.type === "repeater") summary.repeaters += 1;
    if (question.description) summary.questionsWithDescription += 1;
    if (Array.isArray(question.visibleIf) && question.visibleIf.length) summary.questionsWithConditions += 1;
    if (question.placeholder) summary.questionsWithPlaceholder += 1;
  });

  const issuesByCategory = {};
  issues.forEach((issue) => {
    issuesByCategory[issue.category] = issuesByCategory[issue.category] || [];
    issuesByCategory[issue.category].push(issue);
  });

  const report = {
    summary,
    issues,
    issuesByCategory,
    activeRoutes,
    adminRoutes: [...adminRoutes],
    missingRoutes,
    extraRoutes,
  };

  ensureDirectory(outputDir);
  const jsonPath = path.join(outputDir, "audit-report.json");
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));

  const markdownLines = [
    "# Protection Visa (Subclass 866) Parity Audit",
    "",
    `Generated: ${summary.generatedAt}`,
    "",
    "## Summary",
    "",
    "| Measure | Value |",
    "| --- | ---: |",
    `| Active client routes | ${summary.activeClientRoutes} |`,
    `| Admin pages | ${summary.adminPages} |`,
    `| Top-level questions | ${summary.topLevelQuestions} |`,
    `| Total question nodes | ${summary.totalQuestionNodes} |`,
    `| Repeaters | ${summary.repeaters} |`,
    `| Questions with description/help | ${summary.questionsWithDescription} |`,
    `| Questions with conditions | ${summary.questionsWithConditions} |`,
    `| Questions with placeholder | ${summary.questionsWithPlaceholder} |`,
    `| Pages with no intro | ${summary.pagesWithNoIntro} |`,
    "",
    "## Type distribution",
    "",
    "| Type | Count |",
    "| --- | ---: |",
    ...Object.entries(summary.typeDistribution).sort((a, b) => b[1] - a[1]).map(([type, count]) => `| ${type} | ${count} |`),
    "",
    "## Issues by category",
    "",
  ];

  for (const [category, categoryIssues] of Object.entries(issuesByCategory).sort((a, b) => b[1].length - a[1].length)) {
    markdownLines.push(`### ${category} (${categoryIssues.length})`, "");
    categoryIssues.slice(0, 50).forEach((issue) => {
      const context = [issue.route, issue.questionId, issue.answerKey].filter(Boolean).join(" / ");
      markdownLines.push(`- ${issue.message}${context ? ` (${context})` : ""}`);
    });
    if (categoryIssues.length > 50) markdownLines.push(`- ... and ${categoryIssues.length - 50} more`);
    markdownLines.push("");
  }

  const markdownPath = path.join(outputDir, "audit-report.md");
  fs.writeFileSync(markdownPath, markdownLines.join("\n"));

  console.log(`Protection 866 parity audit written to ${outputDir}`);
  console.log(`  JSON: ${jsonPath}`);
  console.log(`  Markdown: ${markdownPath}`);
  console.log(`  Total issues: ${issues.length}`);
  if (issues.length) process.exitCode = 1;
}

main();
