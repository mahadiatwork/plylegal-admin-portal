const START_INTRO_BLOCKS = [
  {
    type: "paragraph",
    text: "This questionnaire is the foundation of your visa application. Please complete each section carefully and provide as much detail as you can. If you are unsure about any question, let us know and we will guide you through it.",
  },
  {
    type: "paragraph",
    text: "Once submitted, we will review your responses and use this information to prepare your visa application.",
  },
  { type: "paragraph", text: "Accuracy matters." },
  {
    type: "paragraph",
    text: "Incomplete or incorrect information can lead to delays, refusal, or visa cancellation. If you are unsure about anything, let us know.",
  },
  { type: "paragraph", text: "You can save your progress and return anytime." },
];

const PROFILE_INTRO_BLOCKS = [
  {
    type: "paragraph",
    text: "Add everyone included in this application. Start with the main applicant, then add any family members included in the application.",
  },
  { type: "paragraph", text: "Main Applicant" },
  { type: "paragraph", text: "Add the primary applicant first." },
  { type: "paragraph", text: "Family Members" },
  {
    type: "paragraph",
    text: "Next add any spouse or partner, followed by each dependent child included in the application.",
  },
  {
    type: "list",
    lead: "Who should be added?",
    items: ["Main applicant", "Spouse or de facto partner", "Dependent children"],
  },
];

const OTHER_FAMILY_INTRO_BLOCKS = [
  {
    type: "paragraph",
    text: "Add any non-migrating family members who are not included in this visa application, including children, parents and siblings.",
  },
];

const YES_NO_OPTIONS = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
];

function relationshipOptions(visaType) {
  const options = [
    {
      value: "main_applicant",
      label: visaType === "temporary-work" ? "Main Applicant (Nominated Worker)" : "Main Applicant",
    },
    { value: "spouse", label: "Spouse or De Facto Partner" },
    { value: "child", label: "Dependent Child" },
  ];
  if (visaType !== "protection") options.push({ value: "other", label: "Other Dependent" });
  return options;
}

function legacyMetadata(metadata = {}) {
  return {
    renderer: "legacy",
    countsForProgress: false,
    ...metadata,
  };
}

