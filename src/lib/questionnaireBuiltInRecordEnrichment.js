/* Visa-neutral built-in record enrichment helpers.
 * Shared date grouping, country option conversion, and repeater presentation
 * fallbacks. Protection/866 and temporary-work/482 both build on this module.
 * Keep visa-specific copy and validation in their own enrichment modules.
 */

const DATE_PART_SUFFIXES = ["day", "month", "year"];
const DATE_PART_PATTERN = /^(.*)_(day|month|year)$/;
const COUNTRY_KEYS = new Set([
  "country",
  "country_of_birth",
  "country_of_issue",
  "issuing_country",
  "passport_country",
  "nationality",
  "previous_nationality",
  "citizenship_country",
  "residence_country",
  "current_country",
  "place_of_birth_country",
  "visa_country",
  "departure_country",
  "arrival_country",
  "commercial_country",
  "postal_country",
  "usual_country_of_residence",
]);

export const NEUTRAL_ROW_FORMATTERS = Object.freeze({
  groupedDate: "groupedDate",
  groupedDateOrOngoing: "groupedDateOrOngoing",
});

function conditionSignature(conditions) {
  if (!Array.isArray(conditions) || conditions.length === 0) return "";
  return JSON.stringify(conditions.map((c) => ({ field: c.field, op: c.op, value: c.value })));
}

function collectQuestions(questions, callback, prefix = "") {
  (questions || []).forEach((question, index) => {
    const path = `${prefix}[${index}]`;
    callback(question, path);
    collectQuestions(question.followUps, callback, `${path}.followUps`);
    collectQuestions(question.metadata?.fields, callback, `${path}.metadata.fields`);
  });
}

export function looksLikeCountryKey(answerKey) {
  if (!answerKey) return false;
  const normalized = String(answerKey).toLowerCase().replace(/_/g, "");
  return COUNTRY_KEYS.has(answerKey) ||
    /countryofbirth|countryofissue|countryofexam|issuingcountry|passportcountry|nationality|citizenship|residencecountry|usualcountryofresidence|visacountry|departurecountry|arrivalcountry|commercialcountry|postalcountry|phonecountrycode/.test(normalized);
}

function mergeDatePartGroupsInArray(questions) {
  const bySignature = new Map();
  collectQuestions(questions, (question) => {
    const match = String(question.answerKey || "").match(DATE_PART_PATTERN);
    if (!match) return;
    const [, base, part] = match;
    const sig = conditionSignature(question.visibleIf);
    const groupKey = `${base}:${sig}:${question.metadata?.group || ""}`;
    if (!bySignature.has(groupKey)) bySignature.set(groupKey, { base, sig, group: question.metadata?.group, parts: {} });
    bySignature.get(groupKey).parts[part] = question;
  });

  const idsToRemove = new Set();
  const replacements = new Map();
  bySignature.forEach((group) => {
    if (!DATE_PART_SUFFIXES.every((part) => group.parts[part])) return;
    const dayQuestion = group.parts.day;
    const monthQuestion = group.parts.month;
    const yearQuestion = group.parts.year;
    idsToRemove.add(dayQuestion.id);
    idsToRemove.add(monthQuestion.id);
    idsToRemove.add(yearQuestion.id);

    const existingId = dayQuestion.id.replace(/_day$/, "").replace(/-day$/, "");
    const labelBase = dayQuestion.label.replace(/\s*[-–—:]?\s*day$/i, "").trim();
    const dateQuestion = {
      id: existingId,
      answerKey: group.base,
      label: labelBase || group.base,
      type: "dateParts",
      required: dayQuestion.required || monthQuestion.required || yearQuestion.required,
      parts: {
        day: dayQuestion.answerKey,
        month: monthQuestion.answerKey,
        year: yearQuestion.answerKey,
      },
      metadata: {
        originalLabel: (dayQuestion.metadata?.originalLabel || dayQuestion.label).replace(/\s*[-–—:]?\s*day$/i, "").trim(),
        ...(dayQuestion.metadata?.originalDescription ? { originalDescription: dayQuestion.metadata.originalDescription } : {}),
        ...(dayQuestion.metadata?.originalPlaceholder ? { originalPlaceholder: dayQuestion.metadata.originalPlaceholder } : {}),
        ...(group.group ? { group: group.group } : {}),
        ...(dayQuestion.metadata?.storageOnly ? { storageOnly: true } : {}),
        fieldGroup: {
          id: group.base,
          label: labelBase || group.base,
          kind: "dateParts",
          order: ["day", "month", "year"],
        },
      },
    };
    if (dayQuestion.validation) dateQuestion.validation = dayQuestion.validation;
    if (dayQuestion.description || monthQuestion.description || yearQuestion.description) {
      dateQuestion.description = dayQuestion.description || monthQuestion.description || yearQuestion.description;
    }
    if (dayQuestion.placeholder || monthQuestion.placeholder || yearQuestion.placeholder) {
      dateQuestion.placeholder = dayQuestion.placeholder || monthQuestion.placeholder || yearQuestion.placeholder;
    }
    if (dayQuestion.visibleIf) dateQuestion.visibleIf = dayQuestion.visibleIf;
    if (dayQuestion.clearWhenHidden !== undefined) dateQuestion.clearWhenHidden = dayQuestion.clearWhenHidden;
    replacements.set(dayQuestion.id, dateQuestion);
  });

  function rewrite(items) {
    const result = [];
    for (const item of items) {
      const replacement = replacements.get(item.id);
      if (replacement) {
        result.push(replacement);
        continue;
      }
      if (idsToRemove.has(item.id)) continue;
      const next = { ...item };
      if (next.followUps?.length) next.followUps = rewrite(next.followUps);
      if (next.metadata?.fields?.length) next.metadata = { ...next.metadata, fields: rewrite(next.metadata.fields) };
      result.push(next);
    }
    return result;
  }

  return rewrite(questions);
}

