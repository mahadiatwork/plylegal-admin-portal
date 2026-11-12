/* Shared temporary-work questionnaire enrichment for subclasses 482 and 186.
 * This module owns page contracts that are identical in both contexts.
 * Context-specific copy, fields, and validators live in the 482/186 layers.
 */
import {
  applyRepeaterPresentationFallback,
  convertCountrySelects,
  mergeDatePartGroups,
} from "./questionnaireBuiltInRecordEnrichment.js";

export const TEMPORARY_WORK_PAGE_TITLES = {
  "/intake/temporary-work/main-applicant/details": "Main Applicant's Details",
  "/intake/temporary-work/main-applicant/other": "Main Applicant's Other Names",
  "/intake/temporary-work/main-applicant/identity": "Main Applicant's Identity",
  "/intake/temporary-work/main-applicant/contact-details": "Main Applicant's Contact Details",
  "/intake/temporary-work/main-applicant/employment": "Main Applicant's Employment",
  "/intake/temporary-work/main-applicant/education": "Main Applicant's Education",
  "/intake/temporary-work/main-applicant/skills": "Main Applicant's Skills",
  "/intake/temporary-work/main-applicant/language": "Main Applicant's Language",
  "/intake/temporary-work/spouse-partner/details": "Spouse/Partner's Details",
  "/intake/temporary-work/spouse-partner/other-details": "Spouse/Partner's Other Names",
  "/intake/temporary-work/spouse-partner/identity": "Spouse/Partner's Identity",
  "/intake/temporary-work/all-applicants/visas": "All Applicants' Visas",
  "/intake/temporary-work/all-applicants/travel-history": "Travel History",
  "/intake/temporary-work/all-applicants/countries-of-residence": "Countries of Residence",
  "/intake/temporary-work/all-applicants/health": "Health",
  "/intake/temporary-work/all-applicants/character": "Character",
};

export const TEMPORARY_WORK_DEFAULT_ACTIONS = {
  edit: "Edit",
  delete: "Delete",
  cancel: "Cancel",
  confirm: "Ok",
  actionsHeading: "Actions",
};

const SKILLS_REGISTRATION_MESSAGES = {
  authority: "Name of Authority is required",
  title: "Title/Name of Licence is required",
  licence_number: "Licence/Registration Number is required",
  english_requirement_details: "Details are required",
  occupation: "Occupation is required",
  country: "Country is required",
  issue_date_day: "Day is required",
  issue_date_month: "Month is required",
  issue_date_year: "Year is required",
};

const SKILLS_ASSESSMENT_MESSAGES = {
  assessing_authority: "Name of Skills Assessing Authority is required",
  assessment_type: "Type of Skills Assessment is required",
  anzsco_code: "ANZSCO Code is required",
  lodgement_date_day: "Day is required",
  lodgement_date_month: "Month is required",
  lodgement_date_year: "Year is required",
  outcome: "Outcome is required",
};

export const TEMPORARY_WORK_HEALTH_RECORD_CONTRACTS = {
  health_examinations: {
    heading: "Health Examinations",
    description: "Enter details of any applicant included in this application who has undertaken a health examination for an Australian visa in the past 12 months.",
    columns: [
      { key: "applicant_name", label: "Name" },
      { key: "date_completed", label: "Date Completed", format: "groupedDate" },
      { key: "country_of_exam", label: "Country" },
    ],
  },
  visited_outside_details: {
    heading: "Visited outside passport country",
    description: "Enter details of applicants who visited or lived outside their country of passport for more than 3 consecutive months in the last 5 years.",
    columns: [
      { key: "applicant_name", label: "Name" },
      { key: "country", label: "Country" },
      { key: "date_from", label: "Date From", format: "groupedDate" },
      { key: "date_to", label: "Date To", format: "groupedDateOrOngoing" },
    ],
  },
  hospital_details: {
    heading: "Hospital / health care facility details",
    columns: [{ key: "applicant_name", label: "Name" }, { key: "role", label: "Role" }],
  },
  healthcare_work_details: {
    heading: "Health care work details",
    columns: [{ key: "applicant_name", label: "Name" }, { key: "role", label: "Role" }],
  },
  aged_care_work_details: {
    heading: "Aged care / disability care details",
    columns: [{ key: "applicant_name", label: "Name" }, { key: "role", label: "Role" }],
  },
  childcare_work_details: {
    heading: "Child care centre details",
    columns: [{ key: "applicant_name", label: "Name" }, { key: "details", label: "Details" }],
  },
  classroom_work_details: {
    heading: "Classroom details",
    columns: [{ key: "applicant_name", label: "Name" }, { key: "details", label: "Details" }],
  },
  tuberculosis_details: {
    heading: "Tuberculosis details",
    columns: [{ key: "applicant_name", label: "Name" }, { key: "details", label: "Details" }],
  },
  health_conditions_details: {
    heading: "Health condition details",
    columns: [
      { key: "applicant_name", label: "Name" },
      { key: "condition", label: "Condition" },
      { key: "details", label: "Details" },
    ],
  },
  medical_assistance_details: {
    heading: "Ongoing medical care details",
    columns: [{ key: "applicant_name", label: "Name" }, { key: "details", label: "Details" }],
  },
};

