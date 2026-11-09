/* Protection Visa (Subclass 866) built-in enrichment.
 * This layer reconciles the extracted catalog with the rendered client pages.
 * It is applied after extraction so the extractor can remain generic while
 * Protection-specific copy, grouping, and presentation are captured here.
 */

import { mergeDatePartGroups, convertCountrySelects } from './questionnaireBuiltInRecordEnrichment.js';

export { mergeDatePartGroups, convertCountrySelects };

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function updateQuestionTree(questions, questionId, updater) {
  return questions.map((question) => {
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

function removeQuestions(questions, predicate) {
  return (questions || []).filter((question) => !predicate(question)).map((question) => {
    const next = { ...question };
    if (next.followUps?.length) next.followUps = removeQuestions(next.followUps, predicate);
    if (next.metadata?.fields?.length) {
      next.metadata = { ...next.metadata, fields: removeQuestions(next.metadata.fields, predicate) };
    }
    return next;
  });
}

function enrichEmploymentPage(page) {
  if (page.route !== "/intake/protection/main-applicant/employment") return page;

  // Page-level copy and template.
  page.title = "Main Applicant's Employment";
  page.metadata = {
    ...page.metadata,
    originalTitle: "Main Applicant's Employment",
    titleIncludesPerson: false,
    titleTemplate: "Main Applicant's Employment",
  };
  if (!Array.isArray(page.introBlocks) || page.introBlocks.length === 0) {
    page.introBlocks = [{ type: "paragraph", text: "In this section, provide details about the main applicant's employment history." }];
  }
  page.metadata.originalIntroBlocks = clone(page.introBlocks);

  // Repeater presentation and dynamic heading.
  page.questions = updateQuestionTree(page.questions, "protection-main-applicant-employment-employment_history", (question) => {
    const historyQuestion = {
      ...question,
      label: "Employment History for the Main Applicant ({mainApplicantName})",
      description: "Enter all employment, unemployment, study and other activities since birth. There can be no gaps in dates.",
      metadata: {
        ...question.metadata,
        originalLabel: "Employment History for the Main Applicant ({mainApplicantName})",
        originalDescription: "Enter all employment, unemployment, study and other activities since birth. There can be no gaps in dates.",
        originalPresentation: {
          addLabel: "Add",
          emptyMessage: "No entries added",
          addDialogTitle: "Add Entry",
          editDialogTitle: "Edit Entry",
          columns: [
            { key: "date_from_day", label: "Date From", format: "protectionDate" },
            { key: "date_to_day", label: "Date To", format: "protectionDateOrOngoing" },
            { key: "status", label: "Status" },
            { key: "position", label: "Position" },
            { key: "employer", label: "Employer" },
            { key: "country", label: "Country" },
          ],
          actions: {
            edit: "Edit",
            delete: "Delete",
            cancel: "Cancel",
            confirm: "Ok",
            actionsHeading: "Actions",
          },
          rowFormatter: "protectionDateOrOngoing",
        },
        presentation: {
          addLabel: "Add",
          emptyMessage: "No entries added",
          addDialogTitle: "Add Entry",
          editDialogTitle: "Edit Entry",
          columns: [
            { key: "date_from_day", label: "Date From", format: "protectionDate" },
            { key: "date_to_day", label: "Date To", format: "protectionDateOrOngoing" },
            { key: "status", label: "Status" },
            { key: "position", label: "Position" },
            { key: "employer", label: "Employer" },
            { key: "country", label: "Country" },
          ],
          actions: {
            edit: "Edit",
            delete: "Delete",
            cancel: "Cancel",
            confirm: "Ok",
            actionsHeading: "Actions",
          },
          rowFormatter: "protectionDateOrOngoing",
        },
        validation: {
          rules: [
            { id: "datePartsAllOrNone", field: "date_to_day" },
            { id: "dateToNotBeforeDateFrom", field: "date_to_day" },
            { id: "maxLength", field: "duties", config: { max: 300 } },
            { id: "requiredWhenStatusIn", field: "employer", config: { statuses: ["Employed", "Self-Employed", "Work Experience/Internships", "Unpaid Employment/Volunteer"] } },
            { id: "requiredWhenStatusIn", field: "employer_address", config: { statuses: ["Employed", "Self-Employed", "Work Experience/Internships", "Unpaid Employment/Volunteer"] } },
            { id: "requiredWhenStatusIn", field: "duties", config: { statuses: ["Employed", "Self-Employed", "Work Experience/Internships", "Unpaid Employment/Volunteer"] } },
            { id: "continuousHistoryCoverage", field: "employment_history" },
          ],
        },
      },
    };
    return historyQuestion;
  });

  // Current employment block visibility.
  const currentKeys = [
    "current_employer",
    "current_position",
    "current_country",
    "current_start_date_day",
    "current_start_date_month",
    "current_start_date_year",
    "current_employment_type",
    "current_address",
  ];
  page.questions = page.questions.map((question) => {
    if (!currentKeys.includes(question.answerKey)) return question;
    const updated = { ...question, visibleIf: [{ field: "is_currently_employed", op: "equals", value: "yes" }] };
    if (updated.metadata) updated.metadata.group = "current_employment";
    return updated;
  });

  // Date part grouping for current start date.
  page.questions = mergeDatePartGroups(page.questions);

  // Re-run country conversion after date grouping.
  page.questions = convertCountrySelects(page.questions);

  // Current employment date group label, placeholder and visibility.
  page.questions = updateQuestionTree(page.questions, "protection-main-applicant-employment-current_start_date", (question) => ({
    ...question,
    label: "Date Started",
    visibleIf: [{ field: "is_currently_employed", op: "equals", value: "yes" }],
    metadata: {
      ...question.metadata,
      originalLabel: "Date Started",
      group: "current_employment",
    },
  }));

  // Current employment country placeholder.
  page.questions = updateQuestionTree(page.questions, "protection-main-applicant-employment-current_country", (question) => ({
    ...question,
    placeholder: "Choose Country",
    metadata: { ...question.metadata, originalPlaceholder: "Choose Country" },
  }));

  return page;
}

function addFallbackRepeaterPresentation(questions) {
  return questions.map((question) => {
    const next = { ...question };
    if (next.type === "repeater" && Array.isArray(next.metadata?.fields) && next.metadata.fields.length > 0) {
      if (!next.metadata.presentation) {
        const columns = next.metadata.fields
          .filter((field) => field.type !== "dateParts")
          .slice(0, 6)
          .map((field) => ({ key: field.answerKey, label: field.label }));
        if (!columns.length) {
          const first = next.metadata.fields[0];
          if (first.type === "dateParts" && first.parts) {
            columns.push({ key: first.parts.day, label: first.label, format: "protectionDate" });
          } else {
            columns.push({ key: first.answerKey, label: first.label });
          }
        }
        next.metadata = {
          ...next.metadata,
          originalPresentation: {
            addLabel: "Add",
            emptyMessage: "No entries added",
            addDialogTitle: "Add Entry",
            editDialogTitle: "Edit Entry",
            columns,
            actions: {
              edit: "Edit",
              delete: "Delete",
              cancel: "Cancel",
              confirm: "Ok",
              actionsHeading: "Actions",
            },
          },
          presentation: {
            addLabel: "Add",
            emptyMessage: "No entries added",
            addDialogTitle: "Add Entry",
            editDialogTitle: "Edit Entry",
            columns,
            actions: {
              edit: "Edit",
              delete: "Delete",
              cancel: "Cancel",
              confirm: "Ok",
              actionsHeading: "Actions",
            },
          },
        };
      }
    }
    if (next.followUps?.length) next.followUps = addFallbackRepeaterPresentation(next.followUps);
    if (next.metadata?.fields?.length) next.metadata = { ...next.metadata, fields: addFallbackRepeaterPresentation(next.metadata.fields) };
    return next;
  });
}

export function applyProtectionRepeaterPresentationFallback(pages) {
  return pages.map((page) => {
    if (!page.route?.startsWith("/intake/protection/")) return page;
    return { ...page, questions: addFallbackRepeaterPresentation(page.questions) };
  });
}

export function applyQuestionnaireBuiltInProtectionEnrichment(pages) {
  return pages.map((page) => {
    if (!page.route?.startsWith("/intake/protection/")) return page;
    let enriched = clone(page);
    enriched.questions = mergeDatePartGroups(enriched.questions, null, enriched);
    enriched.questions = convertCountrySelects(enriched.questions);
    enriched = enrichEmploymentPage(enriched);
    return enriched;
  });
}