export function mergeDatePartGroups(questions) {
  return mergeDatePartGroupsInArray(questions);
}

export function convertCountrySelects(questions) {
  collectQuestions(questions, (question) => {
    if (question.type === "text" && looksLikeCountryKey(question.answerKey)) {
      question.type = "select";
      question.optionsSource = "countries";
      if (!question.placeholder) {
        question.placeholder = "Choose Country";
      } else if (question.metadata && !question.metadata.originalPlaceholder) {
        question.metadata.originalPlaceholder = question.placeholder;
      }
    }
  });
  return questions;
}

function fallbackColumns(fields, formatter) {
  const columns = fields
    .filter((field) => field.type !== "dateParts")
    .slice(0, 6)
    .map((field) => ({ key: field.answerKey, label: field.label }));
  if (!columns.length) {
    const first = fields[0];
    if (first?.type === "dateParts" && first.parts) {
      columns.push({ key: first.parts.day, label: first.label, format: formatter });
    } else if (first?.answerKey) {
      columns.push({ key: first.answerKey, label: first.label });
    }
  }
  return columns;
}

export function applyRepeaterPresentationFallback(pages, pagePrefix, { formatter = NEUTRAL_ROW_FORMATTERS.groupedDate } = {}) {
  function decorate(questions) {
    return questions.map((question) => {
      const next = { ...question };
      if (next.type === "repeater" && Array.isArray(next.metadata?.fields) && next.metadata.fields.length > 0) {
        if (!next.metadata.presentation) {
          const presentation = {
            ...(next.metadata.collection === "object" ? {} : { addLabel: "Add" }),
            emptyMessage: "No entries added",
            addDialogTitle: "Add Entry",
            editDialogTitle: "Edit Entry",
            columns: fallbackColumns(next.metadata.fields, formatter),
            actions: {
              edit: "Edit",
              delete: "Delete",
              cancel: "Cancel",
              confirm: "Ok",
              actionsHeading: "Actions",
            },
          };
          next.metadata = {
            ...next.metadata,
            originalPresentation: presentation,
            presentation,
          };
        }
      }
      if (next.followUps?.length) next.followUps = decorate(next.followUps);
      if (next.metadata?.fields?.length) next.metadata = { ...next.metadata, fields: decorate(next.metadata.fields) };
      return next;
    });
  }
  return pages.map((page) => {
    if (pagePrefix && !page.route?.startsWith(pagePrefix)) return page;
    return { ...page, questions: decorate(page.questions) };
  });
}
