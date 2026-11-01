export const QUESTIONNAIRE_PAGE_GROUP_LABELS = Object.freeze({
  "main-applicant": "Main applicant",
  "spouse-partner": "Dependant — spouse / partner",
  children: "Dependants — children",
  "non-migrating": "Non-migrating family",
  "family-sponsor": "Family sponsor",
  relationships: "Relationships",
  "all-applicants": "All applicants",
  shared: "Shared questionnaire",
});

export function getQuestionnairePageGroupKey(page) {
  const metadataRole = page?.metadata?.profileRole;
  const role = metadataRole === "main" ? "main_applicant" : metadataRole;

  if (role === "main_applicant") return "main-applicant";
  if (role === "spouse") return "spouse-partner";
  if (role === "child") return "children";
  if (["non_migrating", "other"].includes(role)) return "non-migrating";

  const route = String(page?.route || "");
  if (route.includes("/main-applicant/")) return "main-applicant";
  if (route.includes("/spouse-partner/")) return "spouse-partner";
  if (route.includes("/children/") && !route.endsWith("/children/start")) return "children";
  if (/\/non-migrating\/[^/]+\//.test(route)) return "non-migrating";
  if (route.includes("/family-sponsor/")) return "family-sponsor";
  if (route.includes("/relationships/")) return "relationships";
  if (route.includes("/all-applicants/")) return "all-applicants";
  return "shared";
}

export function groupQuestionnairePages(pages = []) {
  const groups = new Map();

  for (const page of pages) {
    const key = getQuestionnairePageGroupKey(page);
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        label: QUESTIONNAIRE_PAGE_GROUP_LABELS[key],
        pages: [],
      });
    }
    groups.get(key).pages.push(page);
  }

  return [...groups.values()];
}
