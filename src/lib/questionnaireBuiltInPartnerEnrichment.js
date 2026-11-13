/* Partner Visa (Subclass 820) built-in enrichment.
 * Reconciles the extracted Partner catalog with the mounted client pages.
 * Keep this layer Partner-only; visa-neutral mechanics live in
 * questionnaireBuiltInRecordEnrichment.js.
 */
import {
  applyRepeaterPresentationFallback,
  convertCountrySelects,
  mergeDatePartGroups,
} from "./questionnaireBuiltInRecordEnrichment.js";

const RELATIONSHIP_STORAGE = {
  "/intake/partner/relationships/current-relationship": {
    storagePath: "relationships.currentRelationship",
    legacyStorageAliases: ["partner_current_relationship"],
  },
  "/intake/partner/relationships/relationship-details": {
    storagePath: "relationships.relationshipDetails",
    legacyStorageAliases: ["partner_relationship_details"],
  },
  "/intake/partner/relationships/previous-relationships": {
    storagePath: "relationships.previousRelationships",
    legacyStorageAliases: ["partner_previous_relationships"],
  },
  "/intake/partner/relationships/supporting-witnesses": {
    storagePath: "relationships.supportingWitnesses",
    legacyStorageAliases: ["partner_supporting_witnesses"],
  },
};

const DEFAULT_ACTIONS = {
  edit: "Edit",
  delete: "Delete",
  cancel: "Cancel",
  confirm: "Ok",
  actionsHeading: "Actions",
};

const CHARACTER_DETAIL_CONTROLLERS = {
  police_check_details: "police_check_last_12_months",
  immigration_detention_details: "immigration_detention",
  convicted_offence_details: "convicted_offence",
  awaiting_legal_action_details: "awaiting_legal_action",
  domestic_violence_details: "domestic_violence_order",
  arrest_warrant_details: "arrest_warrant",
  child_sex_offence_details: "child_sex_offence",
  sex_offender_register_details: "sex_offender_register",
  psychiatric_institution_details: "psychiatric_institution",
  insanity_acquittal_details: "insanity_acquittal",
  unfit_to_plead_details: "unfit_to_plead",
  false_misleading_info_details: "false_misleading_info",
  visa_refused_details: "visa_refused",
  overstayed_visa_details: "overstayed_visa",
  deported_removed_details: "deported_removed",
  avoid_removal_details: "avoid_removal",
  excluded_from_country_details: "excluded_from_country",
  citizenship_refusal_details: "citizenship_refusal",
  war_crimes_details: "war_crimes",
  national_security_details: "national_security_risk",
  outstanding_debts_details: "outstanding_debts",
  people_smuggling_details: "people_smuggling",
  criminal_conduct_details: "associated_criminal_conduct",
  violent_org_details: "associated_violent_org",
  military_training_details: "military_training",
  military_service_details: "military_service",
  sponsorship_payment_details: "sponsorship_payment",
};

