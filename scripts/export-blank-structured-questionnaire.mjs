/* Build the "blank questionnaire with a custom structure" used by the Client Portal e2e proof.
 *
 * It drives the same admin-side functions the builder uses, in the same order an administrator
 * would, then normalises the result exactly as the server does before saving:
 *
 *   1. start from a blank questionnaire (Main Applicant group only)
 *   2. add two newly named Main Applicant sections
 *   3. add questions to them
 *   4. add a Spouse/Partner section and then hide that group (it must never reach clients)
 *   5. reorder the sidebar sections and the questions
 *
 * Usage: node scripts/export-blank-structured-questionnaire.mjs [outFile]
 * Default output: ../plylegal-client-portal/e2e/fixtures/blank-structured-482.json
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { moveItemBlock } from "../src/lib/questionnaireConditionalBranches.js";
import { normalizeQuestionnaireDefinition } from "../src/lib/questionnaireDefinitions.js";
import {
  createCustomSection,
  getGroupPages,
  moveGroupPage,
  setGroupIncluded,
} from "../src/lib/questionnaireNavigationModel.js";
import { getRegisteredQuestionnaireRoutes } from "../src/lib/routes.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const target = path.resolve(process.argv[2] || path.join(__dirname, "../../plylegal-client-portal/e2e/fixtures/blank-structured-482.json"));
const builtInRoutes = getRegisteredQuestionnaireRoutes("temporary-work", ["482"]);

let definition = {
  id: "questionnaire-blank-structured",
  title: "Blank structured questionnaire",
  version: "1.0.0",
  visaType: "temporary-work",
  visaContexts: ["482"],
  status: "draft",
  schemaVersion: 1,
  revision: 0,
  navigation: { mode: "definition", groups: ["main-applicant"] },
  pages: [],
};

const addSection = (title, groupKey = "main-applicant") => {
  const result = createCustomSection(definition, { title, groupKey, builtInRoutes });
  definition = result.definition;
  return result.page;
};
const text = (id, label, required) => ({ id, answerKey: id, label, type: "text", required });
const setQuestions = (pageId, questions) => {
  definition = { ...definition, pages: definition.pages.map((page) => (page.id === pageId ? { ...page, questions } : page)) };
};
const pageById = (id) => definition.pages.find((page) => page.id === id);

const employer = addSection("Employer background");
const authorisation = addSection("Work authorisation");
setQuestions(employer.id, [
  text("employer_name", "Employer name", true),
  text("job_title", "Job title", true),
  text("start_year", "Start year", false),
]);
setQuestions(authorisation.id, [
  {
    id: "holds_visa",
    answerKey: "holds_visa",
    label: "Do you currently hold a work visa?",
    type: "radio",
    required: true,
    options: [{ value: "yes", label: "Yes" }, { value: "no", label: "No" }],
  },
  text("visa_notes", "Anything we should know about your visa?", true),
]);

// A Spouse/Partner section that is then hidden: kept in the definition, never shown to clients.
const spouse = addSection("Partner information", "spouse-partner");
setQuestions(spouse.id, [text("partner_name", "Partner name", true)]);
definition = setGroupIncluded(definition, "spouse-partner", false);

// Reorder the sidebar (Work authorisation first) ...
definition = moveGroupPage(definition, "main-applicant", authorisation.id, -1);
// ... and the questions of the first section (Start year first, as a drop onto Employer name would).
definition = {
  ...definition,
  pages: definition.pages.map((page) => (page.id === employer.id
    ? { ...page, questions: moveItemBlock(page.questions, ["start_year"], ["employer_name"], -1) }
    : page)),
};

const normalized = normalizeQuestionnaireDefinition({ ...definition, status: "active", revision: 1 });
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, `${JSON.stringify(normalized, null, 2)}\n`);

const sidebar = getGroupPages(normalized, "main-applicant").map((page) => page.title);
console.log(`Exported ${normalized.id} to ${target}`);
console.log(`  sidebar: ${sidebar.join(" > ")}`);
console.log(`  ${pageById(employer.id) && normalized.pages.find((page) => page.id === employer.id).questions.map((question) => question.label).join(" > ")}`);
