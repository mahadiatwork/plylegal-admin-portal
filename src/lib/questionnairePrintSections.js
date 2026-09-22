import { buildQuestionnaireAnswerGroups, isQuestionVisible } from "./questionnaireAnswerModel.js";
import { buildStructuredSections, formatLabel } from "./questionnaireSections.js";

const INTERNAL_KEYS = new Set([
  "id", "profileId", "profile_id", "relationship", "createdAt", "updatedAt",
  "lastUpdated", "zohoDependentId", "zoho_dependent_id",
]);
const MONTHS = [
  "January", "February", "March", "April", "May", "June", "July", "August",
  "September", "October", "November", "December",
];

function hasAnswer(value) {
  if (Array.isArray(value)) return value.some(hasAnswer);
  if (value && typeof value === "object") return Object.values(value).some(hasAnswer);
  return value !== undefined && value !== null && value !== "";
}

function getValue(values, key) {
  if (!key) return undefined;
  if (Object.hasOwn(values || {}, key)) return values[key];
  return String(key).split(".").reduce((value, part) => value?.[part], values);
}

function displayValue(value, options = []) {
  if (value === true || value === "true" || value === "yes") return "Yes";
  if (value === false || value === "false" || value === "no") return "No";
  if (Array.isArray(value)) return value.filter(hasAnswer).map((item) => displayValue(item, options)).join(", ");
  const option = options.find((item) => String(item.value) === String(value));
  return String(option?.label ?? value);
}

function addSavedAnswers(answers, values, prefix = "", hiddenKeys = new Set()) {
  if (!hasAnswer(values)) return;
  if (Array.isArray(values)) {
    if (values.every((value) => !value || typeof value !== "object")) {
      answers.push({ question: prefix || "Answer", answer: displayValue(values) });
    } else {
      values.forEach((value, index) => addSavedAnswers(answers, value, `${prefix} — Item ${index + 1}`, hiddenKeys));
    }
    return;
  }
  if (values && typeof values === "object") {
    Object.entries(values).forEach(([key, value]) => {
      if (INTERNAL_KEYS.has(key) || hiddenKeys.has(key) || !hasAnswer(value)) return;
      addSavedAnswers(answers, value, prefix ? `${prefix} — ${formatLabel(key)}` : formatLabel(key), hiddenKeys);
    });
    return;
  }
  answers.push({ question: prefix || "Answer", answer: displayValue(values) });
}

function addDefinedAnswers(answers, questions, values, applicantOptions, prefix = "") {
  for (const question of questions || []) {
    if (!isQuestionVisible(question, values)) continue;
    const labelRule = question.metadata?.labelByValue;
    const mappedLabel = labelRule?.labels?.[getValue(values, labelRule.field)];
    const label = mappedLabel && mappedLabel !== question.metadata?.originalLabel
      ? mappedLabel : question.label || formatLabel(question.answerKey || "Answer");
    const fullLabel = prefix ? `${prefix} — ${label}` : label;
    const value = getValue(values, question.answerKey);
    if (question.type === "dateParts") {
      const parts = question.parts || Object.fromEntries(["day", "month", "year"].map((part) => [part, `${question.answerKey}_${part}`]));
      const date = ["day", "month", "year"].map((part) => {
        const raw = getValue(values, parts[part]);
        if (!hasAnswer(raw)) return "";
        if (part !== "month") return String(raw);
        return question.monthOptions?.find((option) => String(option.value) === String(raw))?.label
          || MONTHS[Number(raw) - 1] || String(raw);
      }).filter(Boolean).join(" ");
      if (date) answers.push({ question: fullLabel, answer: date });
    } else if (question.type === "repeater") {
      const rows = question.metadata?.collection === "object"
        ? (hasAnswer(value) ? [value] : [])
        : Array.isArray(value) ? value : hasAnswer(value) ? [value] : [];
      rows.forEach((row, index) => {
        const rowLabel = `${fullLabel} — Item ${index + 1}`;
        if (question.metadata?.fields?.length) addDefinedAnswers(answers, question.metadata.fields, row, applicantOptions, rowLabel);
        else addSavedAnswers(answers, row, rowLabel);
      });
    } else if (hasAnswer(value)) {
      const options = question.optionsSource === "applicants" ? applicantOptions : question.options || [];
      if (value && typeof value === "object" && !Array.isArray(value)) addSavedAnswers(answers, value, fullLabel);
      else answers.push({ question: fullLabel, answer: displayValue(value, options) });
    }
    if (question.followUps?.length) addDefinedAnswers(answers, question.followUps, values, applicantOptions, prefix);
  }
}