const CHARACTER_LABELS = {
  police_check_last_12_months: "Has any applicant applied for a police clearance certificate in the last 12 months?",
  immigration_detention: "Has any applicant previously been in immigration detention, a refugee camp or centre for refugees?",
  convicted_offence: "Has any applicant ever been convicted of an offence in any country (including any conviction which is now removed from official records)?",
  awaiting_legal_action: "Has any applicant ever been charged with any offence that is currently awaiting legal action?",
  domestic_violence_order: "Has any applicant ever been the subject of a domestic violence or family violence order, or any other order, of a tribunal or court or other similar authority, for the personal protection of another person?",
  arrest_warrant: "Has any applicant ever been the subject of an arrest warrant or Interpol notice?",
  child_sex_offence: "Has any applicant ever been found guilty of a sexually based offence involving a child (including where no conviction was recorded)?",
  sex_offender_register: "Has any applicant ever been named on a sex offender register?",
  psychiatric_institution: "Has any applicant ever been confined in a prison or psychiatric institution by order of a court in relation to criminal proceedings?",
  insanity_acquittal: "Has any applicant ever been acquitted of any offence on the grounds of unsoundness of mind or insanity?",
  unfit_to_plead: "Has any applicant ever been found by a court not fit to plead?",
  false_misleading_info: "Has any applicant ever provided any information or a document to the Australian Immigration or Customs Authorities which was wrong, incorrect, false or misleading?",
  visa_refused: "Has any applicant ever had a visa or entry permit for any country (including Australia) refused?",
  overstayed_visa: "Has any applicant ever overstayed a visa or entry permit in any country (including Australia)?",
  deported_removed: "Has any applicant ever been removed or deported from any country (including Australia)?",
  avoid_removal: "Has any applicant ever left any country to avoid being removed or deported from that country (including Australia)?",
  excluded_from_country: "Has any applicant ever been excluded from or asked to leave any country (including Australia)?",
  citizenship_refusal: "Has any applicant ever been refused, renounced or rescinded citizenship of any country?",
  war_crimes: "Has any applicant ever been charged with, or indicted for: genocide, war crimes, crimes against humanity, torture, slavery, or any other crime that is otherwise of a serious international concern?",
  national_security_risk: "Has any applicant ever been directly or indirectly involved in, or associated with, activities which would represent a risk to national security in Australia or any other country?",
  outstanding_debts: "Has any applicant ever had any outstanding debts to the Australian Government or any public authority in Australia?",
  people_smuggling: "Has any applicant ever been involved in people smuggling or people trafficking offences?",
  associated_criminal_conduct: "Has any applicant ever been associated with a person, group or organisation that has been or is involved in criminal conduct?",
  associated_violent_org: "Has any applicant ever been associated with an organisation engaged in violence or engaged in acts of violence (including war, insurgency, freedom fighting, terrorism, protest) either overseas or in Australia?",
  military_training: "Has any applicant ever undergone any military/paramilitary training, been trained in weapons/explosives or in the manufacture of chemical/biological products?",
  military_service: "Has any applicant ever served in a military force, police force, state sponsored / private militia or intelligence agency (including secret police)?",
  sponsorship_payment: "Has any person included in this application made or offered to make a payment or provide another benefit of any kind to another person or entity in return for the sponsorship, nomination or support for an Australian visa?",
};

const CHARACTER_INSTRUCTIONS = [
  {
    type: "paragraph",
    text: "If the applicant answers 'Yes' to any of the character declarations they must give all relevant details. For combined applications, state which applicant the declaration applies to.",
  },
  {
    type: "list",
    lead: "If the matter relates to a criminal conviction, provide:",
    items: [
      "the date and nature of the offence",
      "full details of the sentence",
      "dates of any period of imprisonment or other detention.",
    ],
  },
];