export function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function updateQuestionTree(questions, questionId, updater) {
  return (questions || []).map((question) => {
    let next = question.id === questionId ? updater(question) : question;
    if (next.followUps?.length) {
      next = { ...next, followUps: updateQuestionTree(next.followUps, questionId, updater) };
    }
    if (next.metadata?.fields?.length) {
      next = {
        ...next,
        metadata: {
          ...next.metadata,
          fields: updateQuestionTree(next.metadata.fields, questionId, updater),
        },
      };
    }
    return next;
  });
}

export function removeQuestions(questions, predicate) {
  return (questions || []).filter((question) => !predicate(question)).map((question) => {
    const next = { ...question };
    if (next.followUps?.length) next.followUps = removeQuestions(next.followUps, predicate);
    if (next.metadata?.fields?.length) {
      next.metadata = { ...next.metadata, fields: removeQuestions(next.metadata.fields, predicate) };
    }
    return next;
  });
}

export function withFieldMessages(fields, messages) {
  return (fields || []).map((field) => {
    const message = messages[field.answerKey];
    if (!message) return field;
    return {
      ...field,
      validation: { ...field.validation, requiredMessage: message },
    };
  });
}

function pageIntroTarget(page, text) {
  if (!Array.isArray(page.introBlocks) || page.introBlocks.length === 0) {
    page.introBlocks = [{ type: "paragraph", text }];
  }
}

function applyPageTitle(page) {
  const title = TEMPORARY_WORK_PAGE_TITLES[page.route];
  if (!title) return page;
  page.title = title;
  page.metadata = {
    ...page.metadata,
    originalTitle: title,
    titleIncludesPerson: false,
    titleTemplate: title,
  };
  return page;
}

