const options = (values) => values.map((value) => ({ value, label: value }));
const labelledOptions = (entries) => entries.map(([value, label]) => ({ value, label }));

const GENDER_OPTIONS = options(["Male", "Female", "Other"]);
const MARITAL_STATUS_OPTIONS = [
  "Never Married",
  "Married",
  "De Facto Relationship",
  "Divorced",
  "Widowed",
  "Separated",
].map((value) => ({ value, label: value }));
const NON_MIGRATING_RELATIONSHIP_OPTIONS = labelledOptions([
  ["parent", "Parent"],
  ["sibling", "Sibling"],
  ["child", "Child (not migrating)"],
  ["grandparent", "Grandparent"],
  ["other_relative", "Other Relative"],
]);
const OTHER_NAME_TYPE_OPTIONS = labelledOptions([
  ["alias", "Alias"],
  ["maiden_name", "Maiden Name"],
  ["name_at_birth", "Name at Birth"],
  ["other_spelling", "Other Spelling"],
]);
const IDENTITY_DOCUMENT_OPTIONS = options([
  "Birth certificate",
  "Drivers licence",
  "Marriage certificate",
  "Change of name certificate",
  "Military discharge certificate",
  "Other",
]);
const FAMILY_RELATIONSHIP_OPTIONS = options([
  "Adopted Child", "Adopted Parent", "Child", "Child-in-Law", "Cousin",
  "Grand-Child", "Grand-Parent", "Guardian", "Half-Sibling", "Niece or Nephew",
  "Parent", "Parent-in-Law", "Sibling", "Sister/Brother-in-Law", "Spouse/Partner",
  "Step-Child", "Step-Grandchild", "Step-Grandparent", "Step-Niece or Step-Nephew",
  "Step-Parent", "Step-Sibling", "Step-Uncle or Step-Aunt", "Uncle or Aunt", "Ward",
]);
const WITNESS_RELATIONSHIP_OPTIONS = options([
  "Acquaintance", "Adopted Child", "Adopted Parent", "Associate", "Child",
  "Child-in-Law", "Cousin", "Former Spouse/Partner", "Friend", "Grand-Child",
  "Grand-Parent", "Guardian", "Half-Sibling", "Niece or Nephew", "Other", "Parent",
  "Parent-in-Law", "Sibling", "Sister/Brother-in-Law", "Spouse/Partner", "Step-Child",
  "Step-Grandchild", "Step-Grandparent", "Step-Niece or Step-Nephew", "Step-Parent",
  "Step-Sibling", "Step-Uncle or Step-Aunt", "Uncle or Aunt", "Ward",
]);
const TRAVEL_REASON_OPTIONS = options([
  "Work, study or training", "Business", "Visit Family", "Holiday or Leisure",
  "Military Deployment", "Other",
]);
const INDUSTRY_OPTIONS = options([
  "Agriculture, Forestry and Fishing", "Mining", "Manufacturing",
  "Electricity, Gas, Water and Waste Services", "Construction", "Wholesale Trade",
  "Retail Trade", "Accommodation and Food Services", "Transport, Postal and Warehousing",
  "Information Media and Telecommunications", "Financial and Insurance Services",
  "Rental, Hiring and Real Estate Services", "Professional, Scientific and Technical Services",
  "Administrative and Support Services", "Public Administration and Safety",
  "Education and Training", "Health Care and Social Assistance",
  "Arts and Recreation Services", "Other Services", "Other",
]);

const VISA_PREFIXES = ["temporary-work", "partner", "protection"];
const IDENTITY_ROLES = ["main-applicant", "spouse-partner", "children-child-profile"];