function definedKeys(questions) {
  return (questions || []).flatMap((question) => [
    question.answerKey,
    question.answerKey?.split(".")[0],
    ...(question.type === "dateParts" ? Object.values(question.parts || Object.fromEntries(["day", "month", "year"].map((part) => [part, `${question.answerKey}_${part}`]))) : []),
    ...definedKeys(question.followUps),
  ]).filter(Boolean);
}

export function buildQuestionnairePrintSections(questionnaire = {}, definition) {
  if (definition?.pages?.length) {
    const applicantOptions = (questionnaire.profiles || []).map((profile) => {
      const name = [profile.given_names, profile.family_name].filter(Boolean).join(" ") || "Unnamed Applicant";
      return { value: name, label: name };
    });
    return buildQuestionnaireAnswerGroups(definition, questionnaire).flatMap((group) =>
      group.items.map((item) => {
        const answers = [];
        const questions = item.page?.questions || [];
        addDefinedAnswers(answers, questions, item.data || {}, applicantOptions);
        if (!item.page?.metadata?.sharedStorage) {
          const used = new Set([...definedKeys(questions), ...(item.page?.metadata?.hiddenAnswerKeys || [])]);
          const additional = Object.fromEntries(Object.entries(item.data || {}).filter(([key]) => !used.has(key)));
          addSavedAnswers(answers, additional);
        }
        return { key: item.key, title: `${group.title} — ${item.title}`, answers };
      }).filter((section) => section.answers.length > 0)
    );
  }

  const profiles = new Map((questionnaire.profiles || []).map((profile) => [String(profile.id), profile]));
  const members = new Map((questionnaire.non_migrating_members || []).map((member) => [String(member.id), member]));
  const structuredSections = buildStructuredSections(questionnaire);
  const printedDetails = new Set();
  const sections = structuredSections.flatMap((section) => {
    const parts = section.subSections?.length ? section.subSections : [section];
    return parts.map((part) => {
      const answers = [];
      const roster = section.category === "applicant" ? profiles.get(String(section.profileId))
        : section.category === "nonMigrating" ? members.get(String(section.profileId)) : null;
      const isDetails = roster && (part.title === "Details" || part.key.endsWith(".details"));
      if (isDetails) printedDetails.add(section.key);
      addSavedAnswers(answers, isDetails ? { ...roster, ...part.data } : part.data);
      return {
        key: part.key,
        title: part === section ? section.title : `${section.title} — ${part.title}`,
        answers,
      };
    }).filter((part) => part.answers.length > 0);
  });
  for (const section of structuredSections) {
    if (printedDetails.has(section.key)) continue;
    const roster = section.category === "applicant" ? profiles.get(String(section.profileId))
      : section.category === "nonMigrating" ? members.get(String(section.profileId)) : null;
    if (!roster) continue;
    const answers = [];
    addSavedAnswers(answers, roster);
    if (answers.length) sections.push({ key: `${section.key}.roster`, title: `${section.title} — Details`, answers });
  }
  for (const [id, profile] of profiles) {
    if (structuredSections.some((section) => section.category === "applicant" && String(section.profileId) === id)) continue;
    const answers = [];
    addSavedAnswers(answers, profile);
    if (answers.length) {
      const name = [profile.given_names, profile.family_name].filter(Boolean).join(" ") || "Applicant";
      sections.push({ key: `profile:${id}.roster`, title: `${name} — Details`, answers });
    }
  }
  return sections;
}