export function enrichSkillsPage(page) {
  applyPageTitle(page);
  pageIntroTarget(page, "In this section, provide details about the main applicant's professional registrations and skills assessments.");
  page.metadata.originalIntroBlocks = clone(page.introBlocks);

  page.questions = updateQuestionTree(page.questions, "temporary-work-main-applicant-skills-registrations", (question) => ({
    ...question,
    label: "Registrations/Licences",
    metadata: {
      ...question.metadata,
      originalLabel: "Registrations/Licences",
      collection: "array",
      fields: withFieldMessages(question.metadata.fields, SKILLS_REGISTRATION_MESSAGES),
      originalPresentation: {
        addLabel: "Add",
        emptyMessage: "No entries added",
        addDialogTitle: "Add Entry",
        editDialogTitle: "Edit Entry",
        columns: [
          { key: "authority", label: "Authority" },
          { key: "title", label: "Title" },
          { key: "licence_number", label: "Licence Number" },
          { key: "issue_date_year", label: "Year" },
          { key: "country", label: "Country" },
        ],
        actions: TEMPORARY_WORK_DEFAULT_ACTIONS,
      },
      presentation: {
        addLabel: "Add",
        emptyMessage: "No entries added",
        addDialogTitle: "Add Entry",
        editDialogTitle: "Edit Entry",
        columns: [
          { key: "authority", label: "Authority" },
          { key: "title", label: "Title" },
          { key: "licence_number", label: "Licence Number" },
          { key: "issue_date_year", label: "Year" },
          { key: "country", label: "Country" },
        ],
        actions: TEMPORARY_WORK_DEFAULT_ACTIONS,
      },
      validation: {
        rules: [
          { id: "datePartsAllOrNone", field: "expiry_date_day" },
          {
            id: "requiredWhenEquals",
            field: "english_requirement_details",
            config: { field: "english_requirement", value: "yes" },
          },
        ],
      },
    },
  }));

  page.questions = updateQuestionTree(page.questions, "temporary-work-main-applicant-skills-assessments", (question) => ({
    ...question,
    label: "Skills Assessments",
    metadata: {
      ...question.metadata,
      originalLabel: "Skills Assessments",
      collection: "array",
      fields: withFieldMessages(question.metadata.fields, SKILLS_ASSESSMENT_MESSAGES),
      originalPresentation: {
        addLabel: "Add",
        emptyMessage: "No entries added",
        addDialogTitle: "Add Entry",
        editDialogTitle: "Edit Entry",
        dialogSubtitle: "Enter details of the Skill Assessment you have applied for",
        columns: [
          { key: "assessing_authority", label: "Authority" },
          { key: "assessment_type", label: "Type" },
          { key: "anzsco_code", label: "ANZSCO" },
          { key: "outcome", label: "Outcome" },
        ],
        actions: TEMPORARY_WORK_DEFAULT_ACTIONS,
        sections: [
          {
            heading: "Skills Assessment",
            description: "Enter details of the Skill Assessment you have applied for",
          },
          {
            heading: "Assessment Outcome",
            description: "Enter details on the outcome of the Skills Assessment",
          },
        ],
      },
      presentation: {
        addLabel: "Add",
        emptyMessage: "No entries added",
        addDialogTitle: "Add Entry",
        editDialogTitle: "Edit Entry",
        dialogSubtitle: "Enter details of the Skill Assessment you have applied for",
        columns: [
          { key: "assessing_authority", label: "Authority" },
          { key: "assessment_type", label: "Type" },
          { key: "anzsco_code", label: "ANZSCO" },
          { key: "outcome", label: "Outcome" },
        ],
        actions: TEMPORARY_WORK_DEFAULT_ACTIONS,
        sections: [
          {
            heading: "Skills Assessment",
            description: "Enter details of the Skill Assessment you have applied for",
          },
          {
            heading: "Assessment Outcome",
            description: "Enter details on the outcome of the Skills Assessment",
          },
        ],
      },
      validation: {
        rules: [
          {
            id: "datePartsRequiredUnlessValue",
            field: "outcome_date_day",
            config: { field: "outcome", values: ["Pending"] },
          },
        ],
      },
    },
  }));

  return page;
}

/**
 * Shared employment history contract.
 * `years` controls the ten/five-year copy; `includeVisaHeld` controls the
 * 186-only Australian visa field. No coverage validator is attached because
 * neither client enforces continuous coverage.
 */
