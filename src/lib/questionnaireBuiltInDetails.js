// The shipped 482/186 Details forms share this field order and wording.
// Keep only fields rendered by those forms; their zod schemas also contain obsolete requester fields.
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MARITAL_DATE_LABELS = {
  Married: "Date of Marriage",
  "De Facto Relationship": "Date De Facto Relationship Began",
  Divorced: "Date of Divorce",
  Widowed: "Date of Death of Spouse",
  Separated: "Date of Separation",
};

function choices(values) { return values.map((value) => ({ value, label: value })); }
function field(pageId, answerKey, label, type = "text", group = "Personal Information", extra = {}) {
  return { id: `${pageId}-${answerKey}`, answerKey, label, type, required: false,
    ...extra, metadata: { group, originalLabel: label,
      ...(extra.options ? { originalOptions: extra.options.map((option) => ({ ...option })) } : {}),
      ...(extra.description ? { originalDescription: extra.description } : {}),
      ...(extra.placeholder ? { originalPlaceholder: extra.placeholder } : {}),
      ...extra.metadata } };
}
function date(pageId, answerKey, label, group, extra = {}) {
  return field(pageId, answerKey, label, "dateParts", group, {
    parts: { day: `${answerKey}_day`, month: `${answerKey}_month`, year: `${answerKey}_year` },
    monthOptions: MONTHS.map((label, index) => ({ value: String(index + 1), label })), ...extra,
  });
}

export function createQuestionnaireBuiltInDetailsQuestions(pageId, role) {
  const fields = [
    field(pageId, "family_name", "Family Name"),
    field(pageId, "given_names", "Given Names"),
    field(pageId, "gender", "Gender", "radio", "Personal Information", { options: choices(["Male", "Female", "Other"]) }),
    date(pageId, "birth", "Date of Birth - Day", "Personal Information", { metadata: { partLabels: { day: "Date of Birth - Day", month: "Month", year: "Year" }, hideDateHeading: true } }),
    field(pageId, "marital_status", "What is your marital status?", "select", "Personal Information", {
      options: choices(["Never Married", "Married", "De Facto Relationship", "Divorced", "Widowed", "Separated"]),
    }),
    date(pageId, "marital_status_date", "Date of Marriage", "Personal Information", {
      required: true,
      visibleIf: [{ field: "marital_status", op: "in", value: Object.keys(MARITAL_DATE_LABELS) }],
      metadata: { labelByValue: { field: "marital_status", labels: MARITAL_DATE_LABELS } },
    }),
    field(pageId, "country_of_birth", "Country of Birth", "text", "Birthplace Information", { required: true, placeholder: "Choose Country", metadata: { clientControl: role === "spouse" ? "select" : "text" } }),
    field(pageId, "city_of_birth", "City or Town of Birth", "text", "Birthplace Information", { required: true }),
    field(pageId, "state_of_birth", "State or Province of Birth", "text", "Birthplace Information", { required: true }),
    field(pageId, "citizenship_of_passport_country", "Is this applicant a citizen of their country of passport?", "yesNo", "Citizenships"),
    field(pageId, "citizenship_other_than_birth", "Is this applicant a citizen of any other country?", "yesNo", "Citizenships"),
    field(pageId, "citizenships", "Other citizenships", "repeater", "Citizenships", {
      description: "Enter details of each other citizenship held by this applicant.",
      visibleIf: [{ field: "citizenship_other_than_birth", op: "equals", value: "yes" }],
      metadata: { fields: [
        field(`${pageId}-citizenships`, "country", "Country of Citizenship", "text", "", { required: true }),
        field(`${pageId}-citizenships`, "how_obtained", "How was this Citizenship obtained?", "select", "", { required: true, options: choices(["Birth", "Descent", "Naturalisation"]) }),
        date(`${pageId}-citizenships`, "date_obtained", "Date Obtained", "", { description: "Optional but recommended" }),
        field(`${pageId}-citizenships`, "still_citizen", "Are you still a citizen of this country?", "yesNo", ""),
        date(`${pageId}-citizenships`, "date_ceased", "Date ceased", "", { visibleIf: [{ field: "still_citizen", op: "equals", value: "no" }] }),
        field(`${pageId}-citizenships`, "reason_ceased", "Reason", "textarea", "", { visibleIf: [{ field: "still_citizen", op: "equals", value: "no" }] }),
      ] },
    }),
  ];
  if (role === "spouse") fields.push(field(pageId, "preferred_names", "Preferred Names", "text", "Other names/spellings"));
  return fields;
}

export function applyQuestionnaireBuiltInDetails(pages = []) {
  return pages.map((page) => {
    if (!/^\/intake\/(?:temporary-work|partner|protection)\/(?:main-applicant|spouse-partner|children\/[^/]+)\/details$/.test(page.route || "")) return page;
    const visaType = page.route.split("/")[2];
    const role = page.route.includes("/spouse-partner/") ? "spouse" : page.route.includes("/children/") ? "child" : "main_applicant";
    const intro = role === "main_applicant"
      ? "In the Main Applicant section, please provide details about the person who is intending to be the primary applicant."
      : role === "spouse" ? visaType === "partner" ? "Provide details for the spouse or partner. Include their details even if they are not included in this application." : "Provide details for the spouse or partner included in this application."
        : visaType === "temporary-work" ? "Provide personal and birthplace details for this dependent child included in the application." : "Provide details for this dependent child included in the application.";
    const questions = createQuestionnaireBuiltInDetailsQuestions(page.id, role);
    if (role === "child" && visaType !== "temporary-work") {
      questions.push(field(page.id, "relationship_to_spouse", "This person is the spouse or partner's:", "select", "Relationship Details", {
        options: choices(["Child", "Step Child", "Adopted Child"]),
        metadata: { labelTemplate: "This person is {spouseName}'s:", requiresSpouse: true },
      }));
    }
    const hiddenAnswerKeys = ["prefix", "is_main_applicant", "completing_family_name", "completing_given_names", "completing_preferred_names", "completing_gender", "completing_birth_day", "completing_birth_month", "completing_birth_year"];
    if (role !== "spouse") hiddenAnswerKeys.push("preferred_names");
    return { ...page, title: "Details", introBlocks: [{ type: "paragraph", text: intro }],
      questions,
      metadata: { ...page.metadata, originalTitle: "Details", originalIntroBlocks: [{ type: "paragraph", text: intro }], hiddenAnswerKeys } };
  });
}