function startPage(visaType) {
  const route = `/intake/${visaType}/start`;
  const confirmation = "I confirm that the information I provide will be accurate to the best of my knowledge.";
  return {
    id: `${visaType}-getting-started`,
    route,
    title: "Getting Started",
    sectionKey: `${visaType.replaceAll("-", "_")}_workflow_start`,
    completionKey: route.replace(/^\/intake\//, ""),
    scope: "shared",
    introBlocks: structuredClone(START_INTRO_BLOCKS),
    questions: [
      {
        id: `${visaType}-start-confirmation`,
        answerKey: "started",
        label: confirmation,
        type: "checkbox",
        required: false,
        metadata: { originalLabel: confirmation },
      },
    ],
    metadata: legacyMetadata({
      builtInPageId: `${visaType}-workflow-start`,
      workflowPage: "start",
      originalTitle: "Getting started",
      originalIntroBlocks: structuredClone(START_INTRO_BLOCKS),
    }),
  };
}

function profileFields(visaType) {
  const relationships = relationshipOptions(visaType);
  const genders = ["Male", "Female", "Other"].map((label) => ({ value: label, label }));
  return [
    {
      id: `${visaType}-profile-given-names`,
      answerKey: "given_names",
      label: "Given Name(s)",
      type: "text",
      required: true,
      metadata: { originalLabel: "Given Name(s)" },
    },
    {
      id: `${visaType}-profile-family-name`,
      answerKey: "family_name",
      label: "Family Name",
      type: "text",
      required: true,
      metadata: { originalLabel: "Family Name" },
    },
    {
      id: `${visaType}-profile-relationship`,
      answerKey: "relationship",
      label: "Relationship to Application",
      type: "select",
      required: true,
      options: structuredClone(relationships),
      metadata: {
        originalLabel: "Relationship to Application",
        originalOptions: structuredClone(relationships),
      },
    },
    {
      id: `${visaType}-profile-gender`,
      answerKey: "gender",
      label: "Gender",
      type: "select",
      required: false,
      options: structuredClone(genders),
      metadata: { originalLabel: "Gender", originalOptions: structuredClone(genders) },
    },
    {
      id: `${visaType}-profile-date-of-birth`,
      answerKey: "date_of_birth",
      label: "Date of Birth",
      type: "dateParts",
      required: false,
      metadata: { originalLabel: "Date of Birth" },
    },
  ];
}

function profilePage(visaType) {
  const route = `/intake/${visaType}/profile`;
  const presentation = {
    addLabel: "Add Person",
    emptyMessage: "No persons added yet",
    addDialogTitle: "Add Person",
    editDialogTitle: "Edit Person",
    dialogSubtitle: "Start by adding the main applicant",
    columns: [
      { key: "given_names", label: "Name" },
      { key: "relationship", label: "Relationship" },
      { key: "date_of_birth", label: "Date of Birth" },
    ],
    actions: {
      edit: "Edit",
      delete: "Remove",
      cancel: "Cancel",
      confirm: "Save Person",
      actionsHeading: "Actions",
    },
  };
  return {
    id: `${visaType}-included-applicants`,
    route,
    title: "Included Applicants",
    sectionKey: `${visaType.replaceAll("-", "_")}_workflow_profile`,
    completionKey: route.replace(/^\/intake\//, ""),
    scope: "shared",
    introBlocks: structuredClone(PROFILE_INTRO_BLOCKS),
    questions: [
      {
        id: `${visaType}-profile-applicants`,
        answerKey: "applicants",
        label: "Included applicants",
        description: "Start by adding the main applicant",
        type: "repeater",
        required: true,
        metadata: {
          collection: "array",
          originalLabel: "Included applicants",
          originalDescription: "Start by adding the main applicant",
          fields: profileFields(visaType),
          presentation: structuredClone(presentation),
          originalPresentation: structuredClone(presentation),
        },
      },
    ],
    metadata: legacyMetadata({
      builtInPageId: `${visaType}-workflow-profile`,
      workflowPage: "profile",
      originalTitle: "Included Applicants",
      originalIntroBlocks: structuredClone(PROFILE_INTRO_BLOCKS),
    }),
  };
}

function otherFamilyField(visaType, answerKey, label, type = "text", group = "", extra = {}) {
  const options = extra.options ? structuredClone(extra.options) : undefined;
  const presentation = extra.metadata?.presentation
    ? structuredClone(extra.metadata.presentation)
    : undefined;
  return {
    id: `${visaType}-other-family-${answerKey.replaceAll("_", "-")}`,
    answerKey,
    label,
    type,
    required: false,
    ...extra,
    ...(options ? { options } : {}),
    metadata: {
      ...(group ? { group } : {}),
      originalLabel: label,
      ...(options ? { originalOptions: structuredClone(options) } : {}),
      ...extra.metadata,
      ...(presentation ? {
        presentation,
        originalPresentation: structuredClone(presentation),
      } : {}),
    },
  };
}

function otherFamilyMemberFields(visaType) {
  const relationshipOptions = [
    { value: "spouse", label: "Spouse" },
    { value: "partner", label: "Partner" },
    { value: "child", label: "Child" },
    { value: "parent", label: "Parent" },
    { value: "sibling", label: "Sibling" },
    { value: "other_dependent", label: "Other Dependent" },
  ];
  const relationshipStatuses = [
    { value: "never_married", label: "Never Married" },
    { value: "married", label: "Married" },
    { value: "de_facto", label: "De Facto" },
    { value: "separated", label: "Separated" },
    { value: "divorced", label: "Divorced" },
    { value: "widowed", label: "Widowed" },
  ];
  const genders = ["Male", "Female", "Other"].map((label) => ({ value: label, label }));
  const otherNameTypes = [
    { value: "alias", label: "Alias" },
    { value: "maiden_name", label: "Maiden Name" },
    { value: "name_at_birth", label: "Name at Birth" },
    { value: "other_spelling", label: "Other Spelling" },
  ];
  const passportCondition = [{ field: "has_current_passport", op: "equals", value: "yes" }];
  const citizenshipCondition = [{ field: "citizenship_has_other", op: "equals", value: "yes" }];
  const otherNamesPresentation = {
    addLabel: "Add Other Name",
    emptyMessage: "No other names added",
    addDialogTitle: "Add Other Name",
    editDialogTitle: "Edit Other Name",
    columns: [
      { key: "other_name_family_name", label: "Family Name" },
      { key: "other_name_given_names", label: "Given Names" },
      { key: "other_name_type", label: "Type" },
    ],
    actions: {
      edit: "Edit",
      delete: "Remove",
      cancel: "Cancel",
      confirm: "Save Name",
      actionsHeading: "Actions",
    },
  };

  return [
    otherFamilyField(visaType, "relationship", "Relationship to Main Applicant", "select", "Relationship", {
      required: true,
      options: relationshipOptions,
      placeholder: "Select relationship...",
      metadata: { originalPlaceholder: "Select relationship..." },
    }),
    otherFamilyField(visaType, "relationship_status", "Relationship Status", "select", "Relationship", {
      options: relationshipStatuses,
      placeholder: "Select status...",
      metadata: { originalPlaceholder: "Select status..." },
    }),
    otherFamilyField(visaType, "has_current_passport", "Does this person have a current passport?", "yesNo", "Passport Details", {
      required: true,
      options: YES_NO_OPTIONS,
    }),
    otherFamilyField(visaType, "passport_family_name", "Family Name", "text", "Passport Details", {
      placeholder: "Family name on passport",
      visibleIf: passportCondition,
      metadata: { originalPlaceholder: "Family name on passport" },
    }),
    otherFamilyField(visaType, "passport_given_names", "Given Names", "text", "Passport Details", {
      placeholder: "Given names on passport",
      visibleIf: passportCondition,
      metadata: { originalPlaceholder: "Given names on passport" },
    }),
    otherFamilyField(visaType, "passport_sex", "Sex", "radio", "Passport Details", {
      options: genders,
      visibleIf: passportCondition,
    }),
    otherFamilyField(visaType, "passport_date_of_birth", "Date of Birth", "dateParts", "Passport Details", {
      parts: {
        day: "passport_dob_day",
        month: "passport_dob_month",
        year: "passport_dob_year",
      },
      visibleIf: passportCondition,
    }),
    otherFamilyField(visaType, "has_national_identity_card", "Does this person have a national identity card?", "yesNo", "Identity Documents", {
      options: YES_NO_OPTIONS,
    }),
    otherFamilyField(visaType, "has_other_identity_documents", "Does this person have any other identity documents?", "yesNo", "Identity Documents", {
      options: YES_NO_OPTIONS,
    }),
    otherFamilyField(visaType, "place_of_birth_town", "Town or City", "text", "Place of Birth", {
      placeholder: "Town or city",
      metadata: { originalPlaceholder: "Town or city" },
    }),
    otherFamilyField(visaType, "place_of_birth_state", "State or Province", "text", "Place of Birth", {
      placeholder: "State or province",
      metadata: { originalPlaceholder: "State or province" },
    }),
    otherFamilyField(visaType, "place_of_birth_country", "Country", "text", "Place of Birth", {
      placeholder: "Country of birth",
      metadata: { originalPlaceholder: "Country of birth" },
    }),
    otherFamilyField(visaType, "contact_phone", "Phone Number", "text", "Address and Phone", {
      placeholder: "Phone number",
      metadata: { originalPlaceholder: "Phone number" },
    }),
    otherFamilyField(visaType, "address_line_1", "Address Line 1", "text", "Address and Phone", {
      placeholder: "Street address",
      metadata: { originalPlaceholder: "Street address" },
    }),
    otherFamilyField(visaType, "address_line_2", "Address Line 2", "text", "Address and Phone", {
      placeholder: "Apartment, unit, etc.",
      metadata: { originalPlaceholder: "Apartment, unit, etc." },
    }),
    otherFamilyField(visaType, "address_suburb", "Suburb / City", "text", "Address and Phone", {
      placeholder: "Suburb or city",
      metadata: { originalPlaceholder: "Suburb or city" },
    }),
    otherFamilyField(visaType, "address_state", "State / Province", "text", "Address and Phone", {
      placeholder: "State or province",
      metadata: { originalPlaceholder: "State or province" },
    }),
    otherFamilyField(visaType, "address_postcode", "Postcode", "text", "Address and Phone", {
      placeholder: "Postcode",
      metadata: { originalPlaceholder: "Postcode" },
    }),
    otherFamilyField(visaType, "address_country", "Country", "text", "Address and Phone", {
      placeholder: "Country",
      metadata: { originalPlaceholder: "Country" },
    }),
    otherFamilyField(visaType, "other_names", "Other Names / Spellings", "repeater", "Other Names / Spellings", {
      metadata: {
        collection: "array",
        fields: [
          otherFamilyField(visaType, "other_name_family_name", "Family Name", "text", "", {
            placeholder: "Family name",
            metadata: { originalPlaceholder: "Family name" },
          }),
          otherFamilyField(visaType, "other_name_given_names", "Given Names", "text", "", {
            placeholder: "Given names",
            metadata: { originalPlaceholder: "Given names" },
          }),
          otherFamilyField(visaType, "other_name_type", "Type", "select", "", {
            options: otherNameTypes,
            placeholder: "Type",
            metadata: { originalPlaceholder: "Type" },
          }),
        ],
        presentation: otherNamesPresentation,
      },
    }),
    otherFamilyField(visaType, "citizenship_has_other", "Does this person hold citizenship of any other country?", "yesNo", "Citizenship", {
      options: YES_NO_OPTIONS,
    }),
    otherFamilyField(visaType, "citizenship_countries", "Countries (comma-separated)", "text", "Citizenship", {
      placeholder: "e.g. India, United Kingdom",
      visibleIf: citizenshipCondition,
      metadata: { originalPlaceholder: "e.g. India, United Kingdom" },
    }),
    otherFamilyField(visaType, "requires_health_examination", "Does this person require a health examination?", "yesNo", "Health", {
      options: YES_NO_OPTIONS,
    }),
  ];
}

function otherFamilyPage(visaType) {
  const route = `/intake/${visaType}/non-migrating`;
  const memberPresentation = {
    addLabel: "Add Other Family Member",
    emptyMessage: "No other family members added",
    addDialogTitle: "Add Other Family Member",
    editDialogTitle: "Edit Other Family Member",
    dialogSubtitle: "Add the family member's details below.",
    columns: [
      { key: "passport_given_names", label: "Name" },
      { key: "relationship", label: "Relationship" },
      { key: "place_of_birth_country", label: "Country of Birth" },
    ],
    sections: [
      { heading: "Relationship", description: "" },
      { heading: "Passport Details", description: "" },
      { heading: "Identity Documents", description: "" },
      { heading: "Place of Birth", description: "" },
      { heading: "Address and Phone", description: "" },
      { heading: "Other Names / Spellings", description: "" },
      { heading: "Citizenship", description: "" },
      { heading: "Health", description: "" },
    ],
    actions: {
      edit: "Save Changes",
      delete: "Remove",
      cancel: "Cancel",
      confirm: "Add Member",
      actionsHeading: "Actions",
    },
  };
  const overviewQuestion = "Do you have any non-migrating family members not included in the application, such as a spouse or partner, child, parent or sibling?";

  return {
    id: `${visaType}-other-family`,
    route,
    title: "Other Family",
    sectionKey: "temporary_work_non_migrating",
    completionKey: route.replace(/^\/intake\//, ""),
    scope: "shared",
    introBlocks: structuredClone(OTHER_FAMILY_INTRO_BLOCKS),
    questions: [
      {
        id: `${visaType}-other-family-included`,
        answerKey: "has_other_family",
        label: overviewQuestion,
        type: "yesNo",
        required: true,
        options: structuredClone(YES_NO_OPTIONS),
        metadata: {
          originalLabel: overviewQuestion,
          originalOptions: structuredClone(YES_NO_OPTIONS),
        },
      },
      {
        id: `${visaType}-other-family-members`,
        answerKey: "members",
        label: "Other family members",
        type: "repeater",
        required: true,
        visibleIf: [{ field: "has_other_family", op: "equals", value: "yes" }],
        metadata: {
          collection: "array",
          originalLabel: "Other family members",
          fields: otherFamilyMemberFields(visaType),
          presentation: structuredClone(memberPresentation),
          originalPresentation: structuredClone(memberPresentation),
        },
      },
    ],
    metadata: legacyMetadata({
      builtInPageId: `${visaType}-workflow-other-family`,
      profileRole: "non_migrating",
      adminNestedUnder: "main-applicant",
      adminCompositePage: true,
      countsForProgress: true,
      originalTitle: "Other Family",
      originalIntroBlocks: structuredClone(OTHER_FAMILY_INTRO_BLOCKS),
    }),
  };
}

/** Built-in workflow screens whose wording is managed without replacing their client behavior. */
export function getQuestionnaireWorkflowPages(visaType) {
  return [startPage(visaType), profilePage(visaType), otherFamilyPage(visaType)];
}