export function enrichEmploymentPage(page, { years = 5, includeVisaHeld = false } = {}) {
  applyPageTitle(page);
  pageIntroTarget(page, "In this section, provide details about the main applicant's employment history.");
  page.metadata.originalIntroBlocks = clone(page.introBlocks);

  page.questions = updateQuestionTree(page.questions, "temporary-work-main-applicant-employment-employment_history", (question) => ({
    ...question,
    label: `Employment History (last ${years} years)`,
    description: `Enter details of your employment history for the previous ${years} years`,
    metadata: {
      ...question.metadata,
      originalLabel: `Employment History (last ${years} years)`,
      originalDescription: `Enter details of your employment history for the previous ${years} years`,
      collection: "array",
      originalPresentation: {
        addLabel: "Add",
        emptyMessage: "No entries added",
        addDialogTitle: "Add Entry",
        editDialogTitle: "Edit Entry",
        columns: [
          { key: "date_from", label: "Date From", format: "groupedDate" },
          { key: "date_to", label: "Date To", format: "groupedDateOrOngoing" },
          { key: "status", label: "Status" },
          { key: "position", label: "Position" },
          { key: "employer", label: "Employer" },
          { key: "duties", label: "Duties" },
          { key: "country", label: "Country" },
        ],
        actions: TEMPORARY_WORK_DEFAULT_ACTIONS,
        rowFormatter: "groupedDateOrOngoing",
      },
      presentation: {
        addLabel: "Add",
        emptyMessage: "No entries added",
        addDialogTitle: "Add Entry",
        editDialogTitle: "Edit Entry",
        columns: [
          { key: "date_from", label: "Date From", format: "groupedDate" },
          { key: "date_to", label: "Date To", format: "groupedDateOrOngoing" },
          { key: "status", label: "Status" },
          { key: "position", label: "Position" },
          { key: "employer", label: "Employer" },
          { key: "duties", label: "Duties" },
          { key: "country", label: "Country" },
        ],
        actions: TEMPORARY_WORK_DEFAULT_ACTIONS,
        rowFormatter: "groupedDateOrOngoing",
      },
      validation: {
        rules: [
          { id: "datePartsAllOrNone", field: "date_to_day" },
          { id: "dateToNotBeforeDateFrom", field: "date_to_day" },
          { id: "maxLength", field: "duties", config: { max: 300 } },
          {
            id: "requiredWhenStatusIn",
            field: "employer",
            config: { statuses: ["Employed", "Self-Employed", "Work Experience/Internships", "Unpaid Employment/Volunteer"] },
          },
          {
            id: "requiredWhenStatusIn",
            field: "position",
            config: { statuses: ["Employed", "Self-Employed", "Work Experience/Internships", "Unpaid Employment/Volunteer"] },
          },
          {
            id: "requiredWhenStatusIn",
            field: "country",
            config: { statuses: ["Employed", "Self-Employed", "Work Experience/Internships", "Unpaid Employment/Volunteer"] },
          },
        ],
      },
    },
  }));

  if (!includeVisaHeld) {
    page.questions = removeQuestions(page.questions, (question) => question.answerKey === "visa_held");
  } else {
    page.questions = updateQuestionTree(
      page.questions,
      "temporary-work-main-applicant-employment-employment_history-visa_held",
      (question) => ({
        ...question,
        label: "What visa(s) were held during this period?",
        placeholder: "e.g., Employer Nomination (subclass 186)",
        required: false,
        visaContexts: ["186"],
        visibleIf: [{ field: "country", op: "equals", value: "Australia" }],
        metadata: {
          ...question.metadata,
          originalLabel: "What visa(s) were held during this period?",
          originalPlaceholder: "e.g., Employer Nomination (subclass 186)",
          visaContexts: ["186"],
          validation: {
            rules: [
              {
                id: "requiredWhenEquals",
                field: "visa_held",
                config: { field: "country", value: "Australia" },
              },
            ],
          },
        },
      }),
    );
  }

  const storageOnlyKeys = ["still_working", "current_end_date_day", "current_end_date_month", "current_end_date_year"];
  page.questions = page.questions.map((question) => {
    if (storageOnlyKeys.includes(question.answerKey)) {
      return {
        ...question,
        metadata: { ...question.metadata, storageOnly: true, compatibility: true },
      };
    }
    if (question.answerKey === "current_duties") {
      return {
        ...question,
        metadata: {
          ...question.metadata,
          validation: { rules: [{ id: "maxLength", field: "current_duties", config: { max: 300 } }] },
        },
      };
    }
    if (question.answerKey === "current_address" && !question.placeholder) {
      return {
        ...question,
        placeholder: "Street, City, State, Postcode",
        metadata: { ...question.metadata, originalPlaceholder: "Street, City, State, Postcode" },
      };
    }
    return question;
  });

  return page;
}

export function enrichVisasPage(page) {
  applyPageTitle(page);
  pageIntroTarget(page, "In this section, provide details of any Australian visa grant numbers held by any applicants included in this application.");
  page.metadata.originalIntroBlocks = clone(page.introBlocks);

  page.questions = updateQuestionTree(page.questions, "temporary-work-all-applicants-visas-visa_grant_entries", (question) => ({
    ...question,
    label: "Visa Grant Records",
    metadata: {
      ...question.metadata,
      originalLabel: "Visa Grant Records",
      collection: "array",
      fields: (question.metadata.fields || [])
        .filter((field) => field.answerKey !== "history")
        .map((field) => {
          if (field.answerKey === "applicantId") {
            return {
              ...field,
              label: "Person the visa relates to",
              type: "select",
              optionsSource: "applicants",
              required: true,
              metadata: { ...field.metadata, originalLabel: "Person the visa relates to" },
            };
          }
          if (field.answerKey === "grantNumber") {
            return {
              ...field,
              label: "Australian Visa Grant Number",
              placeholder: "e.g. 1234567890",
              required: true,
              metadata: {
                ...field.metadata,
                originalLabel: "Australian Visa Grant Number",
                originalPlaceholder: "e.g. 1234567890",
              },
            };
          }
          return field;
        }),
      originalPresentation: {
        addLabel: "Add Applicant Visa Record",
        emptyMessage: "No entries added",
        addDialogTitle: "Add Applicant Visa Record",
        editDialogTitle: "Edit Applicant Visa Record",
        columns: [
          { key: "applicantId", label: "Applicant(s)" },
          { key: "grantNumber", label: "Visa Grant Number" },
        ],
        actions: TEMPORARY_WORK_DEFAULT_ACTIONS,
      },
      presentation: {
        addLabel: "Add Applicant Visa Record",
        emptyMessage: "No entries added",
        addDialogTitle: "Add Applicant Visa Record",
        editDialogTitle: "Edit Applicant Visa Record",
        columns: [
          { key: "applicantId", label: "Applicant(s)" },
          { key: "grantNumber", label: "Visa Grant Number" },
        ],
        actions: TEMPORARY_WORK_DEFAULT_ACTIONS,
      },
    },
  }));

  return page;
}

