import { CRM_CLEAR_POLICIES, CRM_MAPPING_MODES, CRM_TARGETS, getCrmCatalogField } from "./crmFieldCatalog.js";
import { getQuestionnairePageProfileRole, normalizeCrmMapping, walkQuestionnaireQuestions } from "./questionnaireCrmContract.js";

const MONTH_INDEX = {
  january: "01", february: "02", march: "03", april: "04", may: "05", june: "06",
  july: "07", august: "08", september: "09", october: "10", november: "11", december: "12",
};

function dateParts(question) {
  return question?.parts || {
    day: `${question.answerKey}_day`,
    month: `${question.answerKey}_month`,
    year: `${question.answerKey}_year`,
  };
}

function emptyAnswer(value, question) {
  if (question?.type === "dateParts") {
    const parts = dateParts(question);
    return !String(value?.[parts.day] || "").trim()
      || !String(value?.[parts.month] || "").trim()
      || !String(value?.[parts.year] || "").trim();
  }
  return value === null || value === undefined || (typeof value === "string" && value.trim() === "");
}

function transformValue(mapping, question, values) {
  const catalogField = getCrmCatalogField(mapping.module, mapping.fieldApiName);
  const value = question.type === "dateParts" ? values : values?.[question.answerKey];
  if (emptyAnswer(value, question)) {
    return mapping.clearPolicy === CRM_CLEAR_POLICIES.clear_when_empty
      ? { empty: true, clear: true, value: null }
      : { empty: true, skip: true, skipReason: "preserve_when_empty" };
  }
  if (mapping.transform === "text" || mapping.transform === "multiline_text") {
    return { value: String(value).trim() };
  }
  if (mapping.transform === "boolean") {
    if (value === true || value === "yes" || value === "true") return { value: true };
    if (value === false || value === "no" || value === "false") return { value: false };
    return { error: "unmapped_boolean" };
  }
  if (mapping.transform === "picklist") {
    const mapped = mapping.optionMap?.[String(value).trim()];
    if (!mapped) return { error: "unmapped_picklist_value" };
    if (catalogField?.picklistValues && !catalogField.picklistValues.includes(mapped)) {
      return { error: "invalid_picklist_value" };
    }
    return { value: mapped };
  }
  if (mapping.transform === "date_parts_to_iso") {
    const parts = dateParts(question);
    const year = String(values?.[parts.year] || "").trim();
    const day = String(values?.[parts.day] || "").trim().padStart(2, "0");
    const rawMonth = String(values?.[parts.month] || "").trim();
    const month = MONTH_INDEX[rawMonth.toLowerCase()] || (Number(rawMonth) ? String(Number(rawMonth)).padStart(2, "0") : "");
    if (!year || !month || day === "00") return { skip: true, skipReason: "preserve_when_empty" };
    return { value: `${year}-${month}-${day}` };
  }
  if (mapping.transform === "number") {
    const number = Number(String(value).trim());
    return Number.isFinite(number) ? { value: number } : { error: "not_a_number" };
  }
  return { error: "unsupported_transform" };
}

function pageValues(draft, page, profileId, memberId) {
  if (page?.metadata?.profileRole === "non_migrating") {
    return (draft?.non_migrating_members || []).find((member) => String(member.id) === String(memberId || "")) || {};
  }
  if (page?.scope === "profile" && profileId) {
    const section = page.metadata?.profileSection || page.sectionKey;
    return draft?.profiles_data?.[profileId]?.[section] || draft?.profiles_data?.[profileId]?.[page.sectionKey] || {};
  }
  return draft?.[page?.sectionKey] || {};
}

function subjectsFor(draft, page, profileId) {
  const role = getQuestionnairePageProfileRole(page);
  if (role === "non_migrating") {
    return (draft?.non_migrating_members || []).filter((member) => !profileId || String(member.id) === String(profileId));
  }
  if (page?.scope !== "profile") return [null];
  return (draft?.profiles || []).filter((profile) => {
    if (profileId && String(profile.id) !== String(profileId)) return false;
    return !role || profile.relationship === role;
  });
}

export function buildAdminCrmProjection({ definition, draft = {}, application = {}, userProfile = {} }) {
  const changes = [];
  walkQuestionnaireQuestions(definition, ({ question, page, profileRole, inRepeater }) => {
    const mapping = normalizeCrmMapping(question?.metadata?.crm);
    if (!mapping || mapping.mode === CRM_MAPPING_MODES.unconfigured) {
      changes.push({ questionId: question.id, pageId: page.id, action: "skipped", reason: "unconfigured" });
      return;
    }
    if (mapping.mode === CRM_MAPPING_MODES.portal_only || question.type === "repeater" || inRepeater) {
      changes.push({
        questionId: question.id,
        pageId: page.id,
        fieldApiName: mapping.fieldApiName || null,
        action: "skipped",
        reason: mapping.mode === CRM_MAPPING_MODES.portal_only ? "portal_only" : "repeater_not_supported",
      });
      return;
    }
    subjectsFor(draft, page, null).forEach((subject) => {
      const values = pageValues(draft, page, subject?.id, subject?.id);
      const result = transformValue(mapping, question, values);
      const recordId = mapping.target === CRM_TARGETS.matter
        ? application.zohoId
        : mapping.target === CRM_TARGETS.main_contact
          ? userProfile.zohoContactId
          : subject?.zohoDependentId;
      let action = "change";
      if (result.skip) action = "preserved";
      else if (result.error) action = "skipped";
      else if (!recordId) action = "create";
      changes.push({
        questionId: question.id,
        answerKey: question.answerKey,
        pageId: page.id,
        profileId: subject?.id || null,
        module: mapping.module,
        fieldApiName: mapping.fieldApiName,
        recordId: recordId || null,
        action,
        reason: result.error || result.skipReason || null,
        value: result.skip || result.error ? "" : "[hidden]",
        writeValue: result.clear ? "" : result.value,
      });
    });
  });
  return { changes };
}