const PARTNER_PAGE_COPY = {
  "/intake/partner/main-applicant/family": {
    title: "Family",
    introBlocks: [
      {
        type: "list",
        lead: "Enter details about all of the Main Applicant ({mainApplicantName})'s:",
        items: [
          "Spouse/Partner (if applicable); and",
          "Parents (including Step-Parents); and",
          "Siblings (including Step-Sisters/Step-Brothers); and",
          "Children (including children from a previous relationship, Step-Children and Adopted Children)",
          "Guardians (include any other person who has, or will have, custody or guardianship of this person)",
        ],
      },
      { type: "paragraph", text: "Please include details even if the family member is no longer alive." },
    ],
  },
  "/intake/partner/family-sponsor/details": {
    title: "Details",
    introBlocks: [{ type: "paragraph", text: "If your application is being sponsored by a family member, in the Family Sponsor section you are to provide details about the person who is sponsoring this application." }],
  },
  "/intake/partner/family-sponsor/other": {
    title: "Other Personal Details",
    introBlocks: [
      { type: "paragraph", text: "In this section, provide additional details about your Family Sponsor." },
      { type: "paragraph", text: "Enter details of the other names your Sponsor has been known by, including names before marriage" },
    ],
  },
  "/intake/partner/family-sponsor/family": {
    title: "Family",
    introBlocks: [{ type: "paragraph", text: "Enter details of all your Family Sponsor's Parents, Siblings and Children (including if they are deceased)" }],
  },
  "/intake/partner/all-applicants/future-travel": {
    title: "Future Travel Plans",
    introBlocks: [{ type: "paragraph", text: "Enter details of any proposed or booked travel to any Country" }],
  },
  "/intake/partner/all-applicants/future-addresses": {
    title: "Future Addresses",
    introBlocks: [
      { type: "paragraph", text: "Please provide your intended addresses after arrival" },
      { type: "paragraph", text: "Enter details of all known addresses/places that {mainApplicantName} will stay during their time in Australia:" },
    ],
  },
  "/intake/partner/relationships/supporting-witnesses": {
    title: "Supporting Witnesses for Current Relationship",
    introBlocks: [{ type: "paragraph", text: "Enter details of at least two supporting witness of the relationship between the main applicant and their spouse/partner." }],
  },
  "/intake/partner/all-applicants/contacts": {
    title: "Additional Contact Information",
    introBlocks: [{ type: "paragraph", text: "Provide details of the main applicant's family contacts in Australia." }],
  },
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function updateQuestionTree(questions, questionId, updater) {
  return (questions || []).map((question) => {
    let next = question.id === questionId ? updater(question) : question;
    if (next.followUps?.length) {
      next = { ...next, followUps: updateQuestionTree(next.followUps, questionId, updater) };
    }
    if (next.metadata?.fields?.length) {
      next = {
        ...next,
        metadata: { ...next.metadata, fields: updateQuestionTree(next.metadata.fields, questionId, updater) },
      };
    }
    return next;
  });
}

function findQuestion(questions, predicate) {
  for (const question of questions || []) {
    if (predicate(question)) return question;
    const nested = findQuestion(question.metadata?.fields, predicate) || findQuestion(question.followUps, predicate);
    if (nested) return nested;
  }
  return null;
}

function withFieldMessages(fields, messages) {
  return (fields || []).map((field) => (
    messages[field.answerKey]
      ? { ...field, validation: { ...field.validation, requiredMessage: messages[field.answerKey] } }
      : field
  ));
}

function pageTitle(page, title) {
  page.title = title;
  page.metadata = {
    ...page.metadata,
    originalTitle: title,
    titleIncludesPerson: false,
    titleTemplate: title,
  };
  return page;
}

function enrichPartnerPageCopy(page) {
  const copy = PARTNER_PAGE_COPY[page.route];
  if (copy) {
    page.title = copy.title;
    page.introBlocks = clone(copy.introBlocks);
    page.metadata = {
      ...page.metadata,
      originalTitle: copy.title,
      originalIntroBlocks: clone(copy.introBlocks),
      titleIncludesPerson: false,
      titleTemplate: copy.title,
    };
  }
  if (page.route === "/intake/partner/children/child-profile/custody") {
    page.title = "Custody";
    page.metadata = {
      ...page.metadata,
      originalTitle: "Custody",
      titleIncludesPerson: true,
      titleTemplate: "Custody — {profileName}",
    };
  }
  return page;
}

function setPresentation(question, columns, extra = {}) {
  const presentation = {
    addLabel: "Add",
    emptyMessage: "No entries added",
    addDialogTitle: "Add Entry",
    editDialogTitle: "Edit Entry",
    columns,
    actions: DEFAULT_ACTIONS,
    ...extra,
  };
  return {
    ...question,
    metadata: {
      ...question.metadata,
      originalPresentation: presentation,
      presentation,
    },
  };
}

function enrichEmploymentPage(page) {
  pageTitle(page, "Main Applicant's Employment");
  page.metadata = { ...page.metadata, originalTitle: "Main Applicant's Employment" };
  page.metadata.originalIntroBlocks = clone(page.introBlocks);

  const messageMap = {
    date_from_day: "Day is required",
    date_from_month: "Month is required",
    date_from_year: "Year is required",
    status: "Status is required",
    country: "Country is required",
    position: "Position is required for this status",
  };

  page.questions = updateQuestionTree(page.questions, "partner-main-applicant-employment-employment_history", (question) => {
    const columns = [
      { key: "date_from", label: "Date From", format: "groupedDate" },
      { key: "date_to", label: "Date To", format: "groupedDateOrOngoing" },
      { key: "status", label: "Status" },
      { key: "position", label: "Position" },
      { key: "country", label: "Country" },
    ];
    const presentation = {
      addLabel: "Add",
      emptyMessage: "No entries added",
      addDialogTitle: "Add Entry",
      editDialogTitle: "Edit Entry",
      columns,
      actions: DEFAULT_ACTIONS,
      rowFormatter: "groupedDateOrOngoing",
    };
    return {
      ...question,
      label: "Employment History",
      description: "Enter details of all of your employment and unemployment since birth. There can be no gaps in dates.",
      metadata: {
        ...question.metadata,
        originalLabel: "Employment History",
        originalDescription: "Enter details of all of your employment and unemployment since birth. There can be no gaps in dates.",
        collection: "array",
        fields: withFieldMessages(question.metadata.fields, messageMap),
        originalPresentation: presentation,
        presentation,
        validation: {
          rules: [
            {
              id: "requiredWhenStatusIn",
              field: "position",
              config: { statuses: ["Employed", "Self-Employed", "Work Experience/Internships", "Unpaid Employment/Volunteer"] },
            },
          ],
        },
      },
    };
  });

  page.questions = page.questions.map((question) => {
    if (question.answerKey === "is_currently_employed") {
      return { ...question, required: true };
    }
    if (["current_employer", "current_position", "current_country", "current_start_date_day", "current_start_date_month", "current_start_date_year", "current_employment_type", "current_address"].includes(question.answerKey)) {
      return {
        ...question,
        visibleIf: [{ field: "is_currently_employed", op: "equals", value: "yes" }],
      };
    }
    return question;
  });

  page.questions = updateQuestionTree(page.questions, "partner-main-applicant-employment-employment_history", (question) => ({
    ...question,
    metadata: {
      ...question.metadata,
      fields: (question.metadata.fields || []).map((field) => (
        field.answerKey === "business_address_street_line2"
          ? { ...field, metadata: { ...field.metadata, storageOnly: true } }
          : field
      )),
    },
  }));

  return page;
}

function enrichRelationshipsPage(page) {
  const storage = RELATIONSHIP_STORAGE[page.route];
  if (storage) {
    page.metadata = {
      ...page.metadata,
      ...storage,
      legacyStorageAliases: storage.legacyStorageAliases,
    };
  }

  if (page.route === "/intake/partner/relationships/current-relationship") {
    page.questions = page.questions.map((question) => {
      if (question.answerKey === "related_details") {
        return {
          ...question,
          visibleIf: [{ field: "related_by_blood_marriage_adoption", op: "equals", value: "Yes" }],
          metadata: {
            ...question.metadata,
            validation: { rules: [{ id: "requiredWhenEquals", field: "related_details", config: { field: "related_by_blood_marriage_adoption", value: "Yes" } }] },
          },
        };
      }
      if (["first_met_day", "first_met_month", "first_met_year", "first_met_location"].includes(question.answerKey)) {
        return {
          ...question,
          visibleIf: [{ field: "met_in_person", op: "equals", value: "Yes" }],
          required: true,
          metadata: {
            ...question.metadata,
            validation: { rules: [{ id: "requiredWhenEquals", field: question.answerKey, config: { field: "met_in_person", value: "Yes" } }] },
          },
        };
      }
      return question;
    });
  }

  if (page.route === "/intake/partner/relationships/previous-relationships") {
    page.questions = page.questions.map((question) => {
      if (question.answerKey === "applicant_previous_relationships_list") {
        return {
          ...question,
          visibleIf: [{ field: "applicant_previous_relationships", op: "equals", value: "Yes" }],
          metadata: {
            ...question.metadata,
            validation: {
              rules: [
                { id: "minRowsWhenEquals", field: "applicant_previous_relationships_list", config: { field: "applicant_previous_relationships", value: "Yes", min: 1 } },
                { id: "datePartsAllOrNone", field: "relationship_started_day" },
                { id: "datePartsAllOrNone", field: "relationship_ceased_day" },
                { id: "dateToNotBeforeDateFrom", field: "relationship_ceased_day", config: { fromField: "relationship_started_day" } },
              ],
            },
          },
        };
      }
      if (question.answerKey === "spouse_previous_relationships_list") {
        return {
          ...question,
          visibleIf: [{ field: "spouse_previous_relationships", op: "equals", value: "Yes" }],
          metadata: {
            ...question.metadata,
            validation: {
              rules: [
                { id: "minRowsWhenEquals", field: "spouse_previous_relationships_list", config: { field: "spouse_previous_relationships", value: "Yes", min: 1 } },
                { id: "datePartsAllOrNone", field: "relationship_started_day" },
                { id: "datePartsAllOrNone", field: "relationship_ceased_day" },
                { id: "dateToNotBeforeDateFrom", field: "relationship_ceased_day", config: { fromField: "relationship_started_day" } },
              ],
            },
          },
        };
      }
      return question;
    });
  }

  if (page.route === "/intake/partner/relationships/supporting-witnesses") {
    pageTitle(page, "Supporting Witnesses for Current Relationship");
    page.questions = updateQuestionTree(page.questions, "partner-relationships-supporting-witnesses-supporting_witnesses", (question) => {
      const fields = (question.metadata.fields || []).map((field) => {
        if (["birth_day", "birth_month", "birth_year"].includes(field.answerKey)) {
          return {
            ...field,
            label: "Date of Birth",
            metadata: { ...field.metadata, originalLabel: "Date of Birth", group: "personal_details" },
          };
        }
        return field;
      });
      return setPresentation(
        { ...question, metadata: { ...question.metadata, fields, collection: "array" } },
        [
          { key: "family_name", label: "Name" },
          { key: "birth_day", label: "Date of Birth", format: "groupedDate" },
          { key: "relationship_to_main_applicant", label: "Relationship" },
        ],
        {
          sections: [
            { heading: "Personal Details" },
            { heading: "Relationship" },
            { heading: "Telephone and Email Contact" },
            { heading: "Residential Address" },
          ],
        },
      );
    });
    page.questions = updateQuestionTree(page.questions, "partner-relationships-supporting-witnesses-supporting_witnesses", (question) => ({
      ...question,
      metadata: {
        ...question.metadata,
        validation: {
          rules: [
            { id: "minimumRows", field: "supporting_witnesses", config: { min: 2, message: "At least two supporting witnesses are required" } },
          ],
        },
      },
    }));
  }

  return page;
}

function enrichCharacterPage(page) {
  if (page.route !== "/intake/partner/all-applicants/character") return page;
  page.title = "Character";
  page.introBlocks = clone(CHARACTER_INSTRUCTIONS);
  page.metadata = {
    ...page.metadata,
    originalTitle: "Character",
    originalIntroBlocks: clone(CHARACTER_INSTRUCTIONS),
  };

  const existingKeys = new Set(page.questions.map((question) => question.answerKey));
  const controllers = Object.values(CHARACTER_DETAIL_CONTROLLERS)
    .filter((key) => !existingKeys.has(key))
    .map((key) => ({
      id: `partner-all-applicants-character-${key}`,
      answerKey: key,
      label: CHARACTER_LABELS[key],
      type: "yesNo",
      required: true,
      defaultValue: "no",
      options: [
        { value: "yes", label: "Yes" },
        { value: "no", label: "No" },
      ],
      metadata: { originalLabel: CHARACTER_LABELS[key] },
    }));

  const controllerKeys = new Set(Object.values(CHARACTER_DETAIL_CONTROLLERS));
  page.questions = [...controllers, ...page.questions].map((question) => {
    if (controllerKeys.has(question.answerKey)) return { ...question, required: true, defaultValue: question.defaultValue || "no" };
    const controller = CHARACTER_DETAIL_CONTROLLERS[question.answerKey];
    if (!controller) return question;
    const sourceFields = question.metadata?.fields || [];
    const fields = (sourceFields.some((field) => field.answerKey === "applicant_name")
      ? sourceFields
      : [{
          id: `${question.id}-applicant_name`,
          answerKey: "applicant_name",
          label: "Which applicant does this declaration apply to?",
          type: "select",
          optionsSource: "applicants",
          required: true,
          metadata: { originalLabel: "Which applicant does this declaration apply to?" },
        }, ...sourceFields]
    ).map((field) => {
      if (field.answerKey !== "applicant_name") return field;
      const applicantField = { ...field, metadata: { ...(field.metadata || {}) } };
      delete applicantField.options;
      delete applicantField.metadata.originalOptions;
      return { ...applicantField, type: "select", optionsSource: "applicants", required: true };
    });
    return {
      ...question,
      visibleIf: [{ field: controller, op: "equals", value: "yes" }],
      required: false,
      metadata: {
        ...question.metadata,
        fields,
        validation: {
          ...(question.metadata?.validation || {}),
          rules: [
            ...(question.metadata?.validation?.rules || []).filter((rule) => rule.id !== "minRowsWhenEquals"),
            { id: "minRowsWhenEquals", field: question.answerKey, config: { field: controller, value: "yes", min: 1 } },
          ],
        },
        presentation: {
          addLabel: "Add Details",
          emptyMessage: "No entries added",
          addDialogTitle: "Add Entry",
          editDialogTitle: "Edit Entry",
          columns: (question.metadata?.presentation?.columns || question.metadata?.fields?.slice(0, 4).map((field) => ({ key: field.answerKey, label: field.label })) || []),
          actions: DEFAULT_ACTIONS,
        },
      },
    };
  });

  return page;
}

function enrichFutureTravelPage(page) {
  if (page.route !== "/intake/partner/all-applicants/future-travel") return page;
  page.questions = page.questions.map((question) => {
    if (question.answerKey !== "future_travel") return question;
    const fields = [...(question.metadata?.fields || [])];
    if (!fields.some((field) => field.answerKey === "other_reason_details")) {
      fields.push({
        id: `${question.id}-other_reason_details`,
        answerKey: "other_reason_details",
        label: "Please provide details",
        description: "",
        placeholder: "Please describe the reason for visiting this country...",
        type: "textarea",
        required: false,
        visibleIf: [{ field: "reason", op: "equals", value: "Other" }],
        metadata: { originalLabel: "Please provide details", originalPlaceholder: "Please describe the reason for visiting this country..." },
      });
    }
    return setPresentation(
      { ...question, required: false, metadata: { ...question.metadata, fields } },
      [
        { key: "departure_country", label: "Departure Country" },
        { key: "departure_date", label: "Departure Date", format: "groupedDate" },
        { key: "arrival_country", label: "Arrival Country" },
        { key: "arrival_date", label: "Arrival Date", format: "groupedDate" },
        { key: "reason", label: "Reason" },
      ],
      { addDialogTitle: "Proposed or Booked Travel", editDialogTitle: "Proposed or Booked Travel" },
    );
  });
  return page;
}

function enrichVisasPage(page) {
  if (page.route !== "/intake/partner/all-applicants/visas") return page;
  const grantedFields = new Set([
    "date_granted", "date_granted_day", "date_granted_month", "date_granted_year",
    "expiry_date", "expiry_date_day", "expiry_date_month", "expiry_date_year",
    "place_of_issue", "visa_number", "cancelled",
  ]);
  page.questions = page.questions.map((question) => {
    if (question.answerKey !== "visa_history") return question;
    const fields = (question.metadata?.fields || []).map((field) => grantedFields.has(field.answerKey)
      ? { ...field, visibleIf: [{ field: "outcome", op: "equals", value: "Granted" }] }
      : field);
    return setPresentation(
      { ...question, metadata: { ...question.metadata, fields } },
      [
        { key: "visa_country", label: "Country" },
        { key: "visa_type", label: "Type" },
        { key: "linked_passport", label: "Linked Passport" },
        { key: "decision_date", label: "Decision Date", format: "groupedDate" },
        { key: "outcome", label: "Outcome" },
        { key: "cancelled", label: "Cancelled" },
      ],
    );
  });
  return page;
}

function enrichContactsPage(page) {
  if (page.route !== "/intake/partner/all-applicants/contacts") return page;
  page.questions = page.questions.map((question) => {
    if (question.answerKey !== "family_in_australia") return question;
    const fields = (question.metadata?.fields || []).map((field) => field.answerKey === "city_of_birth"
      ? { ...field, metadata: { ...field.metadata, storageOnly: true, compatibility: true, editorLocked: true } }
      : field);
    return setPresentation(
      { ...question, metadata: { ...question.metadata, fields } },
      [
        { key: "family_name", label: "Family Name" },
        { key: "given_names", label: "Given Names" },
        { key: "relationship", label: "Relationship" },
      ],
    );
  });
  return page;
}

function enrichHealthPage(page) {
  if (page.route !== "/intake/partner/all-applicants/health") return page;
  const hasTbExposure = page.questions.some((question) => question.answerKey === "close_contact_tb");
  if (!hasTbExposure) {
    const gate = {
      id: "partner-all-applicants-health-close_contact_tb",
      answerKey: "close_contact_tb",
      label: "Has any applicant ever been in close contact at home or at work with a person who has had tuberculosis?",
      type: "yesNo",
      required: false,
      options: [
        { value: "yes", label: "Yes" },
        { value: "no", label: "No" },
      ],
      metadata: { originalLabel: "Has any applicant ever been in close contact at home or at work with a person who has had tuberculosis?" },
    };
    const repeater = {
      id: "partner-all-applicants-health-tuberculosis_exposure_details",
      answerKey: "tuberculosis_exposure_details",
      label: "Tuberculosis exposure details",
      type: "repeater",
      required: false,
      visibleIf: [{ field: "close_contact_tb", op: "equals", value: "yes" }],
      metadata: {
        originalLabel: "Tuberculosis exposure details",
        collection: "array",
        fields: [
          {
            id: "partner-all-applicants-health-tuberculosis_exposure_details-applicant_name",
            answerKey: "applicant_name",
            label: "Name",
            type: "select",
            optionsSource: "applicants",
            required: true,
            metadata: { originalLabel: "Name" },
          },
          {
            id: "partner-all-applicants-health-tuberculosis_exposure_details-details",
            answerKey: "details",
            label: "Give details",
            type: "textarea",
            required: false,
            metadata: { originalLabel: "Give details" },
          },
        ],
        presentation: {
          addLabel: "Add",
          emptyMessage: "No entries added",
          addDialogTitle: "Tuberculosis exposure details",
          editDialogTitle: "Tuberculosis exposure details",
          columns: [
            { key: "applicant_name", label: "Name" },
            { key: "details", label: "Details" },
          ],
          actions: DEFAULT_ACTIONS,
        },
      },
    };
    const index = page.questions.findIndex((question) => question.answerKey === "health_conditions_details");
    page.questions.splice(index === -1 ? page.questions.length : index, 0, gate, repeater);
  }
  const contracts = {
    health_examinations: ["Health Examinations", [{ key: "applicant_name", label: "Name" }, { key: "date_completed", label: "Date Completed", format: "groupedDate" }, { key: "country_of_exam", label: "Country" }]],
    hospital_details: ["Hospital / health care facility details", [{ key: "applicant_name", label: "Name" }, { key: "reason", label: "Role" }]],
    healthcare_work_details: ["Health care work details", [{ key: "applicant_name", label: "Name" }, { key: "role", label: "Role" }]],
    aged_care_work_details: ["Aged care / disability care details", [{ key: "applicant_name", label: "Name" }, { key: "role", label: "Role" }]],
    childcare_work_details: ["Child care centre details", [{ key: "applicant_name", label: "Name" }, { key: "role", label: "Role" }, { key: "institution", label: "Institution" }]],
    classroom_work_details: ["Classroom details", [{ key: "applicant_name", label: "Name" }, { key: "course_type", label: "Course Type" }, { key: "institution", label: "Institution" }]],
    tuberculosis_details: ["Tuberculosis details", [{ key: "applicant_name", label: "Name" }, { key: "details", label: "Details" }]],
    tuberculosis_exposure_details: ["Tuberculosis exposure details", [{ key: "applicant_name", label: "Name" }, { key: "details", label: "Details" }]],
    health_conditions_details: ["Health condition details", [{ key: "applicant_name", label: "Name" }, { key: "condition", label: "Condition" }, { key: "details", label: "Details" }]],
    medical_assistance_details: ["Ongoing medical care details", [{ key: "applicant_name", label: "Name" }, { key: "details", label: "Details" }]],
  };
  page.questions = page.questions.map((question) => {
    const contract = contracts[question.answerKey];
    if (!contract) return question;
    const [heading, columns] = contract;
    const fields = (question.metadata?.fields || []).map((field) => {
      if (field.answerKey !== "applicant_name") return field;
      const applicantField = { ...field, metadata: { ...(field.metadata || {}) } };
      delete applicantField.options;
      delete applicantField.metadata.originalOptions;
      return { ...applicantField, type: "select", optionsSource: "applicants", required: true };
    });
    const presentation = {
      addLabel: "Add",
      emptyMessage: "No entries added",
      addDialogTitle: heading,
      editDialogTitle: heading,
      columns,
      actions: DEFAULT_ACTIONS,
    };
    return {
      ...question,
      label: heading,
      metadata: {
        ...question.metadata,
        originalLabel: heading,
        collection: "array",
        fields,
        originalPresentation: clone(presentation),
        presentation,
      },
    };
  });
  return page;
}

function classifyApplicantSelector(page) {
  page.questions = updateQuestionTree(page.questions, "partner-all-applicants-addresses-address_history", (question) => ({
    ...question,
    metadata: {
      ...question.metadata,
      fields: (question.metadata.fields || []).map((field) => {
        if (field.answerKey !== "applicant_ids") return field;
        const { fields, ...metadata } = field.metadata || {};
        return {
          ...field,
          type: "select",
          optionsSource: "applicants",
          required: true,
          metadata: { ...metadata, collection: "multi-select-array" },
        };
      }),
    },
  }));
  return page;
}

const PARTNER_COMPATIBILITY_FIELDS = {
  "/intake/partner/all-applicants/future-travel": new Set(["from_to", "start_date"]),
  "/intake/partner/all-applicants/future-addresses": new Set(["address_display", "date_from", "date_to", "address"]),
};

function classifyCompatibilityFields(page) {
  const compatibilityFields = PARTNER_COMPATIBILITY_FIELDS[page.route];
  if (!compatibilityFields) return page;
  return {
    ...page,
    questions: (page.questions || []).map((question) => ({
      ...question,
      metadata: question.metadata?.fields
        ? {
            ...question.metadata,
            fields: question.metadata.fields.map((field) => compatibilityFields.has(field.answerKey)
              ? {
                  ...field,
                  metadata: {
                    ...field.metadata,
                    storageOnly: true,
                    compatibility: true,
                    derived: true,
                    editorLocked: true,
                    lockReason: "Client-derived compatibility value",
                  },
                }
              : field),
          }
        : question.metadata,
    })),
  };
}

function dedupeNestedAnswerKeys(questions) {
  return (questions || []).map((question) => {
    let next = question;
    if (next.followUps?.length) next = { ...next, followUps: dedupeNestedAnswerKeys(next.followUps) };
    if (next.metadata?.fields?.length) {
      const seen = new Set();
      const fields = [];
      for (const field of next.metadata.fields) {
        const key = field.answerKey;
        if (key && seen.has(key)) continue;
        if (key) seen.add(key);
        fields.push(field);
      }
      next = { ...next, metadata: { ...next.metadata, fields: dedupeNestedAnswerKeys(fields) } };
    }
    return next;
  });
}

export function applyQuestionnaireBuiltInPartnerEnrichment(pages) {
  return pages.map((page) => {
    if (!page.route?.startsWith("/intake/partner/")) return page;
    let enriched = clone(page);
    enriched = enrichPartnerPageCopy(enriched);
    if (page.route === "/intake/partner/main-applicant/employment") enriched = enrichEmploymentPage(enriched);
    else if (page.route.startsWith("/intake/partner/relationships/")) enriched = enrichRelationshipsPage(enriched);
    else if (page.route === "/intake/partner/all-applicants/character") enriched = enrichCharacterPage(enriched);
    else if (page.route === "/intake/partner/all-applicants/health") enriched = enrichHealthPage(enriched);
    else if (page.route === "/intake/partner/all-applicants/addresses") enriched = classifyApplicantSelector(enriched);
    enriched = enrichFutureTravelPage(enriched);
    enriched = enrichVisasPage(enriched);
    enriched = enrichContactsPage(enriched);
    enriched = classifyCompatibilityFields(enriched);
    enriched = { ...enriched, questions: dedupeNestedAnswerKeys(enriched.questions) };
    return enriched;
  });
}

export function finalizePartnerEnrichment(pages) {
  return pages.map((page) => {
    if (!page.route?.startsWith("/intake/partner/")) return page;
    return classifyCompatibilityFields({
      ...page,
      questions: dedupeNestedAnswerKeys(convertCountrySelects(mergeDatePartGroups(page.questions))),
    });
  });
}

export function applyPartnerRepeaterPresentationFallback(pages) {
  return applyRepeaterPresentationFallback(pages, "/intake/partner/");
}