export function enrichContactPage(page) {
  applyPageTitle(page);
  page.questions = page.questions.map((question) => {
    if (!["emergency_contact_name", "emergency_contact_phone"].includes(question.answerKey)) return question;
    return {
      ...question,
      metadata: {
        ...question.metadata,
        group: "Emergency Contact",
      },
    };
  });
  page.questions = updateQuestionTree(page.questions, "temporary-work-main-applicant-contact-details-residential_address", (question) => ({
    ...question,
    label: "Residential Address",
    metadata: {
      ...question.metadata,
      originalLabel: "Residential Address",
      collection: "object",
      originalPresentation: {
        emptyMessage: "No residential address added",
        addDialogTitle: "Residential Address",
        editDialogTitle: "Residential Address",
        columns: (question.metadata.fields || []).map((field) => ({ key: field.answerKey, label: field.label })),
        actions: { ...TEMPORARY_WORK_DEFAULT_ACTIONS, edit: "Edit" },
      },
      presentation: {
        emptyMessage: "No residential address added",
        addDialogTitle: "Residential Address",
        editDialogTitle: "Residential Address",
        columns: (question.metadata.fields || []).map((field) => ({ key: field.answerKey, label: field.label })),
        actions: { ...TEMPORARY_WORK_DEFAULT_ACTIONS, edit: "Edit" },
      },
    },
  }));
  return page;
}

export function enrichChildCustodyPage(page) {
  const contracts = {
    under_18: {
      label: "Is this family member a child under 18 years of age?",
      type: "yesNo",
    },
    primary_custody_has: {
      label: "Is this child in the primary applicant's care and legal custody?",
      type: "yesNo",
    },
    primary_custody_details: {
      label: "Give details",
      type: "textarea",
      visibleIf: [{ field: "primary_custody_has", op: "equals", value: "no" }],
    },
    other_person_rights_has: {
      label: "Does any other person have custodial, access or guardianship rights to this child?",
      type: "yesNo",
    },
    other_person_rights_details: {
      label: "Give details",
      type: "textarea",
      visibleIf: [{ field: "other_person_rights_has", op: "equals", value: "yes" }],
    },
    travel_impediments_has: {
      label: "Are there any legal impediments to this child's travel?",
      type: "yesNo",
    },
    travel_impediments_details: {
      label: "Give details",
      type: "textarea",
      visibleIf: [{ field: "travel_impediments_has", op: "equals", value: "yes" }],
    },
  };

  page.questions = page.questions.map((question) => {
    const contract = contracts[question.answerKey];
    if (!contract) return question;
    return {
      ...question,
      ...contract,
      metadata: {
        ...question.metadata,
        originalLabel: contract.label,
      },
    };
  });
  return page;
}

export function enrichTravelPage(page) {
  const requiredIntro = [
    {
      type: "paragraph",
      text: "In the past 10 years since turning 16 years of age, have any of the applicants travelled outside their usual country of residence?",
    },
    {
      type: "paragraph",
      text: "Please note if an applicant is under 16 years of age, this information is not required.",
    },
  ];
  if (!Array.isArray(page.introBlocks) || page.introBlocks.length < 2) {
    page.introBlocks = requiredIntro;
    page.metadata = { ...page.metadata, originalIntroBlocks: clone(requiredIntro) };
  }
  page.questions = page.questions.map((question) => (
    question.answerKey === "has_travel_history"
      ? {
        ...question,
        label: "In the past 10 years since turning 16 years of age, have any of the applicants travelled outside their usual country of residence?",
        metadata: {
          ...question.metadata,
          originalLabel: "In the past 10 years since turning 16 years of age, have any of the applicants travelled outside their usual country of residence?",
        },
      }
      : question
  ));
  return page;
}