const CHOICE_FIELDS = new Map([
  ...VISA_PREFIXES.flatMap((prefix) => [
    [`${prefix}-non-migrating-member-profile-details-relationship`, { type: "select", options: NON_MIGRATING_RELATIONSHIP_OPTIONS }],
    [`${prefix}-non-migrating-member-profile-details-relationship_status`, { type: "select", options: MARITAL_STATUS_OPTIONS }],
    [`${prefix}-non-migrating-member-profile-other-names-other_names-type`, { type: "select", options: OTHER_NAME_TYPE_OPTIONS }],
  ]),
  ...VISA_PREFIXES.flatMap((prefix) => IDENTITY_ROLES.map((role) => [
    `${prefix}-${role}-identity-other_identity_documents-document_type`,
    { type: "select", options: IDENTITY_DOCUMENT_OPTIONS },
  ])),

  ["temporary-work-non-migrating-member-profile-details-sex", { type: "radio", options: GENDER_OPTIONS }],
  ["temporary-work-non-migrating-member-profile-passport-sex", { type: "radio", options: GENDER_OPTIONS }],

  ["partner-main-applicant-family-children-gender", { type: "radio", options: GENDER_OPTIONS }],
  ["partner-main-applicant-family-children-relationship", { type: "select", options: FAMILY_RELATIONSHIP_OPTIONS }],
  ["partner-family-sponsor-details-marital_status", { type: "select", options: MARITAL_STATUS_OPTIONS }],
  ["partner-family-sponsor-details-relationship", { type: "select", options: options(["Parent", "Spouse/Partner", "Child", "Sibling", "Other Relative"]) }],
  ["partner-family-sponsor-family-family_members-gender", { type: "radio", options: GENDER_OPTIONS }],
  ["partner-family-sponsor-previous-sponsorship-previous_sponsorships-gender", { type: "radio", options: GENDER_OPTIONS }],
  ["partner-relationships-previous-relationships-applicant_previous_relationships_list-gender", { type: "radio", options: GENDER_OPTIONS }],
  ["partner-relationships-previous-relationships-applicant_previous_relationships_list-type_of_relationship", { type: "select", options: options(["De Facto Relationship", "Engaged", "Married", "Other"]) }],
  ["partner-relationships-previous-relationships-applicant_previous_relationships_list-how_relationship_ceased", { type: "select", options: options(["Divorce", "Separation", "Death", "Other"]) }],
  ["partner-relationships-previous-relationships-spouse_previous_relationships_list-gender", { type: "radio", options: GENDER_OPTIONS }],
  ["partner-relationships-previous-relationships-spouse_previous_relationships_list-type_of_relationship", { type: "select", options: options(["De Facto Relationship", "Engaged", "Married", "Other"]) }],
  ["partner-relationships-previous-relationships-spouse_previous_relationships_list-how_relationship_ceased", { type: "select", options: options(["Divorce", "Separation", "Death", "Other"]) }],
  ["partner-relationships-supporting-witnesses-supporting_witnesses-gender", { type: "radio", options: GENDER_OPTIONS }],
  ["partner-relationships-supporting-witnesses-supporting_witnesses-relationship_to_main_applicant", { type: "select", options: WITNESS_RELATIONSHIP_OPTIONS }],
  ["partner-relationships-supporting-witnesses-supporting_witnesses-relationship_to_spouse", { type: "select", options: WITNESS_RELATIONSHIP_OPTIONS }],
  ["partner-all-applicants-contacts-family_in_australia-gender", { type: "radio", options: GENDER_OPTIONS }],
  ["partner-all-applicants-future-travel-future_travel-reason", { type: "select", options: TRAVEL_REASON_OPTIONS }],
  ["partner-non-migrating-member-profile-details-sex", { type: "radio", options: GENDER_OPTIONS }],
  ["partner-non-migrating-member-profile-passport-sex", { type: "radio", options: GENDER_OPTIONS }],

  ["protection-all-applicants-contacts-main_applicant_contacts-gender", { type: "radio", options: GENDER_OPTIONS }],
  ["protection-employment-industry_sector", { type: "select", options: INDUSTRY_OPTIONS }],
  ["protection-employment-commercial_address_type", { type: "select", options: options(["Business", "Residential", "Postal", "Other"]) }],
  ["protection-non-migrating-member-profile-details-sex", { type: "radio", options: GENDER_OPTIONS }],
  ["protection-non-migrating-member-profile-passport-sex", { type: "radio", options: GENDER_OPTIONS }],
]);

const DYNAMIC_CHOICE_FIELDS = new Map([
  ["temporary-work-all-applicants-countries-of-residence-residence_records-applicant_name", "applicants"],
]);

const ROW_FIELD_ADDITIONS = new Map([
  ["partner-all-applicants-future-travel-future_travel", {
    after: "reason",
    field: {
      id: "partner-all-applicants-future-travel-future_travel-other_reason_details",
      answerKey: "other_reason_details",
      label: "Please provide details",
      type: "textarea",
      required: false,
      visibleIf: [{ field: "reason", op: "equals", value: "Other" }],
      metadata: { originalLabel: "Please provide details" },
    },
  }],
  ["partner-family-sponsor-travel-travel_history", {
    after: "reason_for_being",
    field: {
      id: "partner-family-sponsor-travel-travel_history-reason_details",
      answerKey: "reason_details",
      label: "Please provide details",
      type: "text",
      required: false,
      visibleIf: [{ field: "reason_for_being", op: "equals", value: "Other" }],
      metadata: { originalLabel: "Please provide details" },
    },
  }],
]);

function addReviewedRowField(fields, addition) {
  if (!addition || fields.some((field) => field.id === addition.field.id)) return fields;
  const index = fields.findIndex((field) => field.answerKey === addition.after);
  const next = [...fields];
  next.splice(index < 0 ? next.length : index + 1, 0, structuredClone(addition.field));
  return next;
}

function applyChoiceFields(questions = []) {
  return questions.map((question) => {
    const choiceField = CHOICE_FIELDS.get(question.id);
    const options = choiceField?.options.map((option) => ({ ...option }));
    let nextQuestion = choiceField
      ? {
          ...question,
          type: choiceField.type,
          options,
          metadata: {
            ...question.metadata,
            originalOptions: options.map((option) => ({ ...option })),
          },
        }
      : question;

    const optionsSource = DYNAMIC_CHOICE_FIELDS.get(question.id);
    if (optionsSource) {
      nextQuestion = {
        ...nextQuestion,
        type: "select",
        optionsSource,
        metadata: { ...nextQuestion.metadata },
      };
      delete nextQuestion.options;
      delete nextQuestion.metadata.originalOptions;
    }

    const followUps = nextQuestion.followUps?.length
      ? applyChoiceFields(nextQuestion.followUps)
      : nextQuestion.followUps;
    let fields = nextQuestion.metadata?.fields?.length
      ? applyChoiceFields(nextQuestion.metadata.fields)
      : nextQuestion.metadata?.fields;
    if (fields) fields = addReviewedRowField(fields, ROW_FIELD_ADDITIONS.get(nextQuestion.id));

    if (followUps === nextQuestion.followUps && fields === nextQuestion.metadata?.fields) {
      return nextQuestion;
    }

    return {
      ...nextQuestion,
      ...(followUps ? { followUps } : {}),
      ...(fields
        ? { metadata: { ...nextQuestion.metadata, fields } }
        : {}),
    };
  });
}

/** Restore choice controls which are expressed as custom JSX in the preserved client forms. */
export function applyQuestionnaireBuiltInChoices(pages = []) {
  return pages.map((page) => ({
    ...page,
    questions: applyChoiceFields(page.questions),
  }));
}
