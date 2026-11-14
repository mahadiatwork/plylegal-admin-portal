/* Temporary Work (482 / 186): dynamic-renderer parity rules and certified routes.
 *
 * Data only — the mechanism lives in questionnaireDynamicParity.js.
 * Each rule reproduces behaviour that was hard-coded in the legacy Client Portal page,
 * so the page renders and saves identically when the Client Portal builds it from JSON.
 * 482 and 186 render the same client source pages, so the rules are shared; only the
 * certified route lists are per visa context.
 *
 * To certify a route: add/adjust its rules, export the catalog, run the Client Portal
 * parity suite for that route, then add the route to TEMPORARY_WORK_CERTIFIED_ROUTES.
 * See AGENTS.md at the workspace root.
 */

const TW = "/intake/temporary-work";

const profileNameAndGender = (mode) => [
  { answerKey: "family_name", source: "profile", field: "family_name", mode },
  { answerKey: "given_names", source: "profile", field: "given_names", mode },
  { answerKey: "gender", source: "profile", field: "gender", mode },
];

const profileBirthDate = (mode) => [
  { answerKey: "birth_day", source: "profile", field: "birth_day", mode, format: "dayNumber" },
  { answerKey: "birth_month", source: "profile", field: "birth_month", mode, format: "monthNumber" },
  { answerKey: "birth_year", source: "profile", field: "birth_year", mode },
];

const yes = (field) => [{ field, op: "equals", value: "yes" }];
const CITIZENSHIP_REASON_OPTIONS = ["Birth", "Descent", "Naturalisation"].map((value) => ({ value, label: value }));

// Other-name popups (main, spouse, child) only show evidence fields after "Yes".
const otherNameEvidenceRules = {
  fieldDefaults: { other_names: { has_evidence: "no" } },
  fieldGroups: { other_names: { has_evidence: "Other Name Evidence" } },
  visibleIf: Object.fromEntries(
    ["evidence_type", "document_issue", "document_reference_number", "issuing_country", "issuing_state", "place_of_issue"]
      .map((field) => [`other_names.${field}`, yes("has_evidence")]),
  ),
};

