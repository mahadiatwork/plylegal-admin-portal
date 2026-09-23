import { buildQuestionnaireAnswerGroups, isQuestionVisible } from "./questionnaireAnswerModel.js";
import { buildStructuredSections, formatLabel } from "./questionnaireSections.js";

const INTERNAL_KEYS = new Set([
  "id", "profileId", "profile_id", "relationship", "createdAt", "updatedAt",
  "lastUpdated", "zohoDependentId", "zoho_dependent_id",
]);
const QUESTIONNAIRE_ROOT_KEYS = new Set([
  "id", "visaContext", "visaType", "started", "profiles", "profiles_data",
  "non_migrating_members", "non_migrating_data", "createdAt", "updatedAt",
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

function displayValue(value, options = [], yesNo = false) {
  if (Array.isArray(value)) return value.filter(hasAnswer).map((item) => displayValue(item, options, yesNo)).join(", ");
  const option = options.find((item) => String(item.value) === String(value));
  if (option) return String(option.label ?? value);
  if (value === true) return "Yes";
  if (value === false) return "No";
  if (yesNo && value === "yes") return "Yes";
  if (yesNo && value === "no") return "No";
  return String(value);
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
      else answers.push({ question: fullLabel, answer: displayValue(value, options, question.type === "yesNo") });
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

function savedSectionAliases(page) {
  const suffix = String(page?.route || "").split("?")[0].split("/").pop();
  const section = ["other", "other-details", "other-names"].includes(suffix)
    ? "other" : String(suffix || "").replace(/-/g, "_");
  const stripped = String(page?.sectionKey || "")
    .replace(/^(?:temporary_work_|protection_|partner_)(?:spouse_)?/, "")
    .split(".").pop();
  return new Set([
    page?.sectionKey, page?.metadata?.profileSection, stripped, section,
    ...(section === "other" ? ["other", "other_names", "otherNames"] : []),
    ...(section === "contact_details" ? ["contact_details", "contactDetails", "contact"] : []),
    ...(section === "details" ? ["details", "personalDetails", "personal_details"] : []),
  ].filter(Boolean));
}

function rootPath(path) {
  return String(path || "").split(".")[0];
}

function sectionProfileId(section) {
  if (section.profileId != null) return String(section.profileId);
  const match = String(section.key || "").match(/^(?:profile|nonMigrating):([^.:]+)/);
  return match?.[1];
}

function nameForProfile(profile, fallback = "Applicant") {
  return [profile?.given_names || profile?.passport?.given_names, profile?.family_name || profile?.passport?.family_name]
    .filter(Boolean).join(" ") || fallback;
}

function reviewPageTitle(item) {
  const title = item.page?.title || item.title;
  return item.page?.metadata?.renderer === "legacy" && title === item.page.metadata.originalDisplayTitle
    ? item.page.metadata.originalTitle || title : title;
}

export function buildQuestionnairePrintSections(questionnaire = {}, definition) {
  if (definition?.pages?.length) {
    const applicantOptions = (questionnaire.profiles || []).map((profile) => {
      const name = [profile.given_names, profile.family_name].filter(Boolean).join(" ") || "Unnamed Applicant";
      return { value: name, label: name };
    });
    const answerGroups = buildQuestionnaireAnswerGroups(definition, questionnaire);
    const sharedKeys = new Map();
    for (const item of answerGroups.flatMap((group) => group.items || [])) {
      if (!item.page?.metadata?.sharedStorage) continue;
      const source = item.page.metadata.storagePath || item.page.sectionKey || item.page.id;
      const keys = sharedKeys.get(source) || new Set();
      definedKeys(item.page.questions || []).forEach((key) => keys.add(key));
      (item.page.metadata.hiddenAnswerKeys || []).forEach((key) => keys.add(key));
      sharedKeys.set(source, keys);
    }
    const emittedSharedAnswers = new Set();
    const sections = answerGroups.flatMap((group) =>
      group.items.map((item) => {
        const answers = [];
        const questions = item.page?.questions || [];
        addDefinedAnswers(answers, questions, item.data || {}, applicantOptions);
        const sharedSource = item.page?.metadata?.sharedStorage
          ? item.page.metadata.storagePath || item.page.sectionKey || item.page.id : null;
        if (!sharedSource || !emittedSharedAnswers.has(sharedSource)) {
          const used = sharedSource
            ? sharedKeys.get(sharedSource)
            : new Set([...definedKeys(questions), ...(item.page?.metadata?.hiddenAnswerKeys || [])]);
          const additional = Object.fromEntries(Object.entries(item.data || {}).filter(([key]) => !used.has(key)));
          addSavedAnswers(answers, additional);
          if (sharedSource) emittedSharedAnswers.add(sharedSource);
        }
        return { key: item.key, title: `${group.title} — ${reviewPageTitle(item)}`, answers };
      }).filter((section) => section.answers.length > 0)
    );

    const mappedProfileSections = new Map();
    const mappedRootKeys = new Set(QUESTIONNAIRE_ROOT_KEYS);
    for (const group of answerGroups) {
      for (const item of group.items || []) {
        const profileId = item.profileId == null ? null : String(item.profileId);
        if (profileId && ["applicant", "nonMigrating"].includes(group.type)) {
          const identity = group.key;
          const aliases = mappedProfileSections.get(identity) || new Set();
          savedSectionAliases(item.page).forEach((alias) => aliases.add(alias));
          mappedProfileSections.set(identity, aliases);
        }
        mappedRootKeys.add(rootPath(item.page?.sectionKey));
        mappedRootKeys.add(rootPath(item.page?.metadata?.storagePath));
      }
    }
    mappedRootKeys.add("temporary_work_non_migrating");

    const storedByIdentity = new Map();
    const addStored = (identity, stored) => {
      const previous = storedByIdentity.get(identity) || {};
      storedByIdentity.set(identity, { ...previous, ...stored });
    };
    for (const [profileId, stored] of Object.entries(questionnaire.profiles_data || {})) {
      if (!stored || typeof stored !== "object" || Array.isArray(stored)) continue;
      const profile = (questionnaire.profiles || []).find((candidate) => String(candidate.id) === String(profileId));
      const member = (questionnaire.non_migrating_members || []).find((candidate) => String(candidate.id) === String(profileId));
      addStored(profile ? `profile:${profileId}` : member ? `nonMigrating:${profileId}` : `profile:${profileId}`, stored);
    }
    for (const [memberId, stored] of Object.entries(questionnaire.non_migrating_data || {})) {
      if (!stored || typeof stored !== "object" || Array.isArray(stored)) continue;
      addStored(`nonMigrating:${memberId}`, stored);
    }
    for (const [groupKey, stored] of storedByIdentity) {
      const mapped = mappedProfileSections.get(groupKey) || new Set();
      const group = answerGroups.find((candidate) => candidate.key === groupKey);
      const profileId = groupKey.slice(groupKey.indexOf(":") + 1);
      const roster = groupKey.startsWith("nonMigrating:")
        ? (questionnaire.non_migrating_members || []).find((candidate) => String(candidate.id) === profileId)
        : (questionnaire.profiles || []).find((candidate) => String(candidate.id) === profileId);
      const groupTitle = group?.title || nameForProfile(roster, profileId);
      for (const [key, value] of Object.entries(stored)) {
        if (mapped.has(key) || !hasAnswer(value)) continue;
        const answers = [];
        addSavedAnswers(answers, value);
        if (answers.length) sections.push({
          key: `${groupKey}:saved:${key}`,
          title: `${groupTitle} — ${formatLabel(key)}`,
          answers,
        });
      }
    }

    for (const [key, value] of Object.entries(questionnaire)) {
      if (mappedRootKeys.has(key) || !hasAnswer(value)) continue;
      const answers = [];
      addSavedAnswers(answers, value);
      if (answers.length) sections.push({ key: `saved-root:${key}`, title: formatLabel(key), answers });
    }
    return sections;
  }

  const profiles = new Map((questionnaire.profiles || []).map((profile) => [String(profile.id), profile]));
  const members = new Map((questionnaire.non_migrating_members || []).map((member) => [String(member.id), member]));
  const structuredSections = buildStructuredSections(questionnaire);
  const printedDetails = new Set();
  const sections = structuredSections.flatMap((section) => {
    const parts = section.subSections?.length ? section.subSections : [section];
    return parts.map((part) => {
      const answers = [];
      const profileId = sectionProfileId(section);
      const roster = section.category === "applicant" ? profiles.get(profileId)
        : section.category === "nonMigrating" ? members.get(profileId) : null;
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
    const profileId = sectionProfileId(section);
    const roster = section.category === "applicant" ? profiles.get(profileId)
      : section.category === "nonMigrating" ? members.get(profileId) : null;
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
  for (const [id, member] of members) {
    if (structuredSections.some((section) => section.category === "nonMigrating" && sectionProfileId(section) === id)) continue;
    const answers = [];
    addSavedAnswers(answers, member);
    if (answers.length) {
      const name = nameForProfile(member, "Other Family Member");
      sections.push({ key: `nonMigrating:${id}.roster`, title: `${name} — Details`, answers });
    }
  }
  return sections;
}

/**
 * Preserve the questionnaire navigation hierarchy for document renderers while
 * keeping buildQuestionnairePrintSections' long-standing flat return shape.
 */
export function buildQuestionnairePrintGroups(questionnaire = {}, definition) {
  const sections = buildQuestionnairePrintSections(questionnaire, definition);

  if (definition?.pages?.length) {
    const sectionsByKey = new Map(sections.map((section) => [section.key, section]));
    const groups = buildQuestionnaireAnswerGroups(definition, questionnaire).map((group) => ({
      key: group.key,
      title: group.title,
      subtitle: group.subtitle || "",
      type: group.type,
      sections: group.items.map((item) => {
        const section = sectionsByKey.get(item.key);
        sectionsByKey.delete(item.key);
        return section ? { ...section, title: reviewPageTitle(item) } : null;
      }).filter(Boolean),
    }));
    for (const section of sectionsByKey.values()) {
      const identity = section.key.match(/^((?:profile|nonMigrating):[^:]+):saved:/)?.[1];
      const group = identity ? groups.find((candidate) => candidate.key === identity) : null;
      if (group) {
        const prefix = `${group.title} — `;
        group.sections.push({ ...section, title: section.title.startsWith(prefix) ? section.title.slice(prefix.length) : section.title });
      } else {
        groups.push({
          key: section.key,
          title: section.title,
          subtitle: "",
          type: identity?.startsWith("nonMigrating:") ? "nonMigrating"
            : identity?.startsWith("profile:") ? "applicant" : "standalone",
          sections: [{ ...section, title: section.title }],
        });
      }
    }
    return groups.filter((group) => group.sections.length > 0);
  }

  const descriptors = new Map();
  const register = (key, title, category, childKeys = []) => {
    const descriptor = { key, title, category };
    descriptors.set(key, descriptor);
    childKeys.forEach((childKey) => descriptors.set(childKey, descriptor));
  };
  for (const section of buildStructuredSections(questionnaire)) {
    register(section.key, section.title, section.category, (section.subSections || []).map((part) => part.key));
  }
  for (const profile of questionnaire.profiles || []) {
    const key = `profile:${profile.id}`;
    if (!descriptors.has(key)) register(key, nameForProfile(profile), "applicant", [`${key}.roster`]);
  }
  (questionnaire.non_migrating_members || []).forEach((member, index) => {
    const key = `nonMigrating:${member.id}`;
    if (!descriptors.has(key)) register(key, nameForProfile(member, `Other Family Member ${index + 1}`), "nonMigrating", [`${key}.roster`]);
  });

  const groups = [];
  const groupsByKey = new Map();
  for (const section of sections) {
    const fallbackKey = section.key.replace(/\.roster$/, "");
    const descriptor = descriptors.get(section.key) || descriptors.get(fallbackKey)
      || { key: section.key, title: section.title, category: "other" };
    const prefix = `${descriptor.title} — `;
    const sectionTitle = section.title.startsWith(prefix) ? section.title.slice(prefix.length) : section.title;
    let group = groupsByKey.get(descriptor.key);
    if (!group) {
      const type = descriptor.category === "allApplicants" ? "allApplicants"
        : descriptor.category === "applicant" ? "applicant"
          : descriptor.category === "nonMigrating" ? "nonMigrating" : "standalone";
      group = { key: descriptor.key, title: descriptor.title, subtitle: "", type, sections: [] };
      groupsByKey.set(descriptor.key, group);
      groups.push(group);
    }
    group.sections.push({ ...section, title: sectionTitle });
  }
  return groups;
}
