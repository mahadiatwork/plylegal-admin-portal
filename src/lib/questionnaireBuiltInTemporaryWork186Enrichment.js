/* Employer Nomination Visa (Subclass 186) context overrides.
 * Shared page contracts live in questionnaireBuiltInTemporaryWorkEnrichment.js.
 * This layer encodes 186-specific behavior: ten-year employment wording,
 * Australia-only conditional `visa_held`, and the spouse Education/Language
 * journey that 482 does not have.
 */
import {
  TEMPORARY_WORK_DEFAULT_ACTIONS,
  applySharedTemporaryWorkPageEnrichment,
  clone,
  enrichEmploymentPage,
  finalizeTemporaryWorkEnrichment,
  updateQuestionTree,
  withFieldMessages,
} from "./questionnaireBuiltInTemporaryWorkEnrichment.js";

const PAGE_TITLES = {
  "/intake/temporary-work/spouse-partner/education": "Spouse/Partner's Education",
  "/intake/temporary-work/spouse-partner/language": "Spouse/Partner's Language",
};

const EDUCATION_MESSAGES = {
  date_from_day: "Day is required",
  date_from_month: "Month is required",
  date_from_year: "Year is required",
  qualification: "Qualification is required",
  course_name: "Course Name / Research Description is required",
  course_language: "Course Language is required",
  course_status: "Course Status is required",
  institution: "Institution name is required",
  country: "Country is required",
  institution_address: "Address is required",
  institution_suburb: "Suburb/Town/City is required",
  institution_state: "State is required",
  institution_postcode: "Postcode is required",
};

const LANGUAGE_MESSAGES = {
  language: "Language is required",
  proficiency: "Proficiency is required",
};

const ENGLISH_TEST_MESSAGES = {
  test_type: "Test type is required",
  date_day: "Day is required",
  date_month: "Month is required",
  date_year: "Year is required",
  location: "Location is required",
  reference_number: "Reference number is required",
  overall_score: "Overall score is required",
};

function applySpousePageTitle(page) {
  const title = PAGE_TITLES[page.route];
  if (!title) return page;
  page.title = title;
  page.metadata = {
    ...page.metadata,
    originalTitle: title,
    titleIncludesPerson: false,
    titleTemplate: title,
  };
  page.metadata.originalIntroBlocks = clone(page.introBlocks);
  return page;
}

function enrichSpouseEducationPage(page) {
  applySpousePageTitle(page);
  page.questions = updateQuestionTree(page.questions, "temporary-work-spouse-partner-education-education_history", (question) => ({
    ...question,
    label: "Education History",
    metadata: {
      ...question.metadata,
      originalLabel: "Education History",
      collection: "array",
      fields: withFieldMessages(question.metadata.fields, EDUCATION_MESSAGES),
      validation: {
        rules: [{ id: "datePartsAllOrNone", field: "date_to_day" }],
      },
      originalPresentation: {
        addLabel: "Add",
        emptyMessage: "No entries added",
        addDialogTitle: "Add Entry",
        editDialogTitle: "Edit Entry",
        columns: [
          { key: "institution", label: "Institution" },
          { key: "qualification", label: "Qualification" },
          { key: "course_name", label: "Course Name" },
          { key: "date_from_year", label: "Year Started" },
          { key: "country", label: "Country" },
        ],
        actions: TEMPORARY_WORK_DEFAULT_ACTIONS,
        sections: [{ heading: "Institution Details" }],
      },
      presentation: {
        addLabel: "Add",
        emptyMessage: "No entries added",
        addDialogTitle: "Add Entry",
        editDialogTitle: "Edit Entry",
        columns: [
          { key: "institution", label: "Institution" },
          { key: "qualification", label: "Qualification" },
          { key: "course_name", label: "Course Name" },
          { key: "date_from_year", label: "Year Started" },
          { key: "country", label: "Country" },
        ],
        actions: TEMPORARY_WORK_DEFAULT_ACTIONS,
        sections: [{ heading: "Institution Details" }],
      },
    },
  }));
  return page;
}