export const TEMPORARY_WORK_PARITY_RULES = {
  // Main applicant: the Included Applicants roster is authoritative for name/gender;
  // date of birth falls back to the roster when the Details page has not stored one.
  [`${TW}/main-applicant/details`]: {
    prefill: [
      ...profileNameAndGender("always"),
      ...profileBirthDate("whenEmpty"),
      { answerKey: "is_main_applicant", value: "yes", mode: "whenEmpty" },
    ],
    dateFormats: { "citizenships.date_obtained": { month: "name" }, "citizenships.date_ceased": { month: "name" } },
  },
  // Spouse: roster is authoritative for name, gender and date of birth.
  [`${TW}/spouse-partner/details`]: {
    prefill: [...profileNameAndGender("always"), ...profileBirthDate("always")],
    dateFormats: { "citizenships.date_obtained": { month: "name" }, "citizenships.date_ceased": { month: "name" } },
  },
  [`${TW}/spouse-partner/identity`]: {
    defaults: { has_passport: "no", has_national_id: "no" },
    fieldDefaults: { passports: { is_original_date: "yes" } },
  },
  [`${TW}/spouse-partner/other-details`]: {
    defaults: { has_other_names: "no", use_chinese_code: "no" },
    ...otherNameEvidenceRules,
  },
  // Child: saved answers win; the roster only fills empty values.
  [`${TW}/children/child-profile/details`]: {
    prefill: [...profileNameAndGender("whenEmpty"), ...profileBirthDate("whenEmpty")],
    dateFormats: { "citizenships.date_obtained": { month: "name" }, "citizenships.date_ceased": { month: "name" } },
  },
  [`${TW}/children/child-profile/other`]: {
    defaults: { has_other_names: "no" },
    ...otherNameEvidenceRules,
  },
  // Legacy stores { under_18: bool, primary_custody: { has: bool, details }, … }.
  [`${TW}/children/child-profile/custody`]: {
    pageMetadata: { answerLayout: "childCustody" },
  },
  [`${TW}/children/child-profile/identity`]: {
    defaults: { has_passport: "no", has_national_id: "no", has_sole_custody: "yes" },
    fieldDefaults: { passports: { is_original_date: "yes" } },
  },
  [`${TW}/main-applicant/other`]: {
    defaults: { has_other_names: "no" },
    // Stored by the legacy form but not asked on the 482 page.
    prefill: ["use_chinese_code", "russian_descent", "has_prev_dob"].map((answerKey) => ({ answerKey, value: "no", mode: "whenEmpty" })),
    ...otherNameEvidenceRules,
  },
  [`${TW}/main-applicant/identity`]: {
    defaults: { has_passport: "no", has_national_id: "no", citizen_of_country: "no", ever_been_citizen: "no", permanent_residency_rights: "no" },
    fieldDefaults: { passports: { is_original_date: "yes" } },
    // Citizenship records: current citizens, or non-citizens who were previously a citizen.
    visibleIf: {
      citizenships: [{ op: "anyOf", value: [
        { field: "citizen_of_country", op: "equals", value: "yes" },
        { field: "ever_been_citizen", op: "equals", value: "yes" },
      ] }],
    },
    patches: {
      // Same TargetCitizenshipDialog as Details: reason is a choice, months stored as names.
      "citizenships.how_obtained": { type: "select", options: CITIZENSHIP_REASON_OPTIONS },
      // Presentation copied from the legacy page (headings, buttons, table columns, paired fields).
      has_passport: { metadata: { group: "" } },
      passports: {
        label: "Passports/Travel Documents",
        description: "Enter details of all current passports.",
        metadata: { group: "", presentation: { columns: [
          { key: "document_number", label: "Passport/Document Number" },
          { key: "name", label: "Name" },
          { key: "nationality", label: "Nationality" },
          { key: "date_issued", label: "Date of Issue", format: "groupedDate" },
          { key: "document_status", label: "Status" },
        ] } },
      },
      national_id_card: {
        description: "Enter details exactly as shown on the national identity card. Note: If the National identity card does not have a Date of issue or a Date of expiry, do not enter a date. Leave the field/s blank.",
      },
      ...Object.fromEntries(["family_name", "given_names", "identification_number", "country_of_issue"]
        .map((field) => [`national_id_card.${field}`, { metadata: { width: "half" } }])),
      other_identity_documents: {
        description: "Enter details of other identity documents you hold.",
        metadata: { group: "", presentation: { addLabel: "Add document", columns: [
          { key: "document_type", label: "Type" },
          { key: "family_name", label: "Family name" },
          { key: "given_names", label: "Given names" },
          { key: "identification_number", label: "ID number" },
          { key: "country_of_issue", label: "Country" },
        ] } },
      },
      ...Object.fromEntries(["citizen_of_country", "stateless_explanation", "ever_been_citizen", "citizenships", "permanent_residency_rights", "pr_countries"]
        .map((answerKey) => [answerKey, { metadata: { group: "Additional Citizenship and Residence Information" } }])),
      citizenships: {
        metadata: { group: "Additional Citizenship and Residence Information", presentation: { hideLabel: true, addLabel: "Add citizenship", columns: [
          { key: "country", label: "Country" },
          { key: "how_obtained", label: "How obtained" },
          { key: "still_citizen", label: "Still citizen" },
        ] } },
      },
      pr_countries: {
        metadata: { group: "Additional Citizenship and Residence Information", presentation: { hideLabel: true, addLabel: "Add country", columns: [
          { key: "country", label: "Country" },
          { key: "status", label: "Status" },
        ] } },
      },
    },
    dateFormats: { "citizenships.date_obtained": { month: "name" }, "citizenships.date_ceased": { month: "name" } },
  },
  [`${TW}/main-applicant/employment`]: {
    defaults: { is_currently_employed: "no" },
    order: ["current_employer", "current_position", "current_country", "current_employment_type", "current_start_date"],
    patches: Object.fromEntries(
      ["current_employer", "current_position", "current_country", "current_employment_type"]
        .map((answerKey) => [answerKey, { metadata: { width: "half" } }]),
    ),
    prefill: [{ answerKey: "still_working", value: "yes", mode: "whenEmpty" }],
    dateFormats: { "*": { day: "padded" } },
  },
  [`${TW}/main-applicant/education`]: {
    defaults: { has_secondary_education: "no" },
    fieldDefaults: { education_history: { is_highest_qualification: "no" } },
    dateFormats: { "*": { day: "padded" } },
  },
  [`${TW}/main-applicant/skills`]: {
    defaults: { has_occupational_registration: "no", has_skills_assessment: "no" },
    fieldDefaults: { registrations: { english_requirement: "no" } },
    fieldGroups: {
      assessments: { assessing_authority: "Skills Assessment", outcome: "Assessment Outcome" },
    },
    dateFormats: { "*": { day: "padded" } },
  },
  // The live page edits grant records inline (the unmounted VisaDialog is not part of it),
  // stores profile ids, and clears the records when the answer is "No".
  [`${TW}/all-applicants/visas`]: {
    defaults: { has_australian_visa_grant_number: "no" },
    visibleIf: { visa_grant_entries: yes("has_australian_visa_grant_number") },
    patches: {
      visa_grant_entries: { clearWhenHidden: true, metadata: { presentation: { layout: "inline" } } },
      "visa_grant_entries.applicantId": { optionsSource: "applicantIds", placeholder: "Choose applicant" },
    },
  },
  // Travel and residence records reference applicants by profile id (travel: several).
  [`${TW}/all-applicants/travel-history`]: {
    patches: { "travel_history.applicant_ids": { optionsSource: "applicantIds" } },
    dateFormats: { "*": { day: "padded" } },
  },
  [`${TW}/all-applicants/countries-of-residence`]: {
    patches: { "residence_records.applicant_name": { optionsSource: "applicantIds", placeholder: "Choose applicant" } },
    dateFormats: { "*": { day: "padded" } },
  },
  [`${TW}/all-applicants/health`]: {
    defaults: Object.fromEntries([
      "has_health_examinations", "visited_outside_passport_country", "intends_hospital_entry", "intends_healthcare_work",
      "intends_aged_care", "intends_childcare", "intends_classroom", "had_tuberculosis", "medical_condition", "requires_assistance",
    ].map((answerKey) => [answerKey, "no"])),
    // Stored by the legacy form but not asked on the page.
    prefill: ["close_contact_tb", "health_insurance"].map((answerKey) => ({ answerKey, value: "no", mode: "whenEmpty" })),
    dateFormats: { "*": { day: "padded" } },
  },
  [`${TW}/main-applicant/language`]: {
    defaults: { is_english_main_language: "no", has_english_test: "no", studied_in_english: "no" },
    fieldDefaults: { languages: { is_main_language: "no" } },
    dateFormats: { "*": { day: "padded" } },
  },
};

