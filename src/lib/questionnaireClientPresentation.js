const EMPLOYMENT_STORAGE_ONLY_BY_ROUTE = {
  "/intake/temporary-work/main-applicant/employment": [
    "still_working",
    "current_end_date_day",
    "current_end_date_month",
    "current_end_date_year",
  ],
  "/intake/partner/main-applicant/employment": [
    "current_duties",
    "still_working",
    "current_end_date_day",
    "current_end_date_month",
    "current_end_date_year",
  ],
};

const DATE_PART_PATTERN = /^(.*)_(day|month|year)$/;
const DATE_PART_ORDER = ["day", "month", "year"];

function humanizeAnswerKey(value) {
  return String(value || "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function normalizeCondition(condition) {
  if (!condition?.field) return null;
  return {
    field: condition.field,
    op: condition.op || "equals",
    value: condition.value,
  };
}

function conditionSignature(conditions = []) {
  return JSON.stringify(conditions.map(normalizeCondition).filter(Boolean));
}

function definitionVisaContexts(definition) {
  const contexts = Array.isArray(definition?.visaContexts)
    ? definition.visaContexts
    : definition?.visaContext
      ? [definition.visaContext]
      : [];
  return contexts.map(String);
}

function inferredEmploymentCondition(page, question, definition) {
  if (
    page?.route === "/intake/temporary-work/main-applicant/employment"
    && question?.answerKey === "visa_held"
    && definitionVisaContexts(definition).includes("186")
  ) {
    return [{ field: "country", op: "equals", value: "Australia" }];
  }
  if (!/\/main-applicant\/employment$/.test(page?.route || "")) return [];
  if (!String(question?.answerKey || "").startsWith("current_")) return [];
  return [{ field: "is_currently_employed", op: "equals", value: "yes" }];
}

function getQuestionConditions(page, question, definition) {
  const configured = Array.isArray(question?.visibleIf)
    ? question.visibleIf.map(normalizeCondition).filter(Boolean)
    : [];
  return configured.length ? configured : inferredEmploymentCondition(page, question, definition);
}

function getStorageOnlyKeys(page) {
  return new Set([
    ...(Array.isArray(page?.metadata?.hiddenAnswerKeys) ? page.metadata.hiddenAnswerKeys : []),
    ...(EMPLOYMENT_STORAGE_ONLY_BY_ROUTE[page?.route] || []),
  ]);
}

function getEntryLabel(question, duplicateLabels) {
  const label = String(question?.label || "").trim();
  if (
    question?.type === "repeater"
    && (question.answerKey === "employment_history" || duplicateLabels.has(label.toLowerCase()))
    && question.answerKey
  ) {
    return humanizeAnswerKey(question.answerKey);
  }
  return label || humanizeAnswerKey(question?.answerKey) || "Untitled question";
}

function dateLabel(question, base) {
  const label = String(question?.label || "").trim();
  const withoutPart = label
    .replace(/\s*[-–—:]?\s*(day|month|year)$/i, "")
    .trim();
  return withoutPart || humanizeAnswerKey(base);
}

function createLogicalEntries(page, questions = [], definition = null) {
  const visaContexts = definitionVisaContexts(definition);
  const visibleQuestions = questions.filter((question) => {
    if (!question) return false;
    if (
      page?.route === "/intake/temporary-work/main-applicant/employment"
      && question.answerKey === "visa_held"
      && visaContexts.length
      && !visaContexts.includes("186")
    ) return false;
    return true;
  });
  const labelCounts = new Map();
  visibleQuestions.forEach((question) => {
    const label = String(question.label || "").trim().toLowerCase();
    if (label) labelCounts.set(label, (labelCounts.get(label) || 0) + 1);
  });
  const duplicateLabels = new Set(
    [...labelCounts.entries()].filter(([, count]) => count > 1).map(([label]) => label)
  );
  const consumed = new Set();

  return visibleQuestions.flatMap((question) => {
    if (consumed.has(question.id)) return [];
    const match = String(question.answerKey || "").match(DATE_PART_PATTERN);

    if (match) {
      const [, base] = match;
      const parts = DATE_PART_ORDER.map((part) => visibleQuestions.find((candidate) =>
        candidate.answerKey === `${base}_${part}`
        && conditionSignature(getQuestionConditions(page, candidate, definition))
          === conditionSignature(getQuestionConditions(page, question, definition))
      ));
      if (parts.every(Boolean)) {
        parts.forEach((part) => consumed.add(part.id));
        return [{
          id: `date:${base}`,
          kind: "date",
          label: dateLabel(question, base),
          group: question.metadata?.group || "",
          questions: parts,
          conditions: getQuestionConditions(page, question, definition),
          required: parts.some((part) => part.required),
          nestedEntries: [],
        }];
      }
    }

    consumed.add(question.id);
    const nestedQuestions = Array.isArray(question.metadata?.fields)
      ? question.metadata.fields
      : [];
    return [{
      id: question.id,
      kind: question.type === "repeater" ? "repeater" : "question",
      label: getEntryLabel(question, duplicateLabels),
      group: question.metadata?.group || "",
      questions: [question],
      conditions: getQuestionConditions(page, question, definition),
      required: Boolean(question.required),
      nestedEntries: createLogicalEntries(page, nestedQuestions, definition),
    }];
  });
}

function sourceAnswerKeys(entry) {
  return new Set(entry.questions.map((question) => question.answerKey).filter(Boolean));
}

function addConditionalGroup(target, group) {
  return {
    ...target,
    conditionalGroups: [...(target.conditionalGroups || []), group],
  };
}

export function getClientQuestionnairePresentation(page, definition = null) {
  const questions = Array.isArray(page?.questions) ? page.questions : [];
  const storageOnlyKeys = getStorageOnlyKeys(page);
  const storageQuestions = questions.filter((question) => storageOnlyKeys.has(question.answerKey));
  const clientQuestions = questions.filter((question) => !storageOnlyKeys.has(question.answerKey));
  const entries = createLogicalEntries(page, clientQuestions, definition);
  let primaryEntries = entries
    .filter((entry) => entry.conditions.length === 0)
    .map((entry) => ({ ...entry, conditionalGroups: [] }));
  const conditionalEntries = entries.filter((entry) => entry.conditions.length > 0);
  const groupedConditionals = new Map();

  conditionalEntries.forEach((entry) => {
    const signature = conditionSignature(entry.conditions);
    const current = groupedConditionals.get(signature) || {
      id: `condition:${signature}`,
      conditions: entry.conditions,
      entries: [],
    };
    current.entries.push(entry);
    groupedConditionals.set(signature, current);
  });

  const orphanConditionalGroups = [];
  groupedConditionals.forEach((group) => {
    const controllerField = group.conditions[0]?.field;
    const controllerIndex = primaryEntries.findIndex((entry) =>
      sourceAnswerKeys(entry).has(controllerField)
    );
    if (controllerIndex >= 0) {
      primaryEntries = primaryEntries.map((entry, index) =>
        index === controllerIndex ? addConditionalGroup(entry, group) : entry
      );
    } else {
      orphanConditionalGroups.push(group);
    }
  });

  return {
    primaryEntries,
    orphanConditionalGroups,
    storageQuestions,
    primaryCount: primaryEntries.length,
    displayedQuestionIds: entries.flatMap((entry) => entry.questions.map((question) => question.id)),
    storageQuestionIds: storageQuestions.map((question) => question.id),
  };
}

function conditionValueLabel(sourceQuestion, value) {
  const values = Array.isArray(value) ? value : [value];
  const labels = values.map((item) => {
    const option = sourceQuestion?.options?.find((candidate) => candidate.value === item);
    if (option?.label) return option.label;
    if (item === true) return "Checked";
    if (item === false) return "Not checked";
    return String(item ?? "");
  }).filter(Boolean);
  return labels.join(" or ");
}

export function describeClientCondition(conditions = [], entries = []) {
  const condition = conditions[0];
  if (!condition) return "Shown conditionally";
  const source = entries.find((entry) => sourceAnswerKeys(entry).has(condition.field));
  const sourceQuestion = source?.questions?.find((question) => question.answerKey === condition.field);
  const sourceLabel = source?.label || humanizeAnswerKey(condition.field);
  if (condition.op === "exists") return `Shown after “${sourceLabel}” is answered`;
  if (condition.op === "notExists") return `Shown while “${sourceLabel}” has no answer`;
  const valueLabel = conditionValueLabel(sourceQuestion, condition.value);
  const operator = condition.op === "notEquals" || condition.op === "notIn" ? "is not" : "is";
  return valueLabel
    ? `Shown when “${sourceLabel}” ${operator} ${valueLabel}`
    : `Shown conditionally from “${sourceLabel}”`;
}