export function enrichResidenceCoveragePage(page) {
  if (page.route !== "/intake/temporary-work/all-applicants/countries-of-residence") return page;
  page.questions = updateQuestionTree(
    page.questions,
    "temporary-work-all-applicants-countries-of-residence-residence_records",
    (question) => ({
      ...question,
      metadata: {
        ...question.metadata,
        validation: {
          ...(question.metadata?.validation || {}),
          rules: [
            ...(question.metadata?.validation?.rules || []).filter((rule) => rule.id !== "residenceHistoryCoverage"),
            {
              id: "residenceHistoryCoverage",
              field: "residence_records",
              config: {
                years: 10,
                minimumAge: 16,
                applicantField: "applicant_name",
                fromFields: ["date_from_day", "date_from_month", "date_from_year"],
                toFields: ["date_to_day", "date_to_month", "date_to_year"],
              },
            },
          ],
        },
      },
    }),
  );
  return page;
}

export function enrichHealthPage(page) {
  if (page.route !== "/intake/temporary-work/all-applicants/health") return page;
  applyPageTitle(page);
  for (const [answerKey, contract] of Object.entries(TEMPORARY_WORK_HEALTH_RECORD_CONTRACTS)) {
    const questionId = `temporary-work-all-applicants-health-${answerKey}`;
    page.questions = updateQuestionTree(page.questions, questionId, (question) => ({
      ...question,
      label: contract.heading,
      ...(contract.description ? { description: contract.description } : {}),
      metadata: {
        ...question.metadata,
        originalLabel: contract.heading,
        ...(contract.description ? { originalDescription: contract.description } : {}),
        collection: "array",
        fields: (question.metadata?.fields || []).map((field) => {
          if (field.answerKey !== "applicant_name") return field;
          const applicantField = { ...field, metadata: { ...(field.metadata || {}) } };
          delete applicantField.options;
          delete applicantField.metadata.originalOptions;
          return {
            ...applicantField,
            type: "select",
            optionsSource: "applicants",
            required: true,
          };
        }),
        originalPresentation: {
          addLabel: "Add",
          emptyMessage: "No entries added",
          addDialogTitle: contract.heading,
          editDialogTitle: contract.heading,
          ...(contract.description ? { dialogSubtitle: contract.description } : {}),
          columns: clone(contract.columns),
          actions: TEMPORARY_WORK_DEFAULT_ACTIONS,
        },
        presentation: {
          addLabel: "Add",
          emptyMessage: "No entries added",
          addDialogTitle: contract.heading,
          editDialogTitle: contract.heading,
          ...(contract.description ? { dialogSubtitle: contract.description } : {}),
          columns: clone(contract.columns),
          actions: TEMPORARY_WORK_DEFAULT_ACTIONS,
        },
      },
    }));
  }
  return page;
}

export function applySharedTemporaryWorkPageEnrichment(pages) {
  return pages.map((page) => {
    if (!page.route?.startsWith("/intake/temporary-work/")) return page;
    let enriched = clone(page);
    if (page.route === "/intake/temporary-work/main-applicant/skills") enriched = enrichSkillsPage(enriched);
    else if (page.route === "/intake/temporary-work/all-applicants/visas") enriched = enrichVisasPage(enriched);
    else if (page.route === "/intake/temporary-work/main-applicant/contact-details") enriched = enrichContactPage(enriched);
    else if (page.route === "/intake/temporary-work/children/child-profile/custody") enriched = enrichChildCustodyPage(enriched);
    else if (page.route === "/intake/temporary-work/all-applicants/travel-history") enriched = enrichTravelPage(enriched);
    else if (page.route === "/intake/temporary-work/all-applicants/countries-of-residence") enriched = enrichResidenceCoveragePage(applyPageTitle(enriched));
    else if (page.route === "/intake/temporary-work/all-applicants/health") enriched = enrichHealthPage(enriched);
    else enriched = applyPageTitle(enriched);
    return enriched;
  });
}

/** Apply date grouping and country sources after shared enrichment runs. */
export function finalizeTemporaryWorkEnrichment(pages) {
  return pages.map((page) => {
    if (!page.route?.startsWith("/intake/temporary-work/")) return page;
    return {
      ...page,
      questions: convertCountrySelects(mergeDatePartGroups(page.questions)),
    };
  });
}

export function applyTemporaryWorkRepeaterPresentationFallback(pages) {
  return applyRepeaterPresentationFallback(pages, "/intake/temporary-work/");
}