/** Routes whose dynamic rendering passed the Client Portal parity suite, per visa context. */
// 482: certified 14 Nov 2026 — all 25 legacy content pages pass the parity suite
// (round trip clean; defaults/prefills match). Workflow pages (start, profile,
// non-migrating index, submit) intentionally stay on the legacy renderer.
const TEMPORARY_WORK_482_CONTENT_ROUTES = [
  "main-applicant/details", "main-applicant/other", "main-applicant/identity", "main-applicant/contact-details",
  "main-applicant/employment", "main-applicant/education", "main-applicant/skills", "main-applicant/language",
  "spouse-partner/details", "spouse-partner/other-details", "spouse-partner/identity",
  "children/child-profile/details", "children/child-profile/other", "children/child-profile/identity", "children/child-profile/custody",
  "non-migrating/member-profile/details", "non-migrating/member-profile/passport", "non-migrating/member-profile/identity",
  "non-migrating/member-profile/other-names", "non-migrating/member-profile/citizenship", "non-migrating/member-profile/health",
  "all-applicants/visas", "all-applicants/travel-history", "all-applicants/countries-of-residence", "all-applicants/health",
].map((suffix) => `${TW}/${suffix}`);

export const TEMPORARY_WORK_CERTIFIED_ROUTES = {
  "482": TEMPORARY_WORK_482_CONTENT_ROUTES,
  // 186 shares these source pages but has its own employment/spouse differences; certify
  // after running the parity suite against the 186 export.
  "186": [],
};