function enrichSpouseLanguagePage(page) {
  applySpousePageTitle(page);

  page.questions = updateQuestionTree(page.questions, "temporary-work-spouse-partner-language-languages", (question) => ({
    ...question,
    label: "Languages Used",
    metadata: {
      ...question.metadata,
      originalLabel: "Languages Used",
      collection: "array",
      fields: withFieldMessages(question.metadata.fields, LANGUAGE_MESSAGES),
      originalPresentation: {
        addLabel: "Add",
        emptyMessage: "No entries added",
        addDialogTitle: "Add Entry",
        editDialogTitle: "Edit Entry",
        columns: [
          { key: "language", label: "Language" },
          { key: "proficiency", label: "Proficiency" },
          { key: "is_main_language", label: "Main Language?", format: "yesNoLabel" },
        ],
        actions: TEMPORARY_WORK_DEFAULT_ACTIONS,
      },
      presentation: {
        addLabel: "Add",
        emptyMessage: "No entries added",
        addDialogTitle: "Add Entry",
        editDialogTitle: "Edit Entry",
        columns: [
          { key: "language", label: "Language" },
          { key: "proficiency", label: "Proficiency" },
          { key: "is_main_language", label: "Main Language?", format: "yesNoLabel" },
        ],
        actions: TEMPORARY_WORK_DEFAULT_ACTIONS,
      },
    },
  }));

  page.questions = updateQuestionTree(page.questions, "temporary-work-spouse-partner-language-english_tests", (question) => ({
    ...question,
    label: "English Test Results",
    metadata: {
      ...question.metadata,
      originalLabel: "English Test Results",
      collection: "array",
      fields: withFieldMessages(question.metadata.fields, ENGLISH_TEST_MESSAGES),
      originalPresentation: {
        addLabel: "Add",
        emptyMessage: "No entries added",
        addDialogTitle: "Add Entry",
        editDialogTitle: "Edit Entry",
        columns: [
          { key: "date_day", label: "Date", format: "groupedDate" },
          { key: "test_type", label: "Test Type" },
          { key: "location", label: "Location" },
          { key: "reference_number", label: "Reference Number" },
          { key: "overall_score", label: "Overall Score" },
        ],
        actions: TEMPORARY_WORK_DEFAULT_ACTIONS,
        sections: [{ heading: "Sub-scores (optional)" }],
      },
      presentation: {
        addLabel: "Add",
        emptyMessage: "No entries added",
        addDialogTitle: "Add Entry",
        editDialogTitle: "Edit Entry",
        columns: [
          { key: "date_day", label: "Date", format: "groupedDate" },
          { key: "test_type", label: "Test Type" },
          { key: "location", label: "Location" },
          { key: "reference_number", label: "Reference Number" },
          { key: "overall_score", label: "Overall Score" },
        ],
        actions: TEMPORARY_WORK_DEFAULT_ACTIONS,
        sections: [{ heading: "Sub-scores (optional)" }],
      },
    },
  }));

  page.questions = page.questions.map((question) => {
    if (question.answerKey !== "studied_in_english_details") return question;
    return {
      ...question,
      rows: 4,
      placeholder: "e.g. University of Melbourne – Bachelor of Commerce, 2018–2021",
      metadata: {
        ...question.metadata,
        originalPlaceholder: "e.g. University of Melbourne – Bachelor of Commerce, 2018–2021",
        validation: {
          rules: [
            {
              id: "requiredWhenEquals",
              field: "studied_in_english_details",
              config: { field: "studied_in_english", value: "yes" },
            },
          ],
        },
      },
    };
  });

  return page;
}

export function applyQuestionnaireBuiltInTemporaryWork186Enrichment(pages) {
  return applySharedTemporaryWorkPageEnrichment(pages).map((page) => {
    if (page.route === "/intake/temporary-work/main-applicant/employment") {
      return enrichEmploymentPage(page, { years: 10, includeVisaHeld: true });
    }
    if (page.route === "/intake/temporary-work/spouse-partner/education") {
      return enrichSpouseEducationPage(page);
    }
    if (page.route === "/intake/temporary-work/spouse-partner/language") {
      return enrichSpouseLanguagePage(page);
    }
    return page;
  });
}

export function finalizeTemporaryWork186Enrichment(pages) {
  return finalizeTemporaryWorkEnrichment(pages);
}
