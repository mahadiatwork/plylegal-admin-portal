"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowDown,
  ArrowUp,
  Braces,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Copy,
  Eye,
  FileText,
  FileJson,
  GripVertical,
  Layers3,
  Loader2,
  LockKeyhole,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  Send,
  Settings2,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useMatterData } from "@/components/matter/MatterDataContext";
import MatterTabLoadingState from "@/components/matter/MatterTabLoadingState";
import { getRegisteredQuestionnaireRoutes } from "@/lib/routes";
import { temporaryWork482Definition } from "@/lib/questionnaireStarterTemplates";
import { questionnaireBuiltInTemplates } from "@/lib/questionnaireBuiltIns";
import { hydrateLegacyQuestionnaireDefinition } from "@/lib/questionnaireLegacyProtection";
import {
  CRM_CLEAR_POLICIES,
  CRM_MAPPING_MODES,
  compatibleTransformsFor,
  listCrmCatalogFields,
  moduleForCrmTarget,
} from "@/lib/crmFieldCatalog";
import { getCrmCoverageSummary, normalizeCrmMapping } from "@/lib/questionnaireCrmContract";

const QUESTION_TYPES = [
  ["text", "Short text"],
  ["textarea", "Long text"],
  ["yesNo", "Yes / No"],
  ["radio", "Radio choices"],
  ["select", "Dropdown"],
  ["checkbox", "Checkbox"],
  ["dateParts", "Date (day / month / year)"],
  ["repeater", "Repeating records (developer component required)"],
];

const CONDITION_OPERATORS = [
  ["equals", "Equals"],
  ["notEquals", "Does not equal"],
  ["in", "Is one of"],
  ["notIn", "Is not one of"],
  ["exists", "Has an answer"],
  ["notExists", "Has no answer"],
];

const STATUS_STYLES = {
  active: "border-emerald-200 bg-emerald-50 text-emerald-700",
  draft: "border-amber-200 bg-amber-50 text-amber-700",
  archived: "border-slate-200 bg-slate-100 text-slate-600",
};

const inputClassName = "h-10 border-[#d7e4de] bg-white text-[#17372e]";
const selectClassName =
  "h-10 w-full rounded-md border border-[#d7e4de] bg-white px-3 text-sm text-[#17372e] outline-none transition focus:border-[#4F726B] focus:ring-2 focus:ring-[#4F726B]/15 disabled:cursor-not-allowed disabled:bg-[#f3f6f4] disabled:text-[#80928b]";
const RESERVED_WORKFLOW_ROUTE = /\/(?:start|profile|submit)$/;

function getRouteScope(route) {
  return /^\/intake\/(?:temporary-work|partner|protection)\/(?:main-applicant|spouse-partner|children\/[^/]+|non-migrating\/[^/]+)\//.test(route)
    ? "profile"
    : "shared";
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function slugify(value, fallback = "item") {
  const slug = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || fallback;
}

function uniqueId(existingIds, base) {
  const normalizedBase = slugify(base);
  if (!existingIds.has(normalizedBase)) return normalizedBase;

  let suffix = 2;
  while (existingIds.has(`${normalizedBase}-${suffix}`)) suffix += 1;
  return `${normalizedBase}-${suffix}`;
}

function normalizeQuestion(question = {}, index = 0) {
  const id = String(question.id || question.answerKey || `question-${index + 1}`);
  return {
    ...question,
    id,
    answerKey: String(question.answerKey || id).replace(/-/g, "_"),
    label: String(question.label || "Untitled question"),
    type: String(question.type || "text"),
    required: Boolean(question.required),
    ...(Array.isArray(question.options)
      ? {
          options: question.options.map((option, optionIndex) => ({
            ...option,
            value: String(option?.value ?? `option_${optionIndex + 1}`),
            label: String(option?.label ?? option?.value ?? `Option ${optionIndex + 1}`),
          })),
        }
      : {}),
    ...(Array.isArray(question.followUps)
      ? {
          followUps: question.followUps.map((followUp, followUpIndex) =>
            normalizeQuestion(followUp, followUpIndex)
          ),
        }
      : {}),
  };
}

function normalizePage(page = {}, index = 0) {
  const id = String(page.id || `page-${index + 1}`);
  const normalized = {
    ...page,
    id,
    title: String(page.title || "Untitled page"),
    route: String(page.route || ""),
    sectionKey: String(page.sectionKey || id.replace(/-/g, "_")),
    completionKey: String(page.completionKey || ""),
    scope: page.scope === "profile" ? "profile" : "shared",
    order: Number.isFinite(Number(page.order)) ? Number(page.order) : (index + 1) * 10,
    introBlocks: Array.isArray(page.introBlocks) ? page.introBlocks : [],
    questions: Array.isArray(page.questions)
      ? page.questions.map((question, questionIndex) => normalizeQuestion(question, questionIndex))
      : [],
  };
  delete normalized.createdAt;
  delete normalized.createdBy;
  delete normalized.updatedAt;
  delete normalized.updatedBy;
  return normalized;
}

function normalizeDefinition(definition = {}) {
  const legacyContext = definition.visaContext ? [String(definition.visaContext)] : [];
  const visaContexts = Array.isArray(definition.visaContexts)
    ? definition.visaContexts.map(String).map((value) => value.trim()).filter(Boolean)
    : legacyContext;
  const normalized = {
    ...definition,
    schemaVersion: Number.isFinite(Number(definition.schemaVersion))
      ? Number(definition.schemaVersion)
      : 1,
    id: String(definition.id || ""),
    title: String(definition.title || "Untitled questionnaire"),
    version: String(definition.version || "1.0.0"),
    visaType: String(definition.visaType || "temporary-work"),
    visaContexts: [...new Set(visaContexts)],
    status: ["draft", "active", "archived"].includes(String(definition.status || "draft").toLowerCase())
      ? String(definition.status || "draft").toLowerCase()
      : "draft",
    revision: Number.isInteger(Number(definition.revision)) ? Number(definition.revision) : 0,
    pages: Array.isArray(definition.pages)
      ? definition.pages.map((page, pageIndex) => normalizePage(page, pageIndex))
      : [],
  };
  if (visaContexts.length === 1) normalized.visaContext = visaContexts[0];
  else delete normalized.visaContext;
  delete normalized.pageCount;
  delete normalized.questionCount;
  return normalized;
}

function collectQuestionMachineKeys(questions, ids, answerKeys) {
  (questions || []).forEach((question) => {
    if (question.id) ids.add(question.id);
    if (question.answerKey) answerKeys.add(question.answerKey);
    collectQuestionMachineKeys(question.followUps, ids, answerKeys);
    collectQuestionMachineKeys(question.metadata?.fields, ids, answerKeys);
  });
}

function flattenQuestions(questions, flattened = []) {
  (questions || []).forEach((question) => {
    flattened.push(question);
    flattenQuestions(question.followUps, flattened);
  });
  return flattened;
}

function updateQuestionTree(questions = [], questionId, updater) {
  return questions.map((question) => {
    let nextQuestion = question.id === questionId ? updater(question) : question;

    if (nextQuestion.followUps?.length) {
      nextQuestion = {
        ...nextQuestion,
        followUps: updateQuestionTree(nextQuestion.followUps, questionId, updater),
      };
    }
    if (nextQuestion.metadata?.fields?.length) {
      nextQuestion = {
        ...nextQuestion,
        metadata: {
          ...nextQuestion.metadata,
          fields: updateQuestionTree(nextQuestion.metadata.fields, questionId, updater),
        },
      };
    }

    return nextQuestion;
  });
}

const DEFAULT_YES_NO_OPTIONS = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
];

function getQuestionOptions(question) {
  if (Array.isArray(question?.options) && question.options.length) return question.options;
  return question?.type === "yesNo" ? DEFAULT_YES_NO_OPTIONS : [];
}

function makeChoiceValue() {
  const token = globalThis.crypto?.randomUUID?.()
    || `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
  return `choice_${token.replace(/[^a-z0-9_]/gi, "").toLowerCase()}`;
}

function conditionIncludesValue(condition, value) {
  if (["exists", "notExists"].includes(condition?.op)) return false;
  return Array.isArray(condition?.value)
    ? condition.value.includes(value)
    : condition?.value === value;
}

function findChoiceDependents(questions, answerKey, value, matches = []) {
  (questions || []).forEach((question) => {
    if ((question.visibleIf || []).some(
      (condition) => condition.field === answerKey && conditionIncludesValue(condition, value)
    )) {
      matches.push(question.label || "another question");
    }
    findChoiceDependents(question.followUps, answerKey, value, matches);
    findChoiceDependents(question.metadata?.fields, answerKey, value, matches);
  });
  return [...new Set(matches)];
}

function findQuestionDependents(questions, answerKey, excludedQuestionId, matches = []) {
  (questions || []).forEach((question) => {
    if (
      question.id !== excludedQuestionId &&
      (question.visibleIf || []).some((condition) => condition.field === answerKey)
    ) {
      matches.push(question.label || "another question");
    }
    findQuestionDependents(question.followUps, answerKey, excludedQuestionId, matches);
    findQuestionDependents(question.metadata?.fields, answerKey, excludedQuestionId, matches);
  });
  return [...new Set(matches)];
}

function promotePageForStructure(page) {
  if (page?.metadata?.renderer !== "legacy") return page;
  return {
    ...page,
    metadata: {
      ...page.metadata,
      renderer: "dynamic",
    },
  };
}

function parseBooleanConditionValue(value) {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  return null;
}

function normalizeConditionForSource(condition, sourceQuestion) {
  const normalized = { ...condition };
  if (["exists", "notExists"].includes(normalized.op)) {
    delete normalized.value;
    return normalized;
  }

  if (["in", "notIn"].includes(normalized.op)) {
    const rawValues = Array.isArray(normalized.value) ? normalized.value : [normalized.value];
    if (sourceQuestion?.type !== "checkbox") {
      normalized.value = rawValues.filter((value) => value !== undefined && value !== "");
      return normalized;
    }
    const booleanValues = rawValues
      .map(parseBooleanConditionValue)
      .filter((value) => value !== null);
    normalized.value = booleanValues.length ? [...new Set(booleanValues)] : [true];
    return normalized;
  }

  const rawValue = Array.isArray(normalized.value) ? normalized.value[0] : normalized.value;
  normalized.value = sourceQuestion?.type === "checkbox"
    ? parseBooleanConditionValue(rawValue) ?? true
    : rawValue ?? "";
  return normalized;
}

function getCheckboxConditionEditorValue(condition) {
  if (["in", "notIn"].includes(condition?.op)) {
    if (!Array.isArray(condition?.value) || condition.value.some((value) => typeof value !== "boolean")) {
      return "";
    }
    const values = new Set(condition.value);
    if (values.has(true) && values.has(false)) return "both";
    if (values.has(true)) return "true";
    if (values.has(false)) return "false";
    return "";
  }
  return typeof condition?.value === "boolean" ? String(condition.value) : "";
}

function getDefinitionsFromResponse(payload) {
  const candidates = [
    payload?.definitions,
    payload?.data?.definitions,
    Array.isArray(payload?.data) ? payload.data : null,
  ];
  return candidates.find(Array.isArray) || [];
}

function getDefinitionFromResponse(payload) {
  const candidates = [payload?.definition, payload?.data?.definition, payload?.data];
  return candidates.find(
    (candidate) => candidate && typeof candidate === "object" && !Array.isArray(candidate)
  );
}

function questionnaireAudienceKey(definition) {
  const contexts = Array.isArray(definition?.visaContexts)
    ? definition.visaContexts
    : definition?.visaContext
      ? [definition.visaContext]
      : [];
  return `${definition?.visaType || ""}|${[...contexts].sort().join(",")}`;
}

function definitionUpdatedAt(definition) {
  return Date.parse(definition?.updatedAt || definition?.createdAt || "") || 0;
}

function getOwnerQuestionnaires(definitions) {
  const currentActiveByAudience = new Map();
  const tests = [];
  definitions.forEach((candidate) => {
    if (!candidate || candidate.status === "archived") return;
    if (candidate.status !== "active") {
      tests.push(candidate);
      return;
    }
    const audienceKey = questionnaireAudienceKey(candidate);
    const current = currentActiveByAudience.get(audienceKey);
    if (!current || definitionUpdatedAt(candidate) > definitionUpdatedAt(current)) {
      currentActiveByAudience.set(audienceKey, candidate);
    }
  });

  return [...currentActiveByAudience.values(), ...tests]
    .sort((left, right) =>
      Number(right.status === "active") - Number(left.status === "active") ||
      definitionUpdatedAt(right) - definitionUpdatedAt(left) ||
      String(left?.title || left?.id || "").localeCompare(String(right?.title || right?.id || ""))
    );
}

function getEmbeddedQuestionnaireCatalog(definitions) {
  const supportedAudiences = new Set(
    questionnaireBuiltInTemplates.map(questionnaireAudienceKey)
  );
  const savedEntries = definitions
    .filter((definition) => supportedAudiences.has(questionnaireAudienceKey(definition)))
    .map((definition) => ({
      audienceKey: questionnaireAudienceKey(definition),
      definition,
      source: "saved",
    }));
  const activeAudiences = new Set(
    definitions
      .filter((definition) => definition.status === "active")
      .map(questionnaireAudienceKey)
  );
  const fallbackEntries = questionnaireBuiltInTemplates
    .filter((template) => !activeAudiences.has(questionnaireAudienceKey(template)))
    .map((template) => ({
      audienceKey: questionnaireAudienceKey(template),
      definition: template,
      source: "builtIn",
    }));

  return [...savedEntries, ...fallbackEntries].sort((left, right) =>
    Number(right.definition.status === "active") - Number(left.definition.status === "active") ||
    definitionUpdatedAt(right.definition) - definitionUpdatedAt(left.definition) ||
    String(left.definition.title || "").localeCompare(String(right.definition.title || ""))
  );
}

function getErrorMessage(payload, fallback) {
  const details = payload?.details;
  if (Array.isArray(details) && details.length) return `${payload?.error || fallback}: ${details.join("; ")}`;
  if (typeof details === "string" && details) return `${payload?.error || fallback}: ${details}`;
  return payload?.error || payload?.message || fallback;
}

async function apiRequest(url, options = {}) {
  const isRead = ["GET", "HEAD"].includes((options.method || "GET").toUpperCase());
  const readTimeout = isRead ? AbortSignal.timeout(15_000) : undefined;
  let response;
  let raw;
  try {
    response = await fetch(url, {
      cache: "no-store",
      ...options,
      ...(readTimeout ? { signal: readTimeout } : {}),
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...options.headers,
      },
    });
    raw = await response.text();
  } catch (requestError) {
    if (readTimeout?.aborted) {
      throw new Error("The server took too long to respond. Try Refresh again.");
    }
    throw requestError;
  }
  let payload = {};

  if (raw) {
    try {
      payload = JSON.parse(raw);
    } catch {
      payload = { error: raw };
    }
  }

  if (!response.ok || payload?.success === false) {
    const error = new Error(getErrorMessage(payload, `Request failed (${response.status})`));
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

async function fetchDefinition(id) {
  const payload = await apiRequest(`/api/questionnaire-definitions/${encodeURIComponent(id)}`);
  const definition = getDefinitionFromResponse(payload);
  if (!definition) throw new Error("The questionnaire API returned no definition.");
  return normalizeDefinition(hydrateLegacyQuestionnaireDefinition(definition));
}

function countQuestions(questions = []) {
  return questions.reduce(
    (total, question) => total + 1 + countQuestions(question?.followUps || []) + countQuestions(question?.metadata?.fields || []),
    0
  );
}

function flattenFollowUps(questions = [], depth = 1) {
  return questions.flatMap((question) => [
    { question, depth },
    ...flattenFollowUps(question.followUps || [], depth + 1),
  ]);
}

function definitionCounts(definition) {
  const pages = Array.isArray(definition?.pages) ? definition.pages : [];
  const pageCount = Number.isFinite(Number(definition?.pageCount))
    ? Number(definition.pageCount)
    : pages.length;
  const questionCount = Number.isFinite(Number(definition?.questionCount))
    ? Number(definition.questionCount)
    : pages.reduce((total, page) => total + countQuestions(page.questions || []), 0);
  return { pageCount, questionCount };
}

function getRegisteredRoutes(definition) {
  return getRegisteredQuestionnaireRoutes(
    definition?.visaType,
    definition?.visaContexts?.length
      ? definition.visaContexts
      : definition?.visaContext
        ? [definition.visaContext]
        : []
  ).filter((route) =>
        route?.href?.startsWith("/intake/") && !RESERVED_WORKFLOW_ROUTE.test(route.href)
      );
}

function audienceLabel(definition) {
  const contexts = Array.isArray(definition?.visaContexts)
    ? definition.visaContexts
    : definition?.visaContext
      ? [definition.visaContext]
      : [];
  return [definition?.visaType || "No visa type", contexts.length ? contexts.join(", ") : "All contexts"].join(" · ");
}

function getIntroText(page) {
  return page?.introBlocks?.find((block) => block?.type === "paragraph")?.text || "";
}

function setIntroText(page, text) {
  const blocks = Array.isArray(page.introBlocks) ? [...page.introBlocks] : [];
  const paragraphIndex = blocks.findIndex((block) => block?.type === "paragraph");

  if (paragraphIndex >= 0) {
    if (text) {
      blocks[paragraphIndex] = { ...blocks[paragraphIndex], text };
    } else {
      blocks.splice(paragraphIndex, 1);
    }
  } else if (text) {
    blocks.unshift({ type: "paragraph", text });
  }

  return { ...page, introBlocks: blocks };
}

function makeNewDefinition() {
  const token = Date.now().toString(36);
  return normalizeDefinition({
    id: `questionnaire-${token}`,
    title: "New questionnaire",
    version: "1.0.0",
    visaType: "temporary-work",
    visaContexts: ["482"],
    status: "draft",
    revision: 0,
    pages: [],
  });
}

function StatusBadge({ status }) {
  const label = status === "active" ? "Live" : status === "draft" ? "Test" : "Archived";
  return (
    <Badge variant="outline" className={STATUS_STYLES[status] || STATUS_STYLES.draft}>
      {label}
    </Badge>
  );
}

function FieldLabel({ children, htmlFor, hint }) {
  return (
    <label htmlFor={htmlFor} className="block text-sm font-medium text-[#224238]">
      {children}
      {hint ? <span className="ml-1 font-normal text-[#71857d]">{hint}</span> : null}
    </label>
  );
}

function questionTypeLabel(type) {
  return QUESTION_TYPES.find(([value]) => value === type)?.[1] || type || "Question";
}

function QuestionPreview({ question }) {
  if (!question) return null;
  const options = getQuestionOptions(question);

  return (
    <div className="rounded-xl border border-[#dbe6e0] bg-white p-5 shadow-[0_1px_2px_rgba(23,55,46,0.04)]">
      <p className="text-lg font-semibold leading-7 text-[#17372e]">
        {question.label}
        {question.required ? <span className="ml-1 text-[#c04438]">*</span> : null}
      </p>
      {question.description ? (
        <p className="mt-2 text-sm leading-6 text-[#6c8078]">{question.description}</p>
      ) : null}

      {options.length ? (
        <div className="mt-5 space-y-3">
          {options.map((option) => (
            <div key={option.value} className="flex items-center gap-3 text-sm text-[#38564b]">
              <span className={`h-5 w-5 shrink-0 border border-[#9eb6ac] bg-white ${question.type === "select" ? "rounded-md" : "rounded-full"}`} />
              <span>{option.label}</span>
            </div>
          ))}
        </div>
      ) : question.type === "textarea" ? (
        <div className="mt-5 h-24 rounded-lg border border-[#cddbd5] bg-[#fbfcfb] px-3 py-2 text-sm text-[#91a29b]">
          {question.placeholder || "Enter your answer"}
        </div>
      ) : question.type === "dateParts" ? (
        <div className="mt-5 grid grid-cols-3 gap-2">
          {["DD", "MM", "YYYY"].map((part) => (
            <div key={part} className="rounded-lg border border-[#cddbd5] bg-[#fbfcfb] px-3 py-3 text-center text-sm text-[#91a29b]">{part}</div>
          ))}
        </div>
      ) : question.type === "checkbox" ? (
        <div className="mt-5 flex items-center gap-3 text-sm text-[#38564b]">
          <span className="h-5 w-5 rounded border border-[#9eb6ac] bg-white" />
          <span>{question.placeholder || "Yes"}</span>
        </div>
      ) : question.type === "repeater" ? (
        <div className="mt-5 rounded-lg border border-dashed border-[#bdd0c7] bg-[#f8fbf9] px-4 py-5 text-sm text-[#6c8078]">
          Clients can add one or more records here.
        </div>
      ) : (
        <div className="mt-5 rounded-lg border border-[#cddbd5] bg-[#fbfcfb] px-3 py-3 text-sm text-[#91a29b]">
          {question.placeholder || (question.type === "select" ? "Choose an option" : "Enter your answer")}
        </div>
      )}
    </div>
  );
}

function QuestionCrmSyncPanel({ question, disabled, onChange }) {
  const mapping = normalizeCrmMapping(question?.metadata?.crm) || { mode: CRM_MAPPING_MODES.unconfigured };
  const mode = mapping.mode || CRM_MAPPING_MODES.unconfigured;
  const moduleName = mapping.module || moduleForCrmTarget(mapping.target);
  const fields = moduleName ? listCrmCatalogFields(moduleName) : [];
  const selectedField = fields.find((field) => field.apiName === mapping.fieldApiName);
  const transforms = selectedField ? compatibleTransformsFor(question.type, selectedField.type) : [];
  const optionValues = Array.isArray(question.options) ? question.options : [];

  function emit(patch) {
    if (patch.mode === CRM_MAPPING_MODES.unconfigured) {
      onChange(null);
      return;
    }
    if (patch.mode === CRM_MAPPING_MODES.portal_only) {
      onChange({ mode: CRM_MAPPING_MODES.portal_only });
      return;
    }
    const next = {
      mode: CRM_MAPPING_MODES.field,
      target: patch.target || mapping.target || "",
      module: "",
      fieldApiName: patch.fieldApiName || mapping.fieldApiName || "",
      transform: patch.transform || mapping.transform || "",
      clearPolicy: patch.clearPolicy || mapping.clearPolicy || CRM_CLEAR_POLICIES.preserve_when_empty,
      optionMap: patch.optionMap || mapping.optionMap || {},
    };
    next.module = moduleForCrmTarget(next.target) || "";
    if (patch.target && patch.target !== mapping.target) {
      next.fieldApiName = "";
      next.transform = "";
      next.optionMap = {};
    }
    onChange(next);
  }

  return (
    <div className="space-y-3 rounded-xl border border-[#e1e9e5] bg-[#f8fbf9] p-4">
      <div>
        <h4 className="text-sm font-semibold text-[#24453b]">CRM synchronization</h4>
        <p className="text-xs text-[#71857d]">Map this answer to a verified Zoho field. Module and field names cannot be typed freely.</p>
      </div>
      <div className="space-y-2">
        <FieldLabel htmlFor="crm-mode">CRM handling</FieldLabel>
        <select id="crm-mode" className={selectClassName} value={mode} disabled={disabled} onChange={(event) => emit({ mode: event.target.value })}>
          <option value="unconfigured">Not configured</option>
          <option value="portal_only">Portal only</option>
          <option value="field">Sync to a CRM field</option>
        </select>
      </div>
      {mode === CRM_MAPPING_MODES.field ? (
        <>
          <div className="space-y-2">
            <FieldLabel htmlFor="crm-target">Target record</FieldLabel>
            <select id="crm-target" className={selectClassName} value={mapping.target || ""} disabled={disabled} onChange={(event) => emit({ mode: "field", target: event.target.value })}>
              <option value="">Select a target</option>
              <option value="matter">Matter (Deals)</option>
              <option value="main_contact">Main applicant contact</option>
              <option value="profile_record">This profile&apos;s dependant record</option>
            </select>
          </div>
          <div className="space-y-2">
            <FieldLabel htmlFor="crm-field">Zoho field</FieldLabel>
            <select id="crm-field" className={selectClassName} value={mapping.fieldApiName || ""} disabled={disabled || !moduleName} onChange={(event) => emit({ mode: "field", fieldApiName: event.target.value })}>
              <option value="">Select an approved field</option>
              {fields.map((field) => (
                <option key={field.apiName} value={field.apiName}>{field.label} ({field.apiName})</option>
              ))}
            </select>
            {selectedField ? (
              <p className="text-xs text-[#71857d]">{selectedField.label} · {selectedField.apiName} · {moduleName} · {selectedField.type}</p>
            ) : null}
          </div>
          <div className="space-y-2">
            <FieldLabel htmlFor="crm-transform">Transform</FieldLabel>
            <select id="crm-transform" className={selectClassName} value={mapping.transform || ""} disabled={disabled || !transforms.length} onChange={(event) => emit({ mode: "field", transform: event.target.value })}>
              <option value="">Select a transform</option>
              {transforms.map((transform) => <option key={transform} value={transform}>{transform}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <FieldLabel htmlFor="crm-clear-policy">Empty value policy</FieldLabel>
            <select id="crm-clear-policy" className={selectClassName} value={mapping.clearPolicy || CRM_CLEAR_POLICIES.preserve_when_empty} disabled={disabled} onChange={(event) => emit({ mode: "field", clearPolicy: event.target.value })}>
              <option value="preserve_when_empty">Preserve CRM value when empty</option>
              <option value="clear_when_empty">Clear CRM value when empty</option>
            </select>
          </div>
          {selectedField?.type === "picklist" && optionValues.length ? (
            <div className="space-y-2">
              <FieldLabel hint="portal value → Zoho value">Option mapping</FieldLabel>
              {optionValues.map((option) => (
                <div key={option.value} className="grid gap-2 md:grid-cols-[1fr_1fr]">
                  <p className="flex h-10 items-center font-mono text-xs text-[#60786f]">{option.value}</p>
                  <select
                    aria-label={`Map ${option.value}`}
                    className={selectClassName}
                    value={mapping.optionMap?.[option.value] || ""}
                    disabled={disabled}
                    onChange={(event) => emit({
                      mode: "field",
                      optionMap: { ...mapping.optionMap, [option.value]: event.target.value },
                    })}
                  >
                    <option value="">Not mapped</option>
                    {(selectedField.picklistValues || []).map((value) => <option key={value} value={value}>{value}</option>)}
                  </select>
                </div>
              ))}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function RecordFieldWording({ fields, onChange, legacy, depth = 0 }) {
  return <div className="space-y-4">
    {fields.map((field) => <div key={field.id} className="space-y-3 border-l-2 border-[#b9d6ca] pl-4" style={{ marginLeft: `${Math.min(depth, 3) * 10}px` }}>
      <p className="font-mono text-[11px] text-[#71857d]">{field.answerKey} · {field.type}</p>
      <FieldLabel htmlFor={`record-${field.id}-label`}>Field text</FieldLabel>
      <Textarea id={`record-${field.id}-label`} rows={2} className="border-[#d7e4de] bg-white" value={field.label} onChange={(event) => onChange(field.id, "label", event.target.value)} />
      <div className="space-y-2">
        <FieldLabel htmlFor={`record-${field.id}-description`}>Help text</FieldLabel>
        <Input id={`record-${field.id}-description`} className={inputClassName} value={field.description || ""} onChange={(event) => onChange(field.id, "description", event.target.value)} />
      </div>
      <div className="space-y-2">
        <FieldLabel htmlFor={`record-${field.id}-placeholder`}>Placeholder</FieldLabel>
        <Input id={`record-${field.id}-placeholder`} className={inputClassName} value={field.placeholder || ""} onChange={(event) => onChange(field.id, "placeholder", event.target.value)} />
      </div>
      {field.options?.map((option, index) => <div key={option.value} className="space-y-1">
        <FieldLabel htmlFor={`record-${field.id}-option-${index}`}>Option label <span className="font-mono font-normal text-[#71857d]">({option.value})</span></FieldLabel>
        <Input id={`record-${field.id}-option-${index}`} className={inputClassName} value={option.label} onChange={(event) => onChange(field.id, "option", { index, label: event.target.value })} />
      </div>)}
      {field.metadata?.fields?.length ? <RecordFieldWording fields={field.metadata.fields} onChange={onChange} legacy={legacy} depth={depth + 1} /> : null}
    </div>)}
  </div>;
}

function FriendlyConditionEditor({ question, idBase, sourceQuestions, onUpdate }) {
  const firstCondition = question.visibleIf?.[0] || null;
  const availableSources = sourceQuestions.filter(
    (candidate) => candidate.id !== question.id && candidate.answerKey
  );
  const sourceQuestion = availableSources.find(
    (candidate) => candidate.answerKey === firstCondition?.field
  );
  const sourceOptions = getQuestionOptions(sourceQuestion);
  const checkboxValue = getCheckboxConditionEditorValue(firstCondition);
  const conditionValue = Array.isArray(firstCondition?.value)
    ? firstCondition.value.join(", ")
    : firstCondition?.value === undefined
      ? ""
      : String(firstCondition.value);

  const updateCondition = (field, value) => {
    onUpdate(question.id, (current) => {
      const conditions = current.visibleIf?.length
        ? [...current.visibleIf]
        : [{ field: "answer_key", op: "equals", value: "yes" }];
      const nextCondition = { ...conditions[0], [field]: value };
      const nextSource = availableSources.find(
        (candidate) => candidate.answerKey === nextCondition.field
      );
      conditions[0] = normalizeConditionForSource(nextCondition, nextSource);
      return { ...current, visibleIf: conditions };
    }, true);
  };

  const updateSource = (answerKey) => {
    const nextSource = availableSources.find(
      (candidate) => candidate.answerKey === answerKey
    );
    const options = getQuestionOptions(nextSource);
    onUpdate(question.id, (current) => {
      const conditions = current.visibleIf?.length
        ? [...current.visibleIf]
        : [{ field: answerKey, op: "equals", value: "" }];
      conditions[0] = normalizeConditionForSource({
        ...conditions[0],
        field: answerKey,
        op: "equals",
        value: nextSource?.type === "checkbox" ? true : options[0]?.value ?? "",
      }, nextSource);
      return { ...current, visibleIf: conditions };
    }, true);
  };

  const toggleCondition = (enabled) => {
    if (!enabled) {
      onUpdate(question.id, (current) => ({ ...current, visibleIf: [] }), true);
      return;
    }
    const fallbackQuestion = availableSources[0];
    const fallbackOptions = getQuestionOptions(fallbackQuestion);
    onUpdate(question.id, (current) => ({
      ...current,
      visibleIf: [{
        field: fallbackQuestion?.answerKey || "answer_key",
        op: "equals",
        value: fallbackQuestion?.type === "checkbox"
          ? true
          : fallbackOptions[0]?.value ?? "",
      }, ...(current.visibleIf || []).slice(1)],
    }), true);
  };

  return (
    <div className="space-y-3 rounded-lg border border-[#e1e9e5] bg-white p-3">
      <label className="flex items-center gap-3 text-sm font-semibold text-[#24453b]">
        <input
          id={`${idBase}-conditional`}
          type="checkbox"
          className="h-4 w-4 accent-[#4F726B]"
          checked={Boolean(firstCondition)}
          disabled={!firstCondition && availableSources.length === 0}
          onChange={(event) => toggleCondition(event.target.checked)}
        />
        Show this question conditionally
      </label>
      {firstCondition ? (
        <div className="grid gap-3 md:grid-cols-3">
          <div className="space-y-2">
            <FieldLabel htmlFor={`${idBase}-condition-question`}>After this question</FieldLabel>
            <select
              id={`${idBase}-condition-question`}
              className={selectClassName}
              value={firstCondition.field || ""}
              onChange={(event) => updateSource(event.target.value)}
            >
              <option value="" disabled>Select a question</option>
              {!sourceQuestion && firstCondition.field ? (
                <option value={firstCondition.field}>Current linked question</option>
              ) : null}
              {availableSources.map((candidate) => (
                <option key={candidate.id} value={candidate.answerKey}>{candidate.label}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <FieldLabel htmlFor={`${idBase}-condition-operator`}>Rule</FieldLabel>
            <select
              id={`${idBase}-condition-operator`}
              className={selectClassName}
              value={firstCondition.op || "equals"}
              onChange={(event) => updateCondition("op", event.target.value)}
            >
              {CONDITION_OPERATORS.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <FieldLabel htmlFor={`${idBase}-condition-answer`}>Answer</FieldLabel>
            {["exists", "notExists"].includes(firstCondition.op) ? (
              <p id={`${idBase}-condition-answer`} className="flex h-10 items-center text-sm text-[#60786f]">
                No answer needs to be selected.
              </p>
            ) : sourceOptions.length ? (
              <select
                id={`${idBase}-condition-answer`}
                className={selectClassName}
                multiple={["in", "notIn"].includes(firstCondition.op)}
                value={["in", "notIn"].includes(firstCondition.op)
                  ? Array.isArray(firstCondition.value)
                    ? firstCondition.value
                    : [firstCondition.value].filter(Boolean)
                  : firstCondition.value ?? ""}
                onChange={(event) => updateCondition(
                  "value",
                  ["in", "notIn"].includes(firstCondition.op)
                    ? Array.from(event.target.selectedOptions || []).map((option) => option.value)
                    : event.target.value
                )}
              >
                <option value="" disabled>Select an answer</option>
                {sourceOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            ) : sourceQuestion?.type === "checkbox" ? (
              <select
                id={`${idBase}-condition-answer`}
                className={selectClassName}
                value={checkboxValue}
                onChange={(event) => updateCondition(
                  "value",
                  ["in", "notIn"].includes(firstCondition.op)
                    ? event.target.value === "both"
                      ? [true, false]
                      : [event.target.value === "true"]
                    : event.target.value === "true"
                )}
              >
                <option value="true">Checked</option>
                <option value="false">Not checked</option>
                {["in", "notIn"].includes(firstCondition.op) ? (
                  <option value="both">Either answer</option>
                ) : null}
              </select>
            ) : (
              <Input
                id={`${idBase}-condition-answer`}
                className={inputClassName}
                value={conditionValue}
                onChange={(event) => updateCondition(
                  "value",
                  ["in", "notIn"].includes(firstCondition.op)
                    ? event.target.value.split(",").map((value) => value.trim())
                    : event.target.value
                )}
              />
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function EmbeddedNestedQuestionEditor({
  question,
  kind,
  depth = 0,
  legacy,
  sourceQuestions,
  onUpdate,
  onDeleteOption,
}) {
  const idBase = `${kind}-${question.id}`;
  const options = getQuestionOptions(question);
  const recordFieldSources = flattenQuestions(question.metadata?.fields || []);
  const showOptions = ["select", "radio", "yesNo"].includes(question.type)
    || Array.isArray(question.options);

  const updateOptionLabel = (optionIndex, label) => {
    onUpdate(question.id, (current) => ({
      ...current,
      options: getQuestionOptions(current).map((option, index) =>
        index === optionIndex ? { ...option, label } : option
      ),
    }), true);
  };

  const addOption = () => {
    onUpdate(question.id, (current) => ({
      ...current,
      options: [
        ...getQuestionOptions(current),
        { value: makeChoiceValue(), label: `Option ${getQuestionOptions(current).length + 1}` },
      ],
    }), true);
  };

  return (
    <div
      className="space-y-4 rounded-lg border border-[#d9e6e0] bg-[#f8fbf9] p-4"
      style={{ marginLeft: `${Math.min(depth, 3) * 10}px` }}
    >
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#70877e]">
        {kind === "follow-up" ? "Follow-up question" : "Record field"}
      </p>
      <div className="space-y-2">
        <FieldLabel htmlFor={`${idBase}-label`}>Question text</FieldLabel>
        <Textarea
          id={`${idBase}-label`}
          rows={2}
          className="border-[#d7e4de] bg-white"
          value={question.label || ""}
          onChange={(event) => onUpdate(
            question.id,
            (current) => ({ ...current, label: event.target.value }),
            false
          )}
        />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-2">
          <FieldLabel htmlFor={`${idBase}-description`}>Help text</FieldLabel>
          <Input
            id={`${idBase}-description`}
            className={inputClassName}
            value={question.description || ""}
            onChange={(event) => onUpdate(
              question.id,
              (current) => ({ ...current, description: event.target.value }),
              legacy && !Object.hasOwn(question.metadata || {}, "originalDescription")
            )}
          />
        </div>
        <div className="space-y-2">
          <FieldLabel htmlFor={`${idBase}-placeholder`}>Placeholder</FieldLabel>
          <Input
            id={`${idBase}-placeholder`}
            className={inputClassName}
            value={question.placeholder || ""}
            onChange={(event) => onUpdate(
              question.id,
              (current) => ({ ...current, placeholder: event.target.value }),
              legacy && !Object.hasOwn(question.metadata || {}, "originalPlaceholder")
            )}
          />
        </div>
      </div>
      {showOptions ? (
        <div className="space-y-3 rounded-lg border border-[#e1e9e5] bg-white p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h5 className="text-sm font-semibold text-[#24453b]">Answer choices</h5>
              <p className="text-xs text-[#71857d]">Edit the labels clients see.</p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              id={`${idBase}-add-option`}
              aria-label={`Add choice for ${question.label}`}
              disabled={question.type === "yesNo"}
              onClick={addOption}
            >
              <Plus />
              Add answer choice
            </Button>
          </div>
          <div className="space-y-2">
            {options.map((option, optionIndex) => (
              <div key={`${option.value}-${optionIndex}`} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_36px]">
                <Input
                  id={`${idBase}-option-${optionIndex + 1}-label`}
                  className={inputClassName}
                  aria-label={`Choice ${optionIndex + 1} for ${question.label}`}
                  value={option.label}
                  onChange={(event) => updateOptionLabel(optionIndex, event.target.value)}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  id={`${idBase}-delete-option-${optionIndex + 1}`}
                  aria-label={`Delete choice ${optionIndex + 1} for ${question.label}`}
                  className="text-red-600 hover:bg-red-50"
                  disabled={question.type === "yesNo" || options.length <= 1}
                  onClick={() => onDeleteOption(question, optionIndex)}
                >
                  <Trash2 />
                </Button>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      <FriendlyConditionEditor
        question={question}
        idBase={idBase}
        sourceQuestions={sourceQuestions}
        onUpdate={onUpdate}
      />
      {question.followUps?.map((followUp) => (
        <EmbeddedNestedQuestionEditor
          key={followUp.id}
          question={followUp}
          kind="follow-up"
          depth={depth + 1}
          legacy={legacy}
          sourceQuestions={sourceQuestions}
          onUpdate={onUpdate}
          onDeleteOption={onDeleteOption}
        />
      ))}
      {question.metadata?.fields?.map((field) => (
        <EmbeddedNestedQuestionEditor
          key={field.id}
          question={field}
          kind="record"
          depth={depth + 1}
          legacy={legacy}
          sourceQuestions={recordFieldSources}
          onUpdate={onUpdate}
          onDeleteOption={onDeleteOption}
        />
      ))}
    </div>
  );
}

function EmptyPane({ onCreate }) {
  return (
    <section className="flex min-h-[560px] flex-col items-center justify-center rounded-2xl border border-dashed border-[#cbdad3] bg-white/70 px-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#e8f4ee] text-[#4F726B]">
        <Layers3 className="h-7 w-7" />
      </div>
      <h2 className="mt-5 text-xl font-semibold text-[#17372e]">Choose a questionnaire to edit</h2>
      <p className="mt-2 max-w-md text-sm leading-6 text-[#60786f]">
        Select a saved questionnaire or a built-in visa questionnaire on the left to see its current pages and questions.
      </p>
      <Button type="button" className="mt-5 bg-[#4F726B] text-white" onClick={onCreate}>
        <Plus className="h-4 w-4" />
        Add questionnaire
      </Button>
    </section>
  );
}

export default function AdminQuestionnaireBuilder({ embeddedInMatter = false } = {}) {
  const matterData = useMatterData();
  const [definitions, setDefinitions] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [definition, setDefinition] = useState(null);
  const [savedDefinition, setSavedDefinition] = useState(null);
  const [activePageId, setActivePageId] = useState("");
  const [activeQuestionId, setActiveQuestionId] = useState("");
  const [jsonText, setJsonText] = useState("");
  const [jsonError, setJsonError] = useState("");
  const [jsonHasPendingEdits, setJsonHasPendingEdits] = useState(false);
  const [error, setError] = useState("");
  const [savedQuestionnairesError, setSavedQuestionnairesError] = useState("");
  const [notice, setNotice] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingDefinition, setIsLoadingDefinition] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [definitionSearch, setDefinitionSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [adminView, setAdminView] = useState("library");
  const [pageSearch, setPageSearch] = useState("");
  const [questionEditorOpen, setQuestionEditorOpen] = useState(false);
  const [sectionSettingsOpen, setSectionSettingsOpen] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createMode, setCreateMode] = useState("copy");
  const [createName, setCreateName] = useState("");
  const [createVisaType, setCreateVisaType] = useState("temporary-work");
  const [createSourceKey, setCreateSourceKey] = useState("");
  const adminContentRef = useRef(null);
  const selectionRequestId = useRef(0);
  const listRequestId = useRef(0);

  const builderIsDirty = useMemo(
    () => JSON.stringify(definition) !== JSON.stringify(savedDefinition),
    [definition, savedDefinition]
  );
  const isDirty = builderIsDirty || jsonHasPendingEdits;
  const isBusy = isLoading || isLoadingDefinition || isSaving || isDeleting;
  const activePageIndex = useMemo(
    () => definition?.pages?.findIndex((page) => page.id === activePageId) ?? -1,
    [activePageId, definition]
  );
  const activePage = activePageIndex >= 0 ? definition.pages[activePageIndex] : null;
  const activeQuestionIndex = useMemo(
    () => activePage?.questions?.findIndex((question) => question.id === activeQuestionId) ?? -1,
    [activePage, activeQuestionId]
  );
  const activeQuestion = activeQuestionIndex >= 0 ? activePage.questions[activeQuestionIndex] : null;
  const legacyPage = activePage?.metadata?.renderer === "legacy";
  const machineKeysLocked = definition?.status === "active";
  const registeredRoutes = useMemo(() => getRegisteredRoutes(definition), [definition]);
  const nextAvailableRoute = useMemo(() => {
    const usedRoutes = new Set(definition?.pages?.map((page) => page.route));
    return registeredRoutes.find((route) => !usedRoutes.has(route.href)) || null;
  }, [definition?.pages, registeredRoutes]);
  const pageQuestions = useMemo(
    () => flattenQuestions(activePage?.questions),
    [activePage]
  );
  const conditionSourceQuestions = useMemo(
    () => pageQuestions.filter(
      (question) => question.id !== activeQuestion?.id && question.answerKey
    ),
    [activeQuestion?.id, pageQuestions]
  );
  const preferredAudienceKey = embeddedInMatter
    ? questionnaireAudienceKey(matterData?.questionnaireDefinition)
    : "";
  const availableDefinitionEntries = useMemo(
    () => embeddedInMatter
      ? getEmbeddedQuestionnaireCatalog(definitions)
      : definitions.map((item) => ({
          audienceKey: questionnaireAudienceKey(item),
          definition: item,
          source: "saved",
        })),
    [definitions, embeddedInMatter]
  );
  const filteredDefinitions = useMemo(() => {
    const search = definitionSearch.trim().toLowerCase();
    return availableDefinitionEntries.filter(({ definition: item }) =>
      [item.title, item.id, audienceLabel(item)].some((value) =>
        String(value || "").toLowerCase().includes(search)
      )
    );
  }, [availableDefinitionEntries, definitionSearch]);
  const adminLibraryEntries = useMemo(() => {
    const savedEntries = definitions.map((item) => ({
      definition: item,
      source: "saved",
      key: `saved:${item.id}`,
    }));
    const savedIds = new Set(savedEntries.map((entry) => String(entry.definition.id)));
    const builtInEntries = [...questionnaireBuiltInTemplates, temporaryWork482Definition]
      .filter((item, index, items) =>
        !savedIds.has(String(item.id))
        && items.findIndex((candidate) => String(candidate.id) === String(item.id)) === index
      )
      .map((item) => ({
        definition: item,
        source: "builtIn",
        key: `builtIn:${item.id}`,
      }));
    return [...savedEntries, ...builtInEntries];
  }, [definitions]);
  const filteredAdminLibraryEntries = useMemo(() => {
    const search = definitionSearch.trim().toLowerCase();
    return adminLibraryEntries.filter(({ definition: item, source }) => {
      const status = source === "builtIn" ? "active" : item.status;
      const matchesStatus = statusFilter === "all" || status === statusFilter;
      const matchesSearch = !search || [item.title, item.id, audienceLabel(item)].some((value) =>
        String(value || "").toLowerCase().includes(search)
      );
      return matchesStatus && matchesSearch;
    });
  }, [adminLibraryEntries, definitionSearch, statusFilter]);
  const createSourceEntries = useMemo(
    () => adminLibraryEntries,
    [adminLibraryEntries]
  );
  const filteredPages = useMemo(() => {
    const search = pageSearch.trim().toLowerCase();
    return (definition?.pages || []).filter((page) =>
      !search || [page.title, page.id].some((value) => String(value || "").toLowerCase().includes(search))
    );
  }, [definition?.pages, pageSearch]);

  useEffect(() => {
    let cancelled = false;
    const requestId = ++selectionRequestId.current;
    const currentListRequestId = ++listRequestId.current;

    async function load() {
      try {
        setIsLoading(true);
        const listPayload = await apiRequest("/api/questionnaire-definitions");
        const list = getDefinitionsFromResponse(listPayload);
        if (cancelled || currentListRequestId !== listRequestId.current) return;

        const ownerQuestionnaires = getOwnerQuestionnaires(list);
        setDefinitions(ownerQuestionnaires);
        setSavedQuestionnairesError("");
        if (requestId !== selectionRequestId.current) return;
        if (embeddedInMatter) {
          const catalog = getEmbeddedQuestionnaireCatalog(ownerQuestionnaires);
          const preferredEntry = catalog.find(
            (entry) => entry.audienceKey === preferredAudienceKey && entry.definition.status === "active"
          ) || catalog.find(
            (entry) => entry.audienceKey === preferredAudienceKey && entry.source === "builtIn"
          ) || catalog.find(
            (entry) => entry.audienceKey === preferredAudienceKey
          ) || catalog[0];
          if (preferredEntry?.source === "builtIn") {
            createDefinitionFrom(preferredEntry.definition, {
              starter: true,
              checkDiscard: false,
            });
            return;
          }
          if (preferredEntry?.definition) {
            const loaded = await fetchDefinition(preferredEntry.definition.id);
            if (cancelled || requestId !== selectionRequestId.current) return;

            setSelectedId(loaded.id);
            setDefinition(loaded);
            setSavedDefinition(clone(loaded));
            setActivePageId(loaded.pages[0]?.id || "");
            setActiveQuestionId(loaded.pages[0]?.questions?.[0]?.id || "");
            setJsonText(JSON.stringify(loaded, null, 2));
            setJsonHasPendingEdits(false);
            return;
          }
        }
        if (!ownerQuestionnaires.length) {
          createDefinitionFrom(questionnaireBuiltInTemplates[0], { starter: true, checkDiscard: false });
          return;
        }

        const firstId = String(ownerQuestionnaires[0].id || ownerQuestionnaires[0].definitionId || "");
        if (!firstId) return;
        const loaded = await fetchDefinition(firstId);
        if (cancelled || requestId !== selectionRequestId.current) return;

        setSelectedId(loaded.id);
        setDefinition(loaded);
        setSavedDefinition(clone(loaded));
        setActivePageId(loaded.pages[0]?.id || "");
        setActiveQuestionId(loaded.pages[0]?.questions?.[0]?.id || "");
        setJsonText(JSON.stringify(loaded, null, 2));
        setJsonHasPendingEdits(false);
      } catch (loadError) {
        if (!cancelled && currentListRequestId === listRequestId.current) {
          setSavedQuestionnairesError(`Saved questionnaires could not be loaded. ${loadError.message}`);
          if (requestId === selectionRequestId.current) {
            const fallbackTemplate = embeddedInMatter
              ? questionnaireBuiltInTemplates.find(
                  (template) => questionnaireAudienceKey(template) === preferredAudienceKey
                ) || questionnaireBuiltInTemplates[0]
              : questionnaireBuiltInTemplates[0];
            createDefinitionFrom(fallbackTemplate, { starter: true, checkDiscard: false });
          }
        }
      } finally {
        if (!cancelled && currentListRequestId === listRequestId.current) setIsLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
    // This is the initial load only; request ids preserve the selected item while it runs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const warnBeforeUnload = (event) => {
      if (!isDirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [isDirty]);

  useEffect(() => {
    if (embeddedInMatter || adminView !== "editor" || !activePageId) return undefined;
    const frame = window.requestAnimationFrame(() => {
      adminContentRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activePageId, adminView, embeddedInMatter, questionEditorOpen]);

  function confirmDiscard() {
    return !isDirty || window.confirm("Discard your unsaved questionnaire changes?");
  }

  async function loadList(preferredId = selectedId) {
    const requestId = ++selectionRequestId.current;
    const currentListRequestId = ++listRequestId.current;
    try {
      setError("");
      setSavedQuestionnairesError("");
      setNotice("");
      setIsLoading(true);
      const payload = await apiRequest("/api/questionnaire-definitions");
      if (currentListRequestId !== listRequestId.current) return;
      const list = getDefinitionsFromResponse(payload);
      const ownerQuestionnaires = getOwnerQuestionnaires(list);
      setDefinitions(ownerQuestionnaires);
      if (requestId !== selectionRequestId.current) return;

      if (embeddedInMatter) {
        const catalog = getEmbeddedQuestionnaireCatalog(ownerQuestionnaires);
        const selectedAudienceKey = questionnaireAudienceKey(definition);
        const preferredEntry = catalog.find(
          (entry) => entry.source === "saved" && String(entry.definition.id) === String(preferredId)
        ) || catalog.find(
          (entry) => entry.audienceKey === selectedAudienceKey && entry.definition.status === "active"
        ) || catalog.find(
          (entry) => entry.audienceKey === selectedAudienceKey && entry.source === "builtIn"
        ) || catalog.find(
          (entry) => entry.audienceKey === selectedAudienceKey
        ) || catalog.find(
          (entry) => entry.audienceKey === preferredAudienceKey && entry.definition.status === "active"
        ) || catalog.find(
          (entry) => entry.audienceKey === preferredAudienceKey && entry.source === "builtIn"
        ) || catalog.find(
          (entry) => entry.audienceKey === preferredAudienceKey
        ) || catalog[0];

        if (preferredEntry?.source === "builtIn") {
          createDefinitionFrom(preferredEntry.definition, {
            starter: true,
            checkDiscard: false,
          });
          return;
        }
        if (preferredEntry?.definition) {
          const loaded = await fetchDefinition(preferredEntry.definition.id);
          if (requestId !== selectionRequestId.current) return;
          setSelectedId(loaded.id);
          setDefinition(loaded);
          setSavedDefinition(clone(loaded));
          setJsonText(JSON.stringify(loaded, null, 2));
          setJsonHasPendingEdits(false);
          setJsonError("");
          setActivePageId(loaded.pages[0]?.id || "");
          setActiveQuestionId(loaded.pages[0]?.questions?.[0]?.id || "");
          setIsCreating(false);
          return;
        }
      }

      if (!ownerQuestionnaires.length) {
        createDefinitionFrom(questionnaireBuiltInTemplates[0], { starter: true, checkDiscard: false });
        return;
      }

      const matchingId = ownerQuestionnaires.some((item) => String(item.id) === String(preferredId))
        ? preferredId
        : ownerQuestionnaires[0].id;
      const loaded = await fetchDefinition(matchingId);
      if (requestId !== selectionRequestId.current) return;
      setSelectedId(loaded.id);
      setDefinition(loaded);
      setSavedDefinition(clone(loaded));
      setJsonText(JSON.stringify(loaded, null, 2));
      setJsonHasPendingEdits(false);
      setJsonError("");
      setActivePageId(loaded.pages[0]?.id || "");
      setActiveQuestionId(loaded.pages[0]?.questions?.[0]?.id || "");
      setIsCreating(false);
    } catch (loadError) {
      if (currentListRequestId === listRequestId.current) {
        setSavedQuestionnairesError(`Saved questionnaires could not be loaded. ${loadError.message}`);
      }
    } finally {
      if (currentListRequestId === listRequestId.current) setIsLoading(false);
    }
  }

  async function selectDefinition(id) {
    if (id === selectedId && !isCreating) return;
    if (!confirmDiscard()) return;
    const requestId = ++selectionRequestId.current;

    try {
      setError("");
      setNotice("");
      setIsLoadingDefinition(true);
      const loaded = await fetchDefinition(id);
      if (requestId !== selectionRequestId.current) return;
      setSelectedId(id);
      setDefinition(loaded);
      setSavedDefinition(clone(loaded));
      setJsonText(JSON.stringify(loaded, null, 2));
      setJsonHasPendingEdits(false);
      setJsonError("");
      setActivePageId(loaded.pages[0]?.id || "");
      setActiveQuestionId(loaded.pages[0]?.questions?.[0]?.id || "");
      setIsCreating(false);
    } catch (loadError) {
      if (requestId === selectionRequestId.current) setError(loadError.message);
    } finally {
      if (requestId === selectionRequestId.current) setIsLoadingDefinition(false);
    }
  }

  function createDefinition() {
    if (!confirmDiscard()) return;
    selectionRequestId.current += 1;
    setIsLoading(false);
    setIsLoadingDefinition(false);
    const nextDefinition = makeNewDefinition();
    setDefinition(nextDefinition);
    setSavedDefinition(null);
    setJsonText(JSON.stringify(nextDefinition, null, 2));
    setJsonHasPendingEdits(false);
    setJsonError("");
    setSelectedId(nextDefinition.id);
    setActivePageId("");
    setActiveQuestionId("");
    setIsCreating(true);
    setError("");
    setNotice("New test questionnaire ready. Add pages and questions, then save when you are finished.");
  }

  function createDefinitionFrom(source, {
    starter = false,
    asTestCopy = false,
    checkDiscard = true,
  } = {}) {
    if (checkDiscard && !confirmDiscard()) return;
    selectionRequestId.current += 1;
    setIsLoading(false);
    setIsLoadingDefinition(false);
    const definitionId = `questionnaire-${crypto.randomUUID()}`;
    const sourceTitle = String(source.title || "Questionnaire").replace(/\s+— Test$/, "");
    const nextDefinition = normalizeDefinition({
      ...clone(source),
      id: definitionId,
      title: asTestCopy ? `${sourceTitle} — Test` : source.title,
      status: asTestCopy ? "draft" : source.status || "active",
      revision: 0,
    });
    setDefinition(nextDefinition);
    setSavedDefinition(starter ? clone(nextDefinition) : null);
    setSelectedId(nextDefinition.id);
    setActivePageId(nextDefinition.pages[0]?.id || "");
    setActiveQuestionId(nextDefinition.pages[0]?.questions?.[0]?.id || "");
    setJsonText(JSON.stringify(nextDefinition, null, 2));
    setJsonHasPendingEdits(false);
    setJsonError("");
    setIsCreating(true);
    setError("");
    setNotice(asTestCopy
      ? "Test copy created. Saving it will not change the live questionnaire."
      : starter
        ? `${source.title} is ready to edit. Its existing forms and client answers are preserved while you make changes.`
        : "A new test questionnaire is ready. Add pages and questions, then save it when you are finished.");
  }

  function copyDefinitionAsTest() {
    if (!definition) return;
    createDefinitionFrom(savedDefinition || definition, { asTestCopy: true });
  }

  function openCreateQuestionnaireDialog() {
    const firstSource = createSourceEntries[0];
    setCreateMode(firstSource ? "copy" : "blank");
    setCreateSourceKey(firstSource?.key || "");
    setCreateName(firstSource ? `${firstSource.definition.title} — working copy` : "New questionnaire");
    setCreateVisaType(firstSource?.definition.visaType || "temporary-work");
    setCreateDialogOpen(true);
  }

  async function createQuestionnaireFromDialog() {
    const title = createName.trim();
    if (!title) {
      setError("Questionnaire name is required.");
      return;
    }

    try {
      setIsLoadingDefinition(true);
      setError("");
      let nextDefinition;

      if (createMode === "copy") {
        const sourceEntry = createSourceEntries.find((entry) => entry.key === createSourceKey);
        if (!sourceEntry) throw new Error("Choose a questionnaire to copy.");
        const source = sourceEntry.source === "saved"
          ? await fetchDefinition(sourceEntry.definition.id)
          : sourceEntry.definition;
        nextDefinition = normalizeDefinition({
          ...clone(source),
          id: `questionnaire-${crypto.randomUUID()}`,
          title,
          status: "draft",
          revision: 0,
        });
      } else {
        nextDefinition = normalizeDefinition({
          ...makeNewDefinition(),
          title,
          visaType: createVisaType,
          visaContexts: createVisaType === "temporary-work" ? ["482"] : [],
        });
      }

      selectionRequestId.current += 1;
      setDefinition(nextDefinition);
      setSavedDefinition(null);
      setSelectedId(nextDefinition.id);
      setActivePageId(nextDefinition.pages[0]?.id || "");
      setActiveQuestionId(nextDefinition.pages[0]?.questions?.[0]?.id || "");
      setJsonText(JSON.stringify(nextDefinition, null, 2));
      setJsonHasPendingEdits(false);
      setJsonError("");
      setIsCreating(true);
      setNotice(createMode === "copy"
        ? "Working copy created. The original questionnaire has not been changed."
        : "Blank questionnaire created. Add sections and questions, then save when you are finished.");
      setQuestionEditorOpen(false);
      setSectionSettingsOpen(nextDefinition.pages.length === 0);
      setAdminView("editor");
      setCreateDialogOpen(false);
    } catch (createError) {
      setError(createError.message || "Could not create the questionnaire.");
    } finally {
      setIsLoadingDefinition(false);
    }
  }

  async function openAdminDefinition(entry) {
    setQuestionEditorOpen(false);
    setSectionSettingsOpen(false);
    if (entry.source === "builtIn") {
      createDefinitionFrom(entry.definition, { starter: true });
      setAdminView("editor");
      return;
    }
    await selectDefinition(entry.definition.id);
    setAdminView("editor");
  }

  function returnToQuestionnaireLibrary() {
    if (!confirmDiscard()) return;
    if (builderIsDirty && savedDefinition) {
      const restored = clone(savedDefinition);
      setDefinition(restored);
      setSelectedId(restored.id);
      setActivePageId(restored.pages[0]?.id || "");
      setActiveQuestionId(restored.pages[0]?.questions?.[0]?.id || "");
      setJsonText(JSON.stringify(restored, null, 2));
    } else if (builderIsDirty && !savedDefinition) {
      setDefinition(null);
      setSelectedId("");
      setActivePageId("");
      setActiveQuestionId("");
      setJsonText("");
      setIsCreating(false);
    }
    setJsonHasPendingEdits(false);
    setJsonError("");
    setQuestionEditorOpen(false);
    setSectionSettingsOpen(false);
    setAdminView("library");
  }

  function updateDefinitionField(field, value) {
    setDefinition((current) => ({ ...current, [field]: value }));
  }

  function updateActivePage(updater) {
    setDefinition((current) => ({
      ...current,
      pages: current.pages.map((page, index) =>
        index === activePageIndex ? updater(page) : page
      ),
    }));
  }

  function updatePageField(field, value) {
    if (!activePage) return;
    updateActivePage((page) => ({ ...page, [field]: value }));
    if (field === "id") setActivePageId(value);
  }

  function addPage() {
    const existingIds = new Set((definition?.pages || []).map((page) => page.id));
    const pageNum = (definition?.pages?.length || 0) + 1;
    const id = uniqueId(existingIds, `page-${pageNum}`);
    const registeredRoute = nextAvailableRoute;
    const route = registeredRoute?.href || `/intake/${definition.visaType}/${id}`;
    const page = normalizePage({
      id,
      title: registeredRoute?.title || `Page ${pageNum}`,
      route,
      sectionKey: id.replace(/-/g, "_"),
      completionKey: route.replace(/^\/intake\//, ""),
      scope: getRouteScope(route),
      order: pageNum * 10,
      introBlocks: [],
      questions: [],
      metadata: {
        renderer: "dynamic",
      },
    });

    setDefinition((current) => ({ ...current, pages: [...current.pages, page] }));
    setActivePageId(page.id);
    setActiveQuestionId("");
    setError("");
  }

  function deletePage() {
    if (!activePage) return;
    if (!window.confirm(`Delete the page “${activePage.title}” and all of its questions?`)) return;
    const remaining = definition.pages.filter((page) => page.id !== activePage.id);
    setDefinition((current) => ({ ...current, pages: remaining }));
    setActivePageId(remaining[0]?.id || "");
    setActiveQuestionId(remaining[0]?.questions?.[0]?.id || "");
  }

  function movePage(direction) {
    const nextIndex = activePageIndex + direction;
    if (activePageIndex < 0 || nextIndex < 0 || nextIndex >= definition.pages.length) return;
    const pages = [...definition.pages];
    [pages[activePageIndex], pages[nextIndex]] = [pages[nextIndex], pages[activePageIndex]];
    setDefinition((current) => ({
      ...current,
      pages: pages.map((page, index) => ({ ...page, order: (index + 1) * 10 })),
    }));
  }

  function updateActiveQuestion(updater) {
    if (!activeQuestion) return;
    updateActivePage((page) => ({
      ...page,
      questions: page.questions.map((question, index) =>
        index === activeQuestionIndex ? updater(question) : question
      ),
    }));
  }

  function updateActiveQuestionStructure(updater) {
    if (!activeQuestion) return;
    updateActivePage((currentPage) => {
      const page = promotePageForStructure(currentPage);
      return {
        ...page,
        questions: page.questions.map((question, index) =>
          index === activeQuestionIndex ? updater(question) : question
        ),
      };
    });
  }

  function updateQuestionField(field, value) {
    const originalCopyKey = field === "description"
      ? "originalDescription"
      : field === "placeholder"
        ? "originalPlaceholder"
        : null;
    const needsDynamicRenderer = Boolean(
      legacyPage && originalCopyKey && !Object.hasOwn(activeQuestion?.metadata || {}, originalCopyKey)
    );
    if (needsDynamicRenderer) {
      setNotice("This page will use the dynamic client form so the new help text or placeholder is displayed.");
    }
    const updateQuestion = needsDynamicRenderer || ["id", "answerKey", "type", "required"].includes(field)
      ? updateActiveQuestionStructure
      : updateActiveQuestion;
    updateQuestion((question) => ({ ...question, [field]: value }));
    if (field === "id") setActiveQuestionId(value);
  }

  function updateQuestionCrm(nextCrm) {
    updateActiveQuestion((question) => {
      const metadata = { ...(question.metadata || {}) };
      if (!nextCrm) delete metadata.crm;
      else metadata.crm = nextCrm;
      return { ...question, metadata };
    });
  }

  function updateFollowUpText(questionId, field, value) {
    const updateQuestions = (questions = []) => questions.map((question) => ({
      ...question,
      ...(question.id === questionId ? { [field]: value } : {}),
      ...(question.followUps
        ? { followUps: updateQuestions(question.followUps) }
        : {}),
    }));

    const nestedQuestion = pageQuestions.find((question) => question.id === questionId);
    const originalCopyKey = field === "description"
      ? "originalDescription"
      : field === "placeholder"
        ? "originalPlaceholder"
        : null;
    const updateQuestion = legacyPage && originalCopyKey
      && !Object.hasOwn(nestedQuestion?.metadata || {}, originalCopyKey)
      ? updateActiveQuestionStructure
      : updateActiveQuestion;
    if (updateQuestion === updateActiveQuestionStructure) {
      setNotice("This page will use the dynamic client form so the new help text or placeholder is displayed.");
    }
    updateQuestion((question) => ({
      ...question,
      followUps: updateQuestions(question.followUps),
    }));
  }

  function updateRecordFieldText(questionId, field, value) {
    const updateFields = (fields) => fields.map((question) => ({
      ...question,
      ...(question.id === questionId ? field === "option"
        ? { options: question.options.map((option, index) => index === value.index ? { ...option, label: value.label } : option) }
        : { [field]: value } : {}),
      ...(question.metadata?.fields ? { metadata: { ...question.metadata, fields: updateFields(question.metadata.fields) } } : {}),
    }));
    const nestedQuestion = flattenQuestions(activeQuestion?.metadata?.fields).find(
      (question) => question.id === questionId
    );
    const originalCopyKey = field === "description"
      ? "originalDescription"
      : field === "placeholder"
        ? "originalPlaceholder"
        : null;
    const updateQuestion = legacyPage && originalCopyKey
      && !Object.hasOwn(nestedQuestion?.metadata || {}, originalCopyKey)
      ? updateActiveQuestionStructure
      : updateActiveQuestion;
    if (updateQuestion === updateActiveQuestionStructure) {
      setNotice("This page will use the dynamic client form so the new help text or placeholder is displayed.");
    }
    updateQuestion((question) => ({ ...question, metadata: { ...question.metadata, fields: updateFields(question.metadata.fields) } }));
  }

  function updateNestedQuestion(questionId, updater, structural = false) {
    const updateQuestion = structural
      ? updateActiveQuestionStructure
      : updateActiveQuestion;
    updateQuestion((question) => updateQuestionTree([question], questionId, updater)[0]);
  }

  function deleteNestedOption(question, optionIndex) {
    const options = getQuestionOptions(question);
    if (options.length <= 1) {
      setError("A choice question needs at least one answer choice.");
      return;
    }
    const option = options[optionIndex];
    const dependents = findChoiceDependents(
      activePage?.questions,
      question.answerKey,
      option?.value
    );
    if (dependents.length) {
      setError(
        `“${option?.label || "This choice"}” controls ${dependents.join(", ")}. Change ${dependents.length === 1 ? "that question's" : "those questions'"} display rule before deleting this choice.`
      );
      return;
    }
    updateNestedQuestion(question.id, (current) => ({
      ...current,
      options: getQuestionOptions(current).filter((_, index) => index !== optionIndex),
    }), true);
    setError("");
  }

  function changeQuestionType(type) {
    updateActiveQuestionStructure((question) => {
      if (type === "yesNo") {
        return {
          ...question,
          type,
          options: [
            { value: "yes", label: "Yes" },
            { value: "no", label: "No" },
          ],
        };
      }
      if (!["select", "radio"].includes(type) || question.options?.length) {
        return { ...question, type };
      }

      const options = [
        { value: "option_1", label: "Option 1" },
        { value: "option_2", label: "Option 2" },
      ];
      return { ...question, type, options };
    });
  }

  function addQuestion() {
    if (!activePage) return;
    const existingIds = new Set();
    const existingAnswerKeys = new Set();
    definition.pages.forEach((page) =>
      collectQuestionMachineKeys(page.questions, existingIds, existingAnswerKeys)
    );
    const id = uniqueId(existingIds, `question-${existingIds.size + 1}`);
    const answerKey = uniqueId(existingAnswerKeys, id.replace(/-/g, "_")).replace(/-/g, "_");
    const question = normalizeQuestion({
      id,
      answerKey,
      label: "New question",
      type: "text",
      required: false,
    });
    updateActivePage((page) => {
      const editablePage = promotePageForStructure(page);
      return { ...editablePage, questions: [...editablePage.questions, question] };
    });
    setActiveQuestionId(question.id);
  }

  function deleteQuestion() {
    if (!activeQuestion || !window.confirm(`Delete the question “${activeQuestion.label}”?`)) return;
    const dependents = findQuestionDependents(
      activePage.questions,
      activeQuestion.answerKey,
      activeQuestion.id
    );
    if (dependents.length) {
      setError(
        `“${activeQuestion.label}” controls ${dependents.join(", ")}. Change ${dependents.length === 1 ? "that question's" : "those questions'"} display rule before deleting it.`
      );
      return;
    }
    const remaining = activePage.questions.filter((question) => question.id !== activeQuestion.id);
    updateActivePage((page) => ({ ...promotePageForStructure(page), questions: remaining }));
    setActiveQuestionId(remaining[0]?.id || "");
    setError("");
  }

  function moveQuestion(direction) {
    const nextIndex = activeQuestionIndex + direction;
    if (activeQuestionIndex < 0 || nextIndex < 0 || nextIndex >= activePage.questions.length) return;
    updateActivePage((page) => {
      const editablePage = promotePageForStructure(page);
      const questions = [...editablePage.questions];
      [questions[activeQuestionIndex], questions[nextIndex]] = [
        questions[nextIndex],
        questions[activeQuestionIndex],
      ];
      return { ...editablePage, questions };
    });
  }

  function updateOption(optionIndex, field, value) {
    const updater = (question) => ({
      ...question,
      options: getQuestionOptions(question).map((option, index) =>
        index === optionIndex ? { ...option, [field]: value } : option
      ),
    });
    if (embeddedInMatter || !Array.isArray(activeQuestion?.options) || field === "value") {
      updateActiveQuestionStructure(updater);
    } else {
      updateActiveQuestion(updater);
    }
  }

  function addOption() {
    const options = getQuestionOptions(activeQuestion);
    updateActiveQuestionStructure((question) => ({
      ...question,
      options: [
        ...getQuestionOptions(question),
        { value: makeChoiceValue(), label: `Option ${options.length + 1}` },
      ],
    }));
    setError("");
  }

  function deleteOption(optionIndex) {
    const options = getQuestionOptions(activeQuestion);
    if (options.length <= 1) {
      setError("A choice question needs at least one answer choice.");
      return;
    }
    const option = options[optionIndex];
    const dependents = findChoiceDependents(
      activePage?.questions,
      activeQuestion?.answerKey,
      option?.value
    );
    if (dependents.length) {
      setError(
        `“${option?.label || "This choice"}” controls ${dependents.join(", ")}. Change ${dependents.length === 1 ? "that question's" : "those questions'"} display rule before deleting this choice.`
      );
      return;
    }
    updateActiveQuestionStructure((question) => ({
      ...question,
      options: getQuestionOptions(question).filter((_, index) => index !== optionIndex),
    }));
    setError("");
  }

  function toggleCondition(enabled) {
    if (!enabled) {
      updateActiveQuestionStructure((question) => ({ ...question, visibleIf: [] }));
      return;
    }

    const fallbackQuestion = conditionSourceQuestions[0];
    const fallbackOptions = getQuestionOptions(fallbackQuestion);
    updateActiveQuestionStructure((question) => ({
      ...question,
      visibleIf: [
        {
          field: fallbackQuestion?.answerKey || "answer_key",
          op: "equals",
          value: fallbackQuestion?.type === "checkbox"
            ? true
            : fallbackOptions[0]?.value ?? "",
        },
        ...(question.visibleIf || []).slice(1),
      ],
    }));
  }

  function updateConditionSource(answerKey) {
    const sourceQuestion = conditionSourceQuestions.find(
      (candidate) => candidate.answerKey === answerKey
    );
    const options = getQuestionOptions(sourceQuestion);
    updateActiveQuestionStructure((question) => {
      const conditions = question.visibleIf?.length
        ? [...question.visibleIf]
        : [{ field: answerKey, op: "equals", value: "" }];
      conditions[0] = normalizeConditionForSource({
        ...conditions[0],
        field: answerKey,
        op: "equals",
        value: sourceQuestion?.type === "checkbox" ? true : options[0]?.value ?? "",
      }, sourceQuestion);
      return { ...question, visibleIf: conditions };
    });
  }

  function updateCondition(field, value) {
    updateActiveQuestionStructure((question) => {
      const conditions = question.visibleIf?.length
        ? [...question.visibleIf]
        : [{ field: "answer_key", op: "equals", value: "yes" }];
      const nextCondition = { ...conditions[0], [field]: value };
      const sourceQuestion = conditionSourceQuestions.find(
        (candidate) => candidate.answerKey === nextCondition.field
      );
      conditions[0] = normalizeConditionForSource(nextCondition, sourceQuestion);
      return { ...question, visibleIf: conditions };
    });
  }

  function applyJson() {
    try {
      const parsed = JSON.parse(jsonText);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("The JSON root must be a questionnaire object.");
      }
      if (machineKeysLocked) {
        throw new Error("Advanced JSON changes are not available for this built-in page. Use the wording and option fields above.");
      }
      if (
        builderIsDirty &&
        jsonHasPendingEdits &&
        !window.confirm("Replace the current visual-builder changes with this JSON?")
      ) {
        return;
      }
      const normalized = normalizeDefinition({
        ...parsed,
        id: isCreating ? parsed.id : definition.id,
        revision: definition.revision,
        status: definition.status,
      });
      setDefinition(normalized);
      setSelectedId(normalized.id);
      setActivePageId(normalized.pages[0]?.id || "");
      setActiveQuestionId(normalized.pages[0]?.questions?.[0]?.id || "");
      setJsonText(JSON.stringify(normalized, null, 2));
      setJsonHasPendingEdits(false);
      setJsonError("");
      setNotice("JSON applied to the builder. Save to persist it.");
    } catch (parseError) {
      setJsonError(parseError.message);
    }
  }

  async function importJson(file) {
    if (!file) return;
    try {
      const text = await file.text();
      JSON.parse(text);
      setJsonText(text);
      setJsonHasPendingEdits(true);
      setJsonError("");
      setNotice("JSON imported. Review it, then choose Apply JSON.");
    } catch (importError) {
      setJsonError(importError.message || "Could not read that JSON file.");
    }
  }

  function upsertDefinitionSummary(nextDefinition) {
    setDefinitions((current) => {
      const summary = {
        ...nextDefinition,
        pageCount: nextDefinition.pages.length,
        questionCount: nextDefinition.pages.reduce(
          (total, page) => total + countQuestions(page.questions),
          0
        ),
      };
      const found = current.some((item) => String(item.id) === String(nextDefinition.id));
      const next = found
        ? current.map((item) => (String(item.id) === String(nextDefinition.id) ? summary : item))
        : [summary, ...current];
      return next;
    });
  }

  async function saveDefinition(statusOverride = null) {
    if (jsonHasPendingEdits) {
      setError("Apply or discard the pending Advanced JSON edits before saving.");
      return;
    }
    if (!definition?.id?.trim()) {
      setError("Questionnaire ID is required.");
      return;
    }
    if (statusOverride === "active") {
      const contexts = definition.visaContexts?.length
        ? definition.visaContexts.join(", ")
        : "all contexts";
      if (!window.confirm(
        `Make this questionnaire live for ${definition.visaType} (${contexts})?\n\nThe current live questionnaire for this audience will be archived.`
      )) return;
    }
    try {
      setIsSaving(true);
      setError("");
      setNotice("");
      const nextDefinition = normalizeDefinition({
        ...definition,
        status: statusOverride || definition.status,
      });
      const currentRevision = Number(savedDefinition?.revision ?? definition.revision ?? 0);
      const url = isCreating
        ? "/api/questionnaire-definitions"
        : `/api/questionnaire-definitions/${encodeURIComponent(savedDefinition?.id || definition.id)}`;
      const method = isCreating ? "POST" : "PUT";
      const payload = await apiRequest(url, {
        method,
        body: JSON.stringify({
          ...nextDefinition,
          revision: isCreating ? 0 : currentRevision,
        }),
      });
      let persisted = getDefinitionFromResponse(payload);
      if (!persisted) persisted = await fetchDefinition(nextDefinition.id);
      persisted = normalizeDefinition(persisted);

      setDefinition(persisted);
      setSavedDefinition(clone(persisted));
      setJsonText(JSON.stringify(persisted, null, 2));
      setJsonHasPendingEdits(false);
      setJsonError("");
      setSelectedId(persisted.id);
      setIsCreating(false);
      setActivePageId((current) =>
        persisted.pages.some((page) => page.id === current) ? current : persisted.pages[0]?.id || ""
      );
      setActiveQuestionId((current) => {
        const selectedPage = persisted.pages.find((page) => page.id === activePageId) || persisted.pages[0];
        return selectedPage?.questions?.some((question) => question.id === current)
          ? current
          : selectedPage?.questions?.[0]?.id || "";
      });
      upsertDefinitionSummary(persisted);
      try {
        const listPayload = await apiRequest("/api/questionnaire-definitions");
        setDefinitions(getOwnerQuestionnaires(getDefinitionsFromResponse(listPayload)));
      } catch {
        // The saved definition is already reflected locally; Refresh can
        // reconcile any hidden legacy records.
      }
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteDefinition() {
    if (!definition) return;
    const description = "This permanently deletes the definition and all of its pages. Saved client answers are not deleted.";
    if (!window.confirm(`Delete “${definition.title}”?\n\n${description}`)) return;

    try {
      setIsDeleting(true);
      setError("");
      setNotice("");
      const revision = Number(savedDefinition?.revision ?? definition.revision ?? 0);
      const payload = await apiRequest(
        `/api/questionnaire-definitions/${encodeURIComponent(savedDefinition?.id || definition.id)}?revision=${revision}`,
        {
          method: "DELETE",
          body: JSON.stringify({ revision }),
        }
      );
      const remaining = definitions.filter(
        (item) => String(item.id) !== String(savedDefinition?.id || definition.id)
      );
      setDefinitions(remaining);
      setDefinition(null);
      setSavedDefinition(null);
      setSelectedId("");
      setActivePageId("");
      setActiveQuestionId("");
      setIsCreating(false);
      setNotice("Questionnaire deleted. Saved client answers were left untouched.");
      if (remaining[0]?.id) {
        const nextDefinition = await fetchDefinition(remaining[0].id);
        setSelectedId(nextDefinition.id);
        setDefinition(nextDefinition);
        setSavedDefinition(clone(nextDefinition));
        setJsonText(JSON.stringify(nextDefinition, null, 2));
        setJsonHasPendingEdits(false);
        setActivePageId(nextDefinition.pages[0]?.id || "");
        setActiveQuestionId(nextDefinition.pages[0]?.questions?.[0]?.id || "");
      }
    } catch (deleteError) {
      setError(deleteError.message);
    } finally {
      setIsDeleting(false);
    }
  }

  const firstCondition = activeQuestion?.visibleIf?.[0] || null;
  const conditionValue = Array.isArray(firstCondition?.value)
    ? firstCondition.value.join(", ")
    : firstCondition?.value === undefined
      ? ""
      : String(firstCondition.value);
  const conditionSourceQuestion = conditionSourceQuestions.find(
    (question) => question.answerKey === firstCondition?.field
  );
  const conditionSourceOptions = getQuestionOptions(conditionSourceQuestion);
  const checkboxConditionEditorValue = getCheckboxConditionEditorValue(firstCondition);
  const activeQuestionOptions = getQuestionOptions(activeQuestion);
  const showOptions = ["select", "radio", "yesNo"].includes(activeQuestion?.type)
    && !activeQuestion?.optionsSource;

  if (!embeddedInMatter && adminView === "library") {
    return (
      <div className="-mx-4 -my-8 min-h-[calc(100vh-105px)] bg-[#f4f7f5] px-4 py-8 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="mx-auto max-w-[1450px] space-y-6">
          <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-[#17372e]">Questionnaires</h1>
              <p className="mt-2 text-sm text-[#687d75]">Choose what clients will be asked for each visa type.</p>
            </div>
            <Button type="button" className="bg-[#1f6654] text-white hover:bg-[#174f42]" disabled={isSaving || isDeleting} onClick={openCreateQuestionnaireDialog}>
              <Plus />
              New questionnaire
            </Button>
          </header>

          {savedQuestionnairesError ? (
            <div role="alert" className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p>{savedQuestionnairesError}</p>
                <p className="mt-1">The complete built-in questionnaires are still available below. Saving requires the server connection.</p>
              </div>
            </div>
          ) : null}
          {error ? (
            <div role="alert" className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="whitespace-pre-wrap">{error}</span>
            </div>
          ) : null}
          {notice ? (
            <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              <Check className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{notice}</span>
            </div>
          ) : null}

          <div className="flex items-center gap-3 rounded-xl border border-[#dce8e2] bg-[#eaf1ed] px-4 py-3 text-sm text-[#5e746b]">
            <Layers3 className="h-5 w-5 shrink-0 text-[#477063]" />
            <span className="font-semibold text-[#31564a]">Shared templates</span>
            <span className="hidden sm:inline">Use these to manage the questions shown in the Client Portal. Client answers are not changed here.</span>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex w-full flex-col gap-3 sm:max-w-2xl sm:flex-row">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-[#71857d]" />
                <Input value={definitionSearch} onChange={(event) => setDefinitionSearch(event.target.value)} placeholder="Find a questionnaire…" aria-label="Search questionnaires" className={`${inputClassName} h-11 pl-9`} />
              </div>
              <div className="relative sm:w-44">
                <select className={`${selectClassName} h-11 appearance-none pr-9`} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filter by status">
                  <option value="all">All statuses</option>
                  <option value="active">Live</option>
                  <option value="draft">Drafts</option>
                  <option value="archived">Archived</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-3.5 h-4 w-4 text-[#60786f]" />
              </div>
            </div>
            <div className="flex items-center justify-between gap-3 text-xs text-[#6e827a] sm:justify-end">
              <span>{filteredAdminLibraryEntries.length} questionnaire{filteredAdminLibraryEntries.length === 1 ? "" : "s"}</span>
              <Button type="button" variant="ghost" size="sm" className="text-[#45685d]" disabled={isBusy} onClick={() => loadList()}>
                <RefreshCw className={isLoading ? "animate-spin" : ""} />
                Refresh
              </Button>
            </div>
          </div>

          <section className="overflow-hidden rounded-xl border border-[#dce6e1] bg-white shadow-[0_1px_2px_rgba(23,55,46,0.04)]">
            <div className="hidden grid-cols-[minmax(0,1.45fr)_minmax(150px,.55fr)_minmax(130px,.42fr)_180px] gap-5 border-b border-[#e2e9e5] bg-[#fafcfb] px-6 py-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#72867e] md:grid">
              <span>Questionnaire</span>
              <span>Contents</span>
              <span>Status</span>
              <span className="sr-only">Actions</span>
            </div>
            {isLoading ? (
              <div className="flex min-h-64 items-center justify-center text-sm text-[#647a72]"><Loader2 className="mr-3 h-5 w-5 animate-spin text-[#1f6654]" />Loading questionnaires…</div>
            ) : filteredAdminLibraryEntries.length ? filteredAdminLibraryEntries.map((entry) => {
              const item = entry.definition;
              const counts = definitionCounts(item);
              const displayStatus = entry.source === "builtIn" ? "active" : item.status;
              return (
                <article key={entry.key} className="grid gap-4 border-b border-[#e8eeeb] px-5 py-5 last:border-b-0 md:grid-cols-[minmax(0,1.45fr)_minmax(150px,.55fr)_minmax(130px,.42fr)_180px] md:items-center md:px-6">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-[#dce8e2] bg-[#f0f5f2] text-[#4f7569]"><FileText className="h-5 w-5" /></span>
                    <div className="min-w-0">
                      <h2 className="truncate text-sm font-semibold text-[#24453b]">{item.title || item.id}</h2>
                      <p className="mt-1 truncate text-xs text-[#73877f]">{entry.source === "builtIn" ? "Built-in starter template" : audienceLabel(item)}</p>
                    </div>
                  </div>
                  <div className="text-sm text-[#526b62]">
                    <p>{counts.pageCount} section{counts.pageCount === 1 ? "" : "s"}</p>
                    <p className="mt-1 text-xs text-[#81928c]">{counts.questionCount} questions</p>
                  </div>
                  <div><StatusBadge status={displayStatus} /></div>
                  <div className="flex items-center justify-end">
                    <Button type="button" variant="outline" className="w-full border-[#cedbd5] bg-white text-[#31564a] md:w-auto" disabled={isBusy} onClick={() => openAdminDefinition(entry)}>
                      {entry.source === "builtIn" ? "Use template" : "Edit questions"}
                    </Button>
                  </div>
                </article>
              );
            }) : (
              <div className="px-6 py-16 text-center">
                <FileText className="mx-auto h-9 w-9 text-[#9cafA7]" />
                <p className="mt-3 text-sm font-semibold text-[#31564a]">No matching questionnaires</p>
                <p className="mt-1 text-xs text-[#7a8d86]">Try another search or status.</p>
              </div>
            )}
          </section>

          <p className="flex items-center gap-2 text-xs text-[#758981]"><Copy className="h-4 w-4" />Need a similar questionnaire? Create a new questionnaire and choose an existing one as the starting point.</p>
        </div>

        {createDialogOpen ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#18352d]/35 p-4 backdrop-blur-[1px]" onMouseDown={(event) => { if (event.target === event.currentTarget) setCreateDialogOpen(false); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="new-questionnaire-title" aria-describedby="new-questionnaire-description" className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-[#dce6e1] bg-white p-0 text-[#17372e] shadow-2xl">
            <div className="relative px-6 pt-6 sm:px-8 sm:pt-8">
              <h2 id="new-questionnaire-title" className="text-2xl font-semibold text-[#17372e]">New questionnaire</h2>
              <p id="new-questionnaire-description" className="mt-2 text-sm text-[#6d8179]">Choose a starting point. You can change the content before saving.</p>
              <button type="button" className="absolute right-5 top-5 rounded-md px-2 py-1 text-sm font-medium text-[#5d776d] hover:bg-[#f0f5f2] hover:text-[#24453b]" onClick={() => setCreateDialogOpen(false)}>Close</button>
            </div>
            <div className="space-y-5 px-6 py-3 sm:px-8">
              <div className="space-y-2">
                <FieldLabel htmlFor="new-questionnaire-name">Questionnaire name</FieldLabel>
                <Input id="new-questionnaire-name" className={`${inputClassName} h-11`} value={createName} onChange={(event) => setCreateName(event.target.value)} />
              </div>
              <fieldset className="space-y-3">
                <legend className="mb-3 text-sm font-semibold text-[#24453b]">How would you like to start?</legend>
                <label className={`block cursor-pointer rounded-xl border p-4 transition ${createMode === "copy" ? "border-[#79ae97] bg-[#f0f7f3] ring-1 ring-[#79ae97]/25" : "border-[#dce6e1] bg-white hover:bg-[#f8fbf9]"}`}>
                  <span className="flex items-start gap-3">
                    <input type="radio" name="create-mode" className="mt-1 h-4 w-4 accent-[#1f6654]" checked={createMode === "copy"} disabled={!createSourceEntries.length} onChange={() => setCreateMode("copy")} />
                    <span className="min-w-0 flex-1">
                      <span className="font-semibold text-[#24453b]">Copy an existing questionnaire</span>
                      <span className="ml-2 rounded bg-[#dcefe5] px-2 py-1 text-[10px] font-semibold text-[#2d6a55]">Recommended</span>
                      <span className="mt-1 block text-xs leading-5 text-[#71857d]">Keep its sections and questions, then make your changes.</span>
                    </span>
                  </span>
                  {createMode === "copy" ? (
                    <select className={`${selectClassName} mt-4 h-11`} value={createSourceKey} onChange={(event) => {
                      const key = event.target.value;
                      const source = createSourceEntries.find((entry) => entry.key === key)?.definition;
                      setCreateSourceKey(key);
                      if (source) {
                        setCreateName(`${source.title} — working copy`);
                        setCreateVisaType(source.visaType || "temporary-work");
                      }
                    }}>
                      {createSourceEntries.map((entry) => {
                        const counts = definitionCounts(entry.definition);
                        return <option key={entry.key} value={entry.key}>{entry.definition.title} · {counts.pageCount} sections</option>;
                      })}
                    </select>
                  ) : null}
                </label>
                <label className={`block cursor-pointer rounded-xl border p-4 transition ${createMode === "blank" ? "border-[#79ae97] bg-[#f0f7f3] ring-1 ring-[#79ae97]/25" : "border-[#dce6e1] bg-white hover:bg-[#f8fbf9]"}`}>
                  <span className="flex items-start gap-3">
                    <input type="radio" name="create-mode" className="mt-1 h-4 w-4 accent-[#1f6654]" checked={createMode === "blank"} onChange={() => setCreateMode("blank")} />
                    <span>
                      <span className="font-semibold text-[#24453b]">Start with a blank questionnaire</span>
                      <span className="mt-1 block text-xs leading-5 text-[#71857d]">Add your own sections and questions.</span>
                    </span>
                  </span>
                  {createMode === "blank" ? (
                    <div className="mt-4">
                      <FieldLabel htmlFor="new-questionnaire-visa-type">Visa type</FieldLabel>
                      <select id="new-questionnaire-visa-type" className={`${selectClassName} mt-2 h-11`} value={createVisaType} onChange={(event) => setCreateVisaType(event.target.value)}>
                        <option value="temporary-work">Temporary work (482 / 186)</option>
                        <option value="partner">Partner Visa (Subclass 820)</option>
                        <option value="protection">Protection Visa (Subclass 866)</option>
                      </select>
                    </div>
                  ) : null}
                </label>
              </fieldset>
              <div className="flex items-center gap-3 rounded-lg bg-[#f3f6f4] px-4 py-3 text-xs text-[#647a72]"><LockKeyhole className="h-4 w-4" />This starts as a private draft. Clients will not see it until you make it live.</div>
            </div>
            <div className="flex flex-col-reverse gap-2 border-t border-[#e3eae6] px-6 py-5 sm:flex-row sm:justify-end sm:px-8">
              <Button type="button" variant="outline" className="border-[#d1ddd7] bg-white text-[#38564b]" onClick={() => setCreateDialogOpen(false)}>Cancel</Button>
              <Button type="button" className="bg-[#1f6654] text-white hover:bg-[#174f42]" disabled={isLoadingDefinition || (createMode === "copy" && !createSourceKey)} onClick={createQuestionnaireFromDialog}>
                {isLoadingDefinition ? <Loader2 className="animate-spin" /> : <Plus />}
                Create questionnaire
              </Button>
            </div>
          </section>
          </div>
        ) : null}
      </div>
    );
  }

  if (!embeddedInMatter) {
    return (
      <div className="-mx-4 -my-8 min-h-[calc(100vh-105px)] bg-[#f4f7f5] px-4 py-7 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="mx-auto max-w-[1450px] space-y-5">
          <header className="flex flex-col gap-5">
            <button type="button" className="inline-flex w-fit items-center gap-2 text-sm font-medium text-[#5d776d] hover:text-[#1f6654]" onClick={returnToQuestionnaireLibrary}>
              <ArrowLeft className="h-4 w-4" />
              All questionnaires
            </button>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-3">
                  <h1 className="truncate text-3xl font-semibold tracking-tight text-[#17372e]">{definition?.title || "Questionnaire"}</h1>
                  {definition ? <StatusBadge status={definition.status} /> : null}
                  {isDirty ? <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">Draft changes</Badge> : null}
                </div>
                {definition ? (
                  <p className="mt-2 flex items-center gap-2 text-sm text-[#6b8078]"><LockKeyhole className="h-4 w-4" />{definition.status === "active" ? "Live questionnaire. Saved changes apply to the Client Portal." : "Private draft. Clients cannot see it until you make it live."}</p>
                ) : null}
              </div>
              {definition ? (
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" className="border-[#cfddd6] bg-white text-[#38564b]" disabled={isBusy} onClick={copyDefinitionAsTest}><Copy />Copy as test</Button>
                  <Button type="button" className="bg-[#1f6654] text-white hover:bg-[#174f42]" disabled={isBusy || !isDirty} onClick={() => saveDefinition()}>{isSaving ? <Loader2 className="animate-spin" /> : <Save />}Save changes</Button>
                  {definition.status === "draft" ? <Button type="button" className="bg-[#173f35] text-white hover:bg-[#102f28]" disabled={isBusy} onClick={() => saveDefinition("active")}><Send />Make live</Button> : null}
                </div>
              ) : null}
            </div>
          </header>

          {savedQuestionnairesError ? (
            <div role="alert" className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"><CircleAlert className="mt-0.5 h-4 w-4 shrink-0" /><span>{savedQuestionnairesError}</span></div>
          ) : null}
          {error ? (
            <div role="alert" className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><CircleAlert className="mt-0.5 h-4 w-4 shrink-0" /><span className="whitespace-pre-wrap">{error}</span></div>
          ) : null}
          {notice ? (
            <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700"><Check className="mt-0.5 h-4 w-4 shrink-0" /><span>{notice}</span></div>
          ) : null}

          {isLoading || isLoadingDefinition ? (
            <section className="flex min-h-[560px] items-center justify-center rounded-xl border border-[#dce6e1] bg-white"><p role="status" className="flex items-center gap-3 text-sm text-[#60786f]"><Loader2 className="h-6 w-6 animate-spin text-[#1f6654]" />Loading questionnaire…</p></section>
          ) : !definition ? (
            <EmptyPane onCreate={openCreateQuestionnaireDialog} />
          ) : (
            <fieldset disabled={isSaving || isDeleting} className="m-0 min-w-0 border-0 p-0 disabled:cursor-wait">
              <div className="grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
                <aside className="self-start overflow-hidden rounded-xl border border-[#dce6e1] bg-white shadow-[0_1px_2px_rgba(23,55,46,0.04)] lg:sticky lg:top-6">
                  <div className="flex items-center justify-between px-4 pb-3 pt-4">
                    <div>
                      <h2 className="font-semibold text-[#17372e]">Sections</h2>
                      <p className="mt-1 text-xs text-[#7a8e86]">{definition.pages.length} total</p>
                    </div>
                  </div>
                  <div className="px-3 pb-3">
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-[#71857d]" />
                      <Input value={pageSearch} onChange={(event) => setPageSearch(event.target.value)} placeholder="Find a section…" aria-label="Search sections" className={`${inputClassName} pl-9`} />
                    </div>
                  </div>
                  <div className="border-y border-[#e5ebe8] px-3 py-3">
                    <p className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#7b8e87]">Questionnaire sections</p>
                    <div className="max-h-[calc(100vh-390px)] space-y-1 overflow-y-auto">
                      {filteredPages.map((page) => (
                        <button key={page.id} type="button" onClick={() => {
                          setActivePageId(page.id);
                          setActiveQuestionId(page.questions?.[0]?.id || "");
                          setQuestionEditorOpen(false);
                          setSectionSettingsOpen(false);
                        }} className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-3 text-left text-sm transition ${page.id === activePageId ? "bg-[#e5f1ea] font-semibold text-[#2b5f4d] ring-1 ring-[#add0bf]" : "text-[#587067] hover:bg-[#f2f7f4]"}`}>
                          <span className="truncate">{page.title}</span>
                          <span className="flex shrink-0 items-center gap-2 text-xs text-[#789087]"><span>{countQuestions(page.questions)}</span><ChevronRight className="h-4 w-4" /></span>
                        </button>
                      ))}
                      {!filteredPages.length ? <p className="px-3 py-8 text-center text-xs leading-5 text-[#7a8e86]">{pageSearch ? "No matching sections." : "No sections yet."}</p> : null}
                    </div>
                  </div>
                  <div className="p-3">
                    <Button type="button" variant="outline" className="w-full border-[#d2dfd8] bg-white text-[#38564b]" disabled={isBusy} onClick={() => { addPage(); setSectionSettingsOpen(true); setQuestionEditorOpen(false); }}><Plus />Add section</Button>
                  </div>
                </aside>

                <main ref={adminContentRef} className="min-w-0 scroll-mt-6">
                  {!activePage ? (
                    <section className="flex min-h-[500px] flex-col items-center justify-center rounded-xl border border-[#dce6e1] bg-white px-6 text-center">
                      <FileText className="h-10 w-10 text-[#9fb4ac]" />
                      <h2 className="mt-4 text-lg font-semibold text-[#17372e]">Add your first section</h2>
                      <p className="mt-2 max-w-md text-sm text-[#71857d]">Sections group related questions and preserve the existing Client Portal routes and answer storage.</p>
                      <Button type="button" className="mt-5 bg-[#1f6654] text-white hover:bg-[#174f42]" onClick={() => { addPage(); setSectionSettingsOpen(true); }}><Plus />Add section</Button>
                    </section>
                  ) : questionEditorOpen && activeQuestion ? (
                    <section className="space-y-5">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="text-xs text-[#6c8179]">{definition.title} <ChevronRight className="mx-1 inline h-3 w-3" /> {activePage.title}</p>
                          <h2 className="mt-2 text-2xl font-semibold text-[#17372e]">Edit question</h2>
                          <p className="mt-1 text-sm text-[#70837c]">Use everyday language. The preview updates as you edit.</p>
                        </div>
                        <Button type="button" variant="outline" className="border-[#cfddd6] bg-white text-[#38564b]" onClick={() => setQuestionEditorOpen(false)}><ArrowLeft />Back to questions</Button>
                      </div>

                      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(300px,.85fr)]">
                        <div className="space-y-5 rounded-xl border border-[#dce6e1] bg-white p-5 shadow-[0_1px_2px_rgba(23,55,46,0.04)] sm:p-6">
                          <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                              <FieldLabel htmlFor="question-label">Question</FieldLabel>
                              <Textarea id="question-label" rows={2} className="border-[#d7e4de] bg-white" value={activeQuestion.label} onChange={(event) => updateQuestionField("label", event.target.value)} />
                            </div>
                            <div className="space-y-2">
                              <FieldLabel htmlFor="question-type">How should clients answer?</FieldLabel>
                              <select id="question-type" className={selectClassName} value={activeQuestion.type} disabled={isBusy} onChange={(event) => changeQuestionType(event.target.value)}>
                                {QUESTION_TYPES.map(([value, label]) => <option key={value} value={value} disabled={value === "repeater"}>{label}</option>)}
                              </select>
                            </div>
                          </div>

                          {showOptions ? (
                            <div className="space-y-3">
                              <div className="flex items-center justify-between gap-3">
                                <div><h3 className="text-sm font-semibold text-[#24453b]">Answer options</h3><p className="mt-1 text-xs text-[#71857d]">Labels can change without changing saved answer values.</p></div>
                                <Button type="button" variant="outline" size="sm" className="border-[#d2dfd8] bg-white text-[#38564b]" disabled={activeQuestion.type === "yesNo" || isBusy} onClick={addOption}><Plus />Add option</Button>
                              </div>
                              <div className="space-y-2">
                                {activeQuestionOptions.map((option, optionIndex) => (
                                  <div key={`${option.value}-${optionIndex}`} className="grid items-center gap-2 sm:grid-cols-[24px_minmax(0,1fr)_auto]">
                                    <GripVertical className="hidden h-4 w-4 text-[#8ba098] sm:block" />
                                    <Input className={inputClassName} aria-label={`Option ${optionIndex + 1} label`} value={option.label} onChange={(event) => updateOption(optionIndex, "label", event.target.value)} />
                                    <Button type="button" variant="ghost" size="sm" className="text-red-600 hover:bg-red-50" disabled={activeQuestion.type === "yesNo" || activeQuestionOptions.length <= 1 || isBusy} onClick={() => deleteOption(optionIndex)}><Trash2 />Remove</Button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : null}

                          <div className="grid gap-4 border-t border-[#e6ece9] pt-5 md:grid-cols-2">
                            <div className="space-y-2">
                              <FieldLabel htmlFor="question-description">Help text</FieldLabel>
                              <Textarea id="question-description" rows={2} className="border-[#d7e4de] bg-white" value={activeQuestion.description || ""} onChange={(event) => updateQuestionField("description", event.target.value)} />
                            </div>
                            <div className="space-y-2">
                              <FieldLabel htmlFor="question-placeholder">Placeholder</FieldLabel>
                              <Input id="question-placeholder" className={inputClassName} value={activeQuestion.placeholder || ""} onChange={(event) => updateQuestionField("placeholder", event.target.value)} />
                            </div>
                          </div>

                          <label className="flex items-start gap-3 border-t border-[#e6ece9] pt-5 text-sm text-[#38564b]">
                            <input type="checkbox" className="mt-0.5 h-5 w-5 accent-[#1f6654]" checked={activeQuestion.required} disabled={isBusy} onChange={(event) => updateQuestionField("required", event.target.checked)} />
                            <span><span className="block font-semibold text-[#24453b]">Answer is required</span><span className="mt-1 block text-xs text-[#71857d]">Clients must answer before they can continue.</span></span>
                          </label>

                          <div className="space-y-3 border-t border-[#e6ece9] pt-5">
                            <h3 className="text-sm font-semibold text-[#24453b]">When should clients see this question?</h3>
                            <label className="flex items-center gap-3 text-sm font-medium text-[#38564b]">
                              <input type="checkbox" className="h-4 w-4 accent-[#1f6654]" checked={Boolean(firstCondition)} disabled={isBusy || (!firstCondition && conditionSourceQuestions.length === 0)} onChange={(event) => toggleCondition(event.target.checked)} />
                              Only after a certain answer
                            </label>
                            {firstCondition ? (
                              <div className="rounded-xl border border-[#b9d9c8] bg-[#f0f7f3] p-4">
                                <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-[#356352]"><ChevronRight className="h-4 w-4" />Show this question when</p>
                                <div className="grid gap-3 md:grid-cols-3">
                                  <div className="space-y-2">
                                    <FieldLabel htmlFor="condition-question">Earlier question</FieldLabel>
                                    <select id="condition-question" className={selectClassName} value={firstCondition.field || ""} onChange={(event) => updateConditionSource(event.target.value)}>
                                      <option value="" disabled>Select a question</option>
                                      {conditionSourceQuestions.map((question) => <option key={question.id} value={question.answerKey}>{question.label}</option>)}
                                    </select>
                                  </div>
                                  <div className="space-y-2">
                                    <FieldLabel htmlFor="condition-operator">Rule</FieldLabel>
                                    <select id="condition-operator" className={selectClassName} value={firstCondition.op || "equals"} onChange={(event) => updateCondition("op", event.target.value)}>
                                      {CONDITION_OPERATORS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                                    </select>
                                  </div>
                                  <div className="space-y-2">
                                    <FieldLabel htmlFor="condition-answer">Answer</FieldLabel>
                                    {["exists", "notExists"].includes(firstCondition.op) ? <p id="condition-answer" className="flex h-10 items-center text-sm text-[#60786f]">No answer needed</p> : conditionSourceOptions.length ? (
                                      <select id="condition-answer" className={selectClassName} multiple={["in", "notIn"].includes(firstCondition.op)} value={["in", "notIn"].includes(firstCondition.op) ? Array.isArray(firstCondition.value) ? firstCondition.value : [firstCondition.value].filter(Boolean) : firstCondition.value ?? ""} onChange={(event) => updateCondition("value", ["in", "notIn"].includes(firstCondition.op) ? Array.from(event.target.selectedOptions || []).map((option) => option.value) : event.target.value)}>
                                        <option value="" disabled>Select an answer</option>
                                        {conditionSourceOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                                      </select>
                                    ) : conditionSourceQuestion?.type === "checkbox" ? (
                                      <select id="condition-answer" className={selectClassName} value={checkboxConditionEditorValue} onChange={(event) => updateCondition("value", ["in", "notIn"].includes(firstCondition.op) ? event.target.value === "both" ? [true, false] : [event.target.value === "true"] : event.target.value === "true")}>
                                        <option value="true">Checked</option><option value="false">Not checked</option>{["in", "notIn"].includes(firstCondition.op) ? <option value="both">Either answer</option> : null}
                                      </select>
                                    ) : <Input id="condition-answer" className={inputClassName} value={conditionValue} onChange={(event) => updateCondition("value", ["in", "notIn"].includes(firstCondition.op) ? event.target.value.split(",").map((value) => value.trim()) : event.target.value)} />}
                                  </div>
                                </div>
                                {activeQuestion.visibleIf?.length > 1 ? <p className="mt-3 text-xs text-amber-700">Additional display rules are preserved and can be reviewed in Advanced JSON.</p> : null}
                              </div>
                            ) : null}
                          </div>

                          {activeQuestion.metadata?.fields?.length ? (
                            <div className="space-y-4 border-t border-[#e6ece9] pt-5">
                              <div><h3 className="text-sm font-semibold text-[#24453b]">Record fields</h3><p className="mt-1 text-xs text-[#71857d]">Edit the wording shown inside each record. Saved keys stay unchanged.</p></div>
                              {activeQuestion.metadata.fields.map((field) => <EmbeddedNestedQuestionEditor key={field.id} question={field} kind="record" legacy={legacyPage} sourceQuestions={flattenQuestions(activeQuestion.metadata.fields)} onUpdate={updateNestedQuestion} onDeleteOption={deleteNestedOption} />)}
                            </div>
                          ) : null}

                          {activeQuestion.followUps?.length ? (
                            <div className="space-y-4 border-t border-[#e6ece9] pt-5">
                              <div><h3 className="text-sm font-semibold text-[#24453b]">Follow-up questions</h3><p className="mt-1 text-xs text-[#71857d]">These appear only when their existing rules are met.</p></div>
                              {activeQuestion.followUps.map((question) => <EmbeddedNestedQuestionEditor key={question.id} question={question} kind="follow-up" legacy={legacyPage} sourceQuestions={pageQuestions} onUpdate={updateNestedQuestion} onDeleteOption={deleteNestedOption} />)}
                            </div>
                          ) : null}

                          <details className="group rounded-xl border border-[#e1e9e5] bg-[#f8fbf9]">
                            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-[#38564b]"><span className="flex items-center gap-2"><Settings2 className="h-4 w-4" />Advanced question settings</span><ChevronRight className="h-4 w-4 transition group-open:rotate-90" /></summary>
                            <div className="space-y-4 border-t border-[#e1e9e5] p-4">
                              <div className="grid gap-4 md:grid-cols-2">
                                <div className="space-y-2"><FieldLabel htmlFor="question-id" hint="machine key">Question ID</FieldLabel><Input id="question-id" className={`${inputClassName} font-mono`} value={activeQuestion.id} disabled={machineKeysLocked} onChange={(event) => updateQuestionField("id", event.target.value)} /></div>
                                <div className="space-y-2"><FieldLabel htmlFor="question-key" hint="saved answer key">Answer key</FieldLabel><Input id="question-key" className={`${inputClassName} font-mono`} value={activeQuestion.answerKey} disabled={machineKeysLocked} onChange={(event) => updateQuestionField("answerKey", event.target.value)} /></div>
                              </div>
                              {showOptions ? activeQuestionOptions.map((option, optionIndex) => <div key={`stored-${option.value}-${optionIndex}`} className="grid gap-2 sm:grid-cols-[140px_minmax(0,1fr)]"><span className="flex items-center text-xs text-[#71857d]">Stored value {optionIndex + 1}</span><Input className={`${inputClassName} font-mono`} value={option.value} disabled={isBusy || activeQuestion.type === "yesNo"} onChange={(event) => updateOption(optionIndex, "value", event.target.value)} /></div>) : null}
                              <QuestionCrmSyncPanel question={activeQuestion} disabled={isBusy} onChange={updateQuestionCrm} />
                            </div>
                          </details>

                          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e6ece9] pt-5">
                            <Button type="button" variant="ghost" className="text-red-600 hover:bg-red-50 hover:text-red-700" disabled={isBusy} onClick={deleteQuestion}><Trash2 />Remove question</Button>
                            <div className="flex gap-2">
                              <Button type="button" variant="outline" className="border-[#d2dfd8] bg-white text-[#38564b]" disabled={isBusy || activeQuestionIndex === 0} onClick={() => moveQuestion(-1)}><ArrowUp />Move up</Button>
                              <Button type="button" variant="outline" className="border-[#d2dfd8] bg-white text-[#38564b]" disabled={isBusy || activeQuestionIndex === activePage.questions.length - 1} onClick={() => moveQuestion(1)}><ArrowDown />Move down</Button>
                              <Button type="button" className="bg-[#1f6654] text-white hover:bg-[#174f42]" onClick={() => setQuestionEditorOpen(false)}><Check />Done</Button>
                            </div>
                          </div>
                        </div>

                        <aside className="self-start rounded-xl border border-[#dce6e1] bg-[#eef4f0] p-5 xl:sticky xl:top-6">
                          <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#5d776d]"><Eye className="h-4 w-4" />Client preview</p>
                          <div className="mt-4"><QuestionPreview question={activeQuestion} /></div>
                          <p className="mt-4 flex items-start gap-2 text-xs leading-5 text-[#71857d]"><CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />This is a layout preview. Existing Client Portal data and saved answers remain unchanged until you save the questionnaire.</p>
                          {firstCondition ? <div className="mt-8 rounded-lg bg-[#e2eee7] px-4 py-3 text-xs leading-5 text-[#4d6d61]"><p className="font-semibold">Shown conditionally</p><p className="mt-1">This question appears only when its earlier answer rule is met.</p></div> : null}
                        </aside>
                      </div>
                    </section>
                  ) : (
                    <section className="overflow-hidden rounded-xl border border-[#dce6e1] bg-white shadow-[0_1px_2px_rgba(23,55,46,0.04)]">
                      <div className="p-5 sm:p-6">
                        <div className="flex flex-col gap-4 border-b border-[#e5ebe8] pb-5 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <h2 className="text-2xl font-semibold text-[#17372e]">{activePage.title}</h2>
                            {getIntroText(activePage) ? <p className="mt-2 max-w-3xl text-sm leading-6 text-[#70837c]">{getIntroText(activePage)}</p> : <p className="mt-2 text-sm text-[#8a9b95]">No section introduction.</p>}
                          </div>
                          <Button type="button" variant="ghost" className="text-[#45685d]" onClick={() => setSectionSettingsOpen((current) => !current)}><Pencil />Edit section</Button>
                        </div>

                        {sectionSettingsOpen ? (
                          <div className="mt-5 rounded-xl border border-[#dce6e1] bg-[#f8fbf9] p-4 sm:p-5">
                            <div className="mb-4 flex items-center justify-between"><div><h3 className="font-semibold text-[#24453b]">Section details</h3><p className="mt-1 text-xs text-[#71857d]">Order {activePageIndex + 1} of {definition.pages.length}</p></div><div className="flex gap-1"><Button type="button" variant="ghost" size="icon" disabled={isBusy || activePageIndex === 0} onClick={() => movePage(-1)} aria-label="Move section up"><ArrowUp /></Button><Button type="button" variant="ghost" size="icon" disabled={isBusy || activePageIndex === definition.pages.length - 1} onClick={() => movePage(1)} aria-label="Move section down"><ArrowDown /></Button><Button type="button" variant="ghost" size="icon" className="text-red-600 hover:bg-red-50" disabled={isBusy} onClick={deletePage} aria-label="Delete section"><Trash2 /></Button></div></div>
                            <div className="grid gap-4 md:grid-cols-2">
                              <div className="space-y-2 md:col-span-2"><FieldLabel htmlFor="page-title">Section title</FieldLabel><Input id="page-title" className={inputClassName} value={activePage.title} onChange={(event) => updatePageField("title", event.target.value)} /></div>
                              <div className="space-y-2 md:col-span-2"><FieldLabel htmlFor="page-intro">Intro text</FieldLabel><Textarea id="page-intro" rows={3} className="border-[#d7e4de] bg-white" disabled={legacyPage && !activePage.metadata?.originalIntroBlocks?.length} value={getIntroText(activePage)} onChange={(event) => updateActivePage((page) => setIntroText(page, event.target.value))} /></div>
                              <details className="group md:col-span-2">
                                <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-[#45685d]"><Settings2 className="h-4 w-4" />Route and storage settings<ChevronRight className="h-4 w-4 transition group-open:rotate-90" /></summary>
                                <div className="mt-4 grid gap-4 md:grid-cols-2">
                                  <div className="space-y-2"><FieldLabel htmlFor="page-id" hint="machine key">Section ID</FieldLabel><Input id="page-id" className={`${inputClassName} font-mono`} value={activePage.id} disabled={machineKeysLocked} onChange={(event) => updatePageField("id", event.target.value)} /></div>
                                  <div className="space-y-2"><FieldLabel htmlFor="page-section" hint="answer storage key">Section key</FieldLabel><Input id="page-section" className={`${inputClassName} font-mono`} value={activePage.sectionKey} disabled={machineKeysLocked} onChange={(event) => updatePageField("sectionKey", event.target.value)} /></div>
                                  <div className="space-y-2 md:col-span-2"><FieldLabel htmlFor="page-route" hint="existing Client Portal route">Client route</FieldLabel><Input id="page-route" list="registered-questionnaire-routes-admin" className={`${inputClassName} font-mono`} value={activePage.route} disabled={machineKeysLocked} onChange={(event) => { const route = event.target.value; updateActivePage((page) => ({ ...page, route, completionKey: route.replace(/^\/intake\//, ""), scope: getRouteScope(route) })); }} /><datalist id="registered-questionnaire-routes-admin">{registeredRoutes.map((route) => <option key={route.href} value={route.href}>{route.title}</option>)}</datalist></div>
                                  <div className="space-y-2"><FieldLabel htmlFor="page-completion" hint="progress key">Completion key</FieldLabel><Input id="page-completion" className={`${inputClassName} font-mono`} value={activePage.completionKey} disabled /></div>
                                  <div className="space-y-2"><FieldLabel htmlFor="page-scope">Answer scope</FieldLabel><select id="page-scope" className={selectClassName} value={activePage.scope} disabled={machineKeysLocked} onChange={(event) => updatePageField("scope", event.target.value)}><option value="shared">Shared / application</option><option value="profile">Per applicant profile</option></select></div>
                                </div>
                              </details>
                            </div>
                          </div>
                        ) : null}

                        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                          <div><h3 className="font-semibold text-[#24453b]">{activePage.questions.length} question{activePage.questions.length === 1 ? "" : "s"}</h3><p className="mt-1 text-xs text-[#7a8d86]">Select a question to edit its wording, choices, and display rules.</p></div>
                          <Button type="button" className="bg-[#1f6654] text-white hover:bg-[#174f42]" disabled={isBusy} onClick={() => { addQuestion(); setQuestionEditorOpen(true); }}><Plus />Add question</Button>
                        </div>
                      </div>

                      <div className="space-y-2 bg-[#fbfcfb] px-5 pb-5 sm:px-6 sm:pb-6">
                        {activePage.questions.map((question, index) => (
                          <article key={`${question.id}-${index}`} className="flex flex-col gap-3 rounded-xl border border-[#dce6e1] bg-white px-4 py-4 transition hover:border-[#b9d3c7] hover:shadow-[0_2px_8px_rgba(23,55,46,0.05)] sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex min-w-0 items-center gap-4">
                              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#f0f5f2] text-xs font-semibold text-[#547368]">{index + 1}</span>
                              <div className="min-w-0"><h4 className="truncate text-sm font-semibold text-[#24453b]">{question.label}</h4><p className="mt-1 text-xs text-[#7a8d86]">{questionTypeLabel(question.type)}{question.required ? " · Required" : ""}{question.followUps?.length ? ` · ${question.followUps.length} follow-up` : ""}</p></div>
                            </div>
                            <Button type="button" variant="ghost" className="justify-start text-[#45685d] sm:justify-center" onClick={() => { setActiveQuestionId(question.id); setQuestionEditorOpen(true); }}><Pencil />Edit</Button>
                          </article>
                        ))}
                        {!activePage.questions.length ? <div className="rounded-xl border border-dashed border-[#cbdad3] bg-white px-6 py-14 text-center text-sm text-[#71857d]">No questions in this section yet.</div> : null}
                        <div className="flex items-center justify-between pt-2 text-xs text-[#748880]"><span>{isDirty ? "Draft changes not saved" : "All changes saved"}</span>{!isDirty ? <span className="flex items-center gap-1"><Check className="h-3.5 w-3.5" />Saved</span> : null}</div>
                      </div>
                    </section>
                  )}

                  <details className="group mt-5 overflow-hidden rounded-xl border border-[#dce6e1] bg-white shadow-[0_1px_2px_rgba(23,55,46,0.04)]" onToggle={(event) => { if (event.currentTarget.open && !jsonHasPendingEdits) { setJsonText(JSON.stringify(definition, null, 2)); setJsonError(""); } }}>
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 sm:px-6"><div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#e8f4ee] text-[#4F726B]"><Braces className="h-4 w-4" /></span><div><h3 className="font-semibold text-[#17372e]">Advanced questionnaire tools</h3><p className="mt-1 text-xs text-[#71857d]">Settings, deletion, and complete JSON.</p></div></div><ChevronRight className="h-5 w-5 text-[#71857d] transition-transform group-open:rotate-90" /></summary>
                    <div className="space-y-5 border-t border-[#e1e9e5] p-5 sm:p-6">
                      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                        <div className="space-y-2 md:col-span-2"><FieldLabel htmlFor="questionnaire-title">Title</FieldLabel><Input id="questionnaire-title" className={inputClassName} value={definition.title} onChange={(event) => updateDefinitionField("title", event.target.value)} /></div>
                        <div className="space-y-2"><FieldLabel htmlFor="questionnaire-version">Version</FieldLabel><Input id="questionnaire-version" className={inputClassName} value={definition.version} onChange={(event) => updateDefinitionField("version", event.target.value)} /></div>
                        <div className="space-y-2 md:col-span-2"><FieldLabel htmlFor="questionnaire-id" hint="machine key">ID</FieldLabel><Input id="questionnaire-id" className={`${inputClassName} font-mono`} value={definition.id} disabled={!isCreating || machineKeysLocked} onChange={(event) => { updateDefinitionField("id", event.target.value); setSelectedId(event.target.value); }} /></div>
                        <div className="space-y-2"><FieldLabel htmlFor="questionnaire-visa-type">Visa type</FieldLabel><select id="questionnaire-visa-type" className={selectClassName} value={definition.visaType} disabled={machineKeysLocked} onChange={(event) => { const visaType = event.target.value; setDefinition((current) => { const next = { ...current, visaType }; if (visaType !== "temporary-work") { next.visaContexts = []; delete next.visaContext; } return next; }); }}><option value="temporary-work">Temporary work (482 / 186)</option><option value="partner">Partner Visa (Subclass 820)</option><option value="protection">Protection Visa (Subclass 866)</option></select></div>
                        <div className="space-y-2 md:col-span-2 xl:col-span-3"><FieldLabel htmlFor="questionnaire-contexts" hint="comma separated">Visa contexts</FieldLabel><Input id="questionnaire-contexts" className={inputClassName} value={definition.visaContexts.join(", ")} disabled={machineKeysLocked || definition.visaType !== "temporary-work"} placeholder="482, 186" onChange={(event) => updateDefinitionField("visaContexts", event.target.value.split(",").map((value) => value.trim()).filter(Boolean))} /></div>
                      </div>
                      {machineKeysLocked ? <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">Advanced JSON is read-only for this live questionnaire. Use the visual fields above for supported changes.</p> : null}
                      <Textarea value={jsonText} onChange={(event) => { setJsonText(event.target.value); setJsonHasPendingEdits(true); setJsonError(""); }} readOnly={machineKeysLocked} spellCheck={false} aria-label="Questionnaire JSON" className="min-h-[360px] border-[#d7e4de] bg-[#11221d] font-mono text-xs leading-5 text-[#d8eee5]" />
                      {jsonError ? <p role="alert" className="text-sm text-red-600">{jsonError}</p> : null}
                      <div className="flex flex-wrap items-center gap-2">
                        <Button type="button" variant="outline" className="border-[#d7e4de] bg-white" disabled={machineKeysLocked || !jsonHasPendingEdits} onClick={applyJson}><Check />Apply JSON</Button>
                        {jsonHasPendingEdits ? <Button type="button" variant="ghost" onClick={() => { setJsonText(JSON.stringify(definition, null, 2)); setJsonHasPendingEdits(false); setJsonError(""); }}>Discard JSON edits</Button> : null}
                        <label className={`inline-flex min-h-9 cursor-pointer items-center justify-center gap-2 rounded-md border border-[#d7e4de] bg-white px-4 py-2 text-sm font-medium text-[#38564b] ${machineKeysLocked ? "cursor-not-allowed opacity-50" : "hover:bg-[#f8fbf9]"}`}><FileJson className="h-4 w-4" />Import file<input type="file" accept="application/json,.json" className="sr-only" disabled={machineKeysLocked} onChange={(event) => { importJson(event.target.files?.[0]); event.target.value = ""; }} /></label>
                        <Button type="button" variant="ghost" className="ml-auto text-red-600 hover:bg-red-50 hover:text-red-700" disabled={isBusy || isCreating} onClick={deleteDefinition}>{isDeleting ? <Loader2 className="animate-spin" /> : <Trash2 />}Delete questionnaire</Button>
                      </div>
                    </div>
                  </details>
                </main>
              </div>
            </fieldset>
          )}
        </div>
      </div>
    );
  }

  if (embeddedInMatter && isLoading) {
    return (
      <MatterTabLoadingState label="Loading questionnaire builder data…" />
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#70877e]">
            {embeddedInMatter ? "Matter workspace" : "Admin · Questionnaires"}
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#17372e]">
            {embeddedInMatter ? "Questionnaire builder" : "Questionnaire Edit Centre"}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#60786f]">
            {embeddedInMatter
              ? "Choose a page and question, then edit its wording, answer choices, or display rules."
              : "Edit the questions, answer options and help text shown in the Client Portal. Choose a questionnaire, select a page, make your changes, then save."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            className="border-[#d7e4de] bg-white text-[#38564b]"
            disabled={isBusy}
            onClick={() => {
              if (confirmDiscard()) loadList();
            }}
          >
            <RefreshCw className={isLoading ? "animate-spin" : ""} />
            Refresh
          </Button>
          <Button type="button" className="bg-[#4F726B] text-white" disabled={isSaving || isDeleting} onClick={createDefinition}>
            <Plus />
            Add questionnaire
          </Button>
        </div>
      </header>

      {savedQuestionnairesError ? (
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p>{savedQuestionnairesError}</p>
            <p className="mt-1">The complete built-in questionnaires remain available for review and editing. Saving changes requires the server connection.</p>
          </div>
        </div>
      ) : null}
      {error ? (
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="whitespace-pre-wrap">{error}</span>
        </div>
      ) : null}
      {notice ? (
        <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          <Check className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{notice}</span>
        </div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[300px_minmax(0,1fr)]">
        <aside className={`flex flex-col self-start overflow-hidden rounded-2xl border border-white/80 bg-white/80 shadow-sm backdrop-blur xl:sticky ${
          embeddedInMatter
            ? "xl:top-[calc(var(--matter-header-height)+1.5rem)] xl:max-h-[calc(100vh-var(--matter-header-height)-3rem)]"
            : "xl:top-6 xl:max-h-[calc(100vh-3rem)]"
        }`}>
          <div className="flex shrink-0 items-center justify-between border-b border-[#e1e9e5] px-4 py-4">
            <div>
              <h2 className="font-semibold text-[#17372e]">
                {embeddedInMatter ? "Visa questionnaires" : "Saved questionnaires"}
              </h2>
              <p className="text-xs text-[#71857d]">
                {embeddedInMatter
                  ? `${availableDefinitionEntries.length} available`
                  : `${definitions.filter((item) => item.status === "active").length} live · ${definitions.filter((item) => item.status === "draft").length} tests`}
              </p>
            </div>
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin text-[#4F726B]" /> : null}
          </div>
          <div className="shrink-0 border-b border-[#e1e9e5] p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-[#71857d]" />
              <Input value={definitionSearch} onChange={(event) => setDefinitionSearch(event.target.value)} placeholder="Search name or visa" aria-label="Search questionnaires" className={`${inputClassName} pl-9`} />
            </div>
          </div>
          <div className="min-h-0 max-h-[420px] space-y-2 overflow-y-auto p-3 xl:max-h-none">
            {filteredDefinitions.length ? filteredDefinitions.map((entry) => {
              const item = entry.definition;
              const counts = definitionCounts(item);
              const selected = entry.source === "builtIn"
                ? isCreating && questionnaireAudienceKey(definition) === entry.audienceKey
                : !isCreating && String(item.id) === String(selectedId);
              return (
                <button
                  key={`${entry.audienceKey}:${item.id}`}
                  type="button"
                  disabled={isBusy}
                  onClick={() => {
                    if (selected) return;
                    if (entry.source === "builtIn") {
                      createDefinitionFrom(item, { starter: true });
                    } else {
                      selectDefinition(item.id);
                    }
                  }}
                  className={`w-full cursor-pointer rounded-xl border p-3 text-left transition hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4F726B] focus-visible:ring-offset-2 disabled:cursor-not-allowed ${
                    selected
                      ? "border-[#8ac6ad] bg-[#e8f4ee] shadow-sm hover:border-[#4F726B] hover:bg-[#dcefe5]"
                      : "border-[#e1e9e5] bg-white hover:border-[#8ac6ad] hover:bg-[#f0f8f3]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="line-clamp-2 text-sm font-semibold text-[#17372e]">
                      {item.title || item.id}
                    </span>
                    <StatusBadge status={entry.source === "builtIn" ? "active" : item.status} />
                  </div>
                  {!embeddedInMatter ? (
                    <p className="mt-2 truncate text-xs text-[#60786f]">{audienceLabel(item)}</p>
                  ) : null}
                  <p className="mt-2 text-[11px] text-[#80928b]">
                    {counts.pageCount} pages · {counts.questionCount} questions{!embeddedInMatter ? ` · v${item.version || "1.0.0"}` : ""}
                  </p>
                </button>
              );
            }) : !isLoading ? (
              <div className="px-3 py-10 text-center text-sm text-[#71857d]">
                {savedQuestionnairesError ? "Saved questionnaires could not be loaded. Use Refresh to try again." : definitionSearch ? "No matching questionnaires." : "No saved questionnaires yet. Start with the template below or create a new one."}
              </div>
            ) : null}
          </div>
          {!embeddedInMatter ? (
            <div className="shrink-0 border-t border-[#e1e9e5] p-4">
              <h3 className="text-sm font-semibold text-[#17372e]">Built-in questionnaires</h3>
              <p className="mt-1 text-xs leading-5 text-[#60786f]">The existing questionnaire structure is bundled as a fallback. Choose a visa to open it as a new editable questionnaire.</p>
              <div className="mt-3 space-y-2">
                {questionnaireBuiltInTemplates.map((template) => (
                  <Button key={template.id} type="button" variant="outline" className="h-auto w-full justify-start whitespace-normal border-[#d7e4de] bg-white py-3 text-left text-[#38564b]" disabled={isSaving || isDeleting} onClick={() => createDefinitionFrom(template, { starter: true, asTestCopy: true })}>
                    <Copy className="h-4 w-4 shrink-0" />
                    <span>{template.title}<span className="mt-1 block text-xs font-normal text-[#71857d]">{template.pages.length} pages · {definitionCounts(template).questionCount} questions</span></span>
                  </Button>
                ))}
              </div>
              <Button type="button" variant="outline" className="mt-3 w-full border-[#d7e4de] bg-white text-[#38564b]" disabled={isSaving || isDeleting} onClick={() => createDefinitionFrom(temporaryWork482Definition, { starter: true, asTestCopy: true })}>
                <Copy className="h-4 w-4" />
                Use 482 Character starter
              </Button>
            </div>
          ) : null}
        </aside>

        {isLoading || isLoadingDefinition ? (
          <section className="flex min-h-[560px] items-center justify-center rounded-2xl border border-white/80 bg-white/80">
            <p role="status" className="flex items-center gap-3 text-sm text-[#60786f]"><Loader2 className="h-6 w-6 animate-spin text-[#4F726B]" />Loading questionnaires…</p>
          </section>
        ) : !definition ? (
          embeddedInMatter ? (
            <section className="flex min-h-[360px] items-center justify-center rounded-2xl border border-white/80 bg-white/80 px-6 text-center">
              <div>
                <h2 className="font-semibold text-[#17372e]">No questionnaire available</h2>
                <p className="mt-2 text-sm text-[#71857d]">There is no saved questionnaire to edit yet.</p>
              </div>
            </section>
          ) : (
            <EmptyPane onCreate={createDefinition} />
          )
        ) : (
          <fieldset
            disabled={isSaving || isDeleting}
            className="m-0 min-w-0 space-y-5 border-0 p-0 disabled:cursor-wait"
          >
            <section className="rounded-2xl border border-white/80 bg-white p-5 shadow-sm sm:p-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="truncate text-xl font-semibold text-[#17372e]">{definition.title}</h2>
                    <StatusBadge status={definition.status} />
                    {isDirty ? (
                      <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700">
                        Unsaved
                      </Badge>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs text-[#71857d]">
                    {embeddedInMatter
                      ? `${definitionCounts(definition).pageCount} pages · ${definitionCounts(definition).questionCount} questions`
                      : audienceLabel(definition)}
                    {` · ${getCrmCoverageSummary(definition).mapped} mapped · ${getCrmCoverageSummary(definition).portalOnly} portal-only · ${getCrmCoverageSummary(definition).unconfigured} unconfigured`}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    className="bg-[#4F726B] text-white hover:bg-[#3f625a]"
                    disabled={isSaving || isDeleting || !isDirty}
                    onClick={() => saveDefinition()}
                  >
                    {isSaving ? <Loader2 className="animate-spin" /> : <Save />}
                    Save
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="border-[#d7e4de] bg-white text-[#38564b]"
                    disabled={isSaving || isDeleting}
                    onClick={copyDefinitionAsTest}
                  >
                    <Copy />
                    Copy as test
                  </Button>
                  {definition.status === "draft" ? (
                    <Button
                      type="button"
                      className="bg-[#24453b] text-white hover:bg-[#17372e]"
                      disabled={isSaving || isDeleting}
                      onClick={() => saveDefinition("active")}
                    >
                      <Send />
                      Make live
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="ghost"
                    className="text-red-600 hover:bg-red-50 hover:text-red-700"
                    disabled={isSaving || isDeleting || isCreating}
                    onClick={deleteDefinition}
                    aria-label="Delete questionnaire"
                  >
                    {isDeleting ? <Loader2 className="animate-spin" /> : <Trash2 />}
                  </Button>
                </div>
              </div>

              {definition.status === "active" ? (
                <div className="mt-5 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-800">
                  <Check className="mt-1 h-4 w-4 shrink-0 text-emerald-600" />
                  <span>
                    This questionnaire is live. Changes you save will apply directly to this questionnaire.
                  </span>
                </div>
              ) : null}
            </section>

            <details className="rounded-2xl border border-white/80 bg-white p-5 shadow-sm sm:p-6" open={isCreating && !definition.pages.length}>
                <summary className="cursor-pointer text-sm font-semibold text-[#17372e]">Questionnaire settings · title, visa type and version</summary>
                <div className="mb-5 mt-4">
                  <p className="text-xs text-[#71857d]">Choose which visa applications use this questionnaire.</p>
                </div>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <div className="space-y-2 md:col-span-2">
                  <FieldLabel htmlFor="questionnaire-title">Title</FieldLabel>
                  <Input
                    id="questionnaire-title"
                    className={inputClassName}
                    value={definition.title}
                    onChange={(event) => updateDefinitionField("title", event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <FieldLabel htmlFor="questionnaire-version">Version</FieldLabel>
                  <Input
                    id="questionnaire-version"
                    className={inputClassName}
                    value={definition.version}
                    onChange={(event) => updateDefinitionField("version", event.target.value)}
                  />
                </div>
                {!embeddedInMatter ? (
                  <div className="space-y-2 md:col-span-2">
                    <FieldLabel htmlFor="questionnaire-id" hint="machine key">
                      ID
                    </FieldLabel>
                    <Input
                      id="questionnaire-id"
                      className={`${inputClassName} font-mono`}
                      value={definition.id}
                      disabled={!isCreating || machineKeysLocked}
                      onChange={(event) => {
                        updateDefinitionField("id", event.target.value);
                        setSelectedId(event.target.value);
                      }}
                    />
                  </div>
                ) : null}
                <div className="space-y-2">
                  <FieldLabel htmlFor="questionnaire-visa-type">Visa type</FieldLabel>
                  <select
                    id="questionnaire-visa-type"
                    className={selectClassName}
                    value={definition.visaType}
                    disabled={machineKeysLocked}
                    onChange={(event) => {
                      const visaType = event.target.value;
                      setDefinition((current) => {
                        const next = { ...current, visaType };
                        if (visaType !== "temporary-work") {
                          next.visaContexts = [];
                          delete next.visaContext;
                        }
                        return next;
                      });
                    }}
                  >
                    <option value="temporary-work">Temporary work (482 / 186)</option>
                    <option value="partner">Partner Visa (Subclass 820)</option>
                    <option value="protection">Protection Visa (Subclass 866)</option>
                  </select>
                </div>
                <div className="space-y-2 md:col-span-2 xl:col-span-3">
                  <FieldLabel htmlFor="questionnaire-contexts" hint="comma separated">
                    Visa contexts
                  </FieldLabel>
                  <Input
                    id="questionnaire-contexts"
                    className={inputClassName}
                    value={definition.visaContexts.join(", ")}
                    disabled={machineKeysLocked || definition.visaType !== "temporary-work"}
                    placeholder="482, 186"
                    onChange={(event) =>
                      updateDefinitionField(
                        "visaContexts",
                        event.target.value.split(",").map((value) => value.trim()).filter(Boolean)
                      )
                    }
                  />
                </div>
                </div>
            </details>

            <section className="overflow-hidden rounded-2xl border border-white/80 bg-white shadow-sm">
              <div className="grid lg:grid-cols-[230px_minmax(0,1fr)]">
                <aside className="border-b border-[#e1e9e5] bg-[#f8fbf9] lg:border-b-0 lg:border-r">
                  <div className="flex items-center justify-between border-b border-[#e1e9e5] px-4 py-4">
                    <div>
                      <h3 className="font-semibold text-[#17372e]">Pages</h3>
                      <p className="text-xs text-[#71857d]">{definition.pages.length} total</p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={isBusy}
                      onClick={addPage}
                      aria-label="Add page"
                      title="Add page"
                    >
                      <Plus />
                    </Button>
                  </div>
                  <div className="flex gap-2 overflow-x-auto p-3 lg:block lg:max-h-[760px] lg:space-y-2 lg:overflow-y-auto">
                    {definition.pages.map((page, index) => (
                      <button
                        key={`${page.id}-${index}`}
                        type="button"
                        onClick={() => {
                          setActivePageId(page.id);
                          setActiveQuestionId(page.questions?.[0]?.id || "");
                        }}
                        className={`min-w-[190px] cursor-pointer rounded-lg border px-3 py-3 text-left transition hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4F726B] focus-visible:ring-offset-2 lg:w-full lg:min-w-0 ${
                          page.id === activePageId
                            ? "border-[#8ac6ad] bg-white shadow-sm hover:border-[#4F726B] hover:bg-[#f0f8f3]"
                            : "border-transparent hover:border-[#8ac6ad] hover:bg-white"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-semibold text-[#24453b]">{page.title}</span>
                          <ChevronRight className="h-4 w-4 shrink-0 text-[#8aa099]" />
                        </div>
                        <p className="mt-1 text-[11px] text-[#71857d]">{page.metadata?.profileRole ? `${({ main_applicant: "Main Applicant", spouse: "Spouse/Partner", child: "Child", non_migrating: "Other Family" })[page.metadata.profileRole] || page.metadata.profileRole} · ` : ""}{countQuestions(page.questions)} questions</p>
                      </button>
                    ))}
                    {!definition.pages.length ? (
                      <p className="px-2 py-8 text-center text-xs leading-5 text-[#71857d]">
                        No pages yet. Add one to start building.
                      </p>
                    ) : null}
                  </div>
                </aside>

                <div className="min-w-0 p-5 sm:p-6">
                  {!activePage ? (
                    <div className="flex min-h-[360px] flex-col items-center justify-center text-center">
                      <FileJson className="h-10 w-10 text-[#9fb4ac]" />
                      <h3 className="mt-4 font-semibold text-[#17372e]">
                        {embeddedInMatter ? "No pages available" : "Add a questionnaire page"}
                      </h3>
                      <p className="mt-1 text-sm text-[#71857d]">
                        {embeddedInMatter ? "This questionnaire does not have any pages to edit." : "Pages group related questions and control where answers are stored."}
                      </p>
                      <Button
                        type="button"
                        className="mt-4 bg-[#4F726B] text-white"
                        disabled={isBusy}
                        onClick={addPage}
                      >
                        <Plus />
                        Add page
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#edf1ef] pb-4">
                        <div>
                          <h3 className="font-semibold text-[#17372e]">Page details</h3>
                          <p className="text-xs text-[#71857d]">Order {activePageIndex + 1} of {definition.pages.length}</p>
                        </div>
                        <div className="flex gap-1">
                          <Button type="button" variant="ghost" size="icon" disabled={isBusy || activePageIndex === 0} onClick={() => movePage(-1)} aria-label="Move page up">
                            <ArrowUp />
                          </Button>
                          <Button type="button" variant="ghost" size="icon" disabled={isBusy || activePageIndex === definition.pages.length - 1} onClick={() => movePage(1)} aria-label="Move page down">
                            <ArrowDown />
                          </Button>
                          <Button type="button" variant="ghost" size="icon" className="text-red-600 hover:bg-red-50" disabled={isBusy} onClick={deletePage} aria-label="Delete page">
                            <Trash2 />
                          </Button>
                        </div>
                      </div>

                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2 md:col-span-2">
                          <FieldLabel htmlFor="page-title">Page title</FieldLabel>
                          <Input id="page-title" className={inputClassName} value={activePage.title} onChange={(event) => updatePageField("title", event.target.value)} />
                        </div>
                        {!embeddedInMatter ? (
                          <>
                            <div className="space-y-2">
                              <FieldLabel htmlFor="page-id" hint="machine key">Page ID</FieldLabel>
                              <Input id="page-id" className={`${inputClassName} font-mono`} value={activePage.id} disabled={machineKeysLocked} onChange={(event) => updatePageField("id", event.target.value)} />
                            </div>
                            <div className="space-y-2 md:col-span-2">
                              <FieldLabel htmlFor="page-route" hint="must already exist in the client portal">Client route</FieldLabel>
                              <Input
                                id="page-route"
                                list="registered-questionnaire-routes"
                                className={`${inputClassName} font-mono`}
                                value={activePage.route}
                                disabled={machineKeysLocked}
                                placeholder="/intake/temporary-work/all-applicants/character"
                                onChange={(event) => {
                                  const route = event.target.value;
                                  updateActivePage((page) => ({
                                    ...page,
                                    route,
                                    completionKey: route.replace(/^\/intake\//, ""),
                                    scope: getRouteScope(route),
                                  }));
                                }}
                              />
                              <datalist id="registered-questionnaire-routes">
                                {registeredRoutes.map((route) => (
                                  <option key={route.href} value={route.href}>{route.title}</option>
                                ))}
                              </datalist>
                              <p className="text-xs leading-5 text-[#71857d]">
                                Choose a registered route to replace that page with this JSON definition. A brand-new URL still requires a client release.
                              </p>
                            </div>
                            <div className="space-y-2">
                              <FieldLabel htmlFor="page-section" hint="answer storage key">Section key</FieldLabel>
                              <Input id="page-section" className={`${inputClassName} font-mono`} value={activePage.sectionKey} disabled={machineKeysLocked} onChange={(event) => updatePageField("sectionKey", event.target.value)} />
                            </div>
                            <div className="space-y-2">
                              <FieldLabel htmlFor="page-completion" hint="progress key">Completion key</FieldLabel>
                              <Input id="page-completion" className={`${inputClassName} font-mono`} value={activePage.completionKey} disabled />
                            </div>
                            <div className="space-y-2">
                              <FieldLabel htmlFor="page-scope">Answer scope</FieldLabel>
                              <select id="page-scope" className={selectClassName} value={activePage.scope} disabled={machineKeysLocked} onChange={(event) => updatePageField("scope", event.target.value)}>
                                <option value="shared">Shared / application</option>
                                <option value="profile">Per applicant profile</option>
                              </select>
                            </div>
                          </>
                        ) : null}
                        <div className="space-y-2 md:col-span-2">
                          <FieldLabel htmlFor="page-intro" hint="first paragraph">Intro text</FieldLabel>
                          <Textarea id="page-intro" rows={3} className="border-[#d7e4de] bg-white" disabled={legacyPage && !activePage.metadata.originalIntroBlocks?.length} value={getIntroText(activePage)} onChange={(event) => updateActivePage((page) => setIntroText(page, event.target.value))} />
                          {!embeddedInMatter && activePage.introBlocks?.some((block) => block.type !== "paragraph") ? (
                            <p className="text-xs text-[#71857d]">Lists and additional intro blocks are preserved and can be edited in Advanced JSON.</p>
                          ) : null}
                        </div>
                      </div>

                      <div className="border-t border-[#edf1ef] pt-6">
                        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <h3 className="font-semibold text-[#17372e]">Questions</h3>
                            <p className="text-xs text-[#71857d]">
                              {embeddedInMatter ? "Choose a question to edit its wording, choices, and display rules." : "Choose a question to edit its text and behavior."}
                            </p>
                          </div>
                          <Button type="button" variant="outline" className="border-[#d7e4de] bg-white text-[#38564b]" disabled={isBusy} onClick={addQuestion}>
                            <Plus />
                            Add question
                          </Button>
                        </div>

                        <div className="grid gap-4 xl:grid-cols-[220px_minmax(0,1fr)]">
                          <div className="space-y-2 rounded-xl border border-[#e1e9e5] bg-[#f8fbf9] p-2">
                            {activePage.questions.map((question, index) => (
                              <button
                                key={`${question.id}-${index}`}
                                type="button"
                                onClick={() => setActiveQuestionId(question.id)}
                                className={`w-full cursor-pointer rounded-lg border p-3 text-left transition hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4F726B] focus-visible:ring-offset-2 ${
                                  question.id === activeQuestionId
                                    ? "border-[#8ac6ad] bg-white shadow-sm hover:border-[#4F726B] hover:bg-[#f0f8f3]"
                                    : "border-transparent hover:border-[#8ac6ad] hover:bg-white"
                                }`}
                              >
                                {embeddedInMatter ? (
                                  <>
                                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#70877e]">Question {index + 1}</p>
                                    <p className="mt-1 line-clamp-2 text-xs font-semibold leading-5 text-[#24453b]">{question.label}</p>
                                  </>
                                ) : (
                                  <>
                                    <p className="line-clamp-2 text-xs font-semibold leading-5 text-[#24453b]">{question.label}</p>
                                    <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-[#71857d]">
                                      <span>{question.type}</span>
                                      {question.followUps?.length ? <span>+{question.followUps.length} follow-up</span> : null}
                                    </div>
                                  </>
                                )}
                              </button>
                            ))}
                            {!activePage.questions.length ? (
                              <p className="px-3 py-8 text-center text-xs leading-5 text-[#71857d]">No questions on this page.</p>
                            ) : null}
                          </div>

                          {!activeQuestion ? (
                            <div className="flex min-h-[280px] items-center justify-center rounded-xl border border-dashed border-[#cbdad3] px-6 text-center text-sm text-[#71857d]">
                              {embeddedInMatter ? "Select a question to edit its wording." : "Add or select a question to edit it."}
                            </div>
                          ) : (
                            <div className="space-y-5 rounded-xl border border-[#e1e9e5] p-4 sm:p-5">
                              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#edf1ef] pb-4">
                                <div>
                                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#70877e]">Question {activeQuestionIndex + 1}</p>
                                  {!embeddedInMatter ? (
                                    <p className="mt-1 font-mono text-xs text-[#60786f]">{activeQuestion.answerKey}</p>
                                  ) : null}
                                </div>
                                <div className="flex gap-1">
                                  <Button type="button" variant="ghost" size="icon" disabled={isBusy || activeQuestionIndex === 0} onClick={() => moveQuestion(-1)} aria-label="Move question up"><ArrowUp /></Button>
                                  <Button type="button" variant="ghost" size="icon" disabled={isBusy || activeQuestionIndex === activePage.questions.length - 1} onClick={() => moveQuestion(1)} aria-label="Move question down"><ArrowDown /></Button>
                                  <Button type="button" variant="ghost" size="icon" className="text-red-600 hover:bg-red-50" disabled={isBusy} onClick={deleteQuestion} aria-label="Delete question"><Trash2 /></Button>
                                </div>
                              </div>

                              <div className="grid gap-4 md:grid-cols-2">
                                <div className="space-y-2 md:col-span-2">
                                  <FieldLabel htmlFor="question-label">Question text</FieldLabel>
                                  <Textarea id="question-label" rows={3} className="border-[#d7e4de] bg-white" value={activeQuestion.label} onChange={(event) => updateQuestionField("label", event.target.value)} />
                                </div>
                                {!embeddedInMatter ? (
                                  <>
                                    <div className="space-y-2">
                                      <FieldLabel htmlFor="question-id" hint="machine key">Question ID</FieldLabel>
                                      <Input id="question-id" className={`${inputClassName} font-mono`} value={activeQuestion.id} disabled={machineKeysLocked} onChange={(event) => updateQuestionField("id", event.target.value)} />
                                    </div>
                                    <div className="space-y-2">
                                      <FieldLabel htmlFor="question-key" hint="saved answer key">Answer key</FieldLabel>
                                      <Input id="question-key" className={`${inputClassName} font-mono`} value={activeQuestion.answerKey} disabled={machineKeysLocked} onChange={(event) => updateQuestionField("answerKey", event.target.value)} />
                                    </div>
                                  </>
                                ) : null}
                                <div className="space-y-2">
                                  <FieldLabel htmlFor="question-type">Question type</FieldLabel>
                                  <select id="question-type" className={selectClassName} value={activeQuestion.type} disabled={isBusy} onChange={(event) => changeQuestionType(event.target.value)}>
                                    {QUESTION_TYPES.map(([value, label]) => <option key={value} value={value} disabled={value === "repeater"}>{label}</option>)}
                                  </select>
                                  {activeQuestion.type === "repeater" ? (
                                    <p className="text-xs text-[#71857d]">Records preserve their existing fields and saved values. Edit the wording of their fields below.</p>
                                  ) : null}
                                </div>
                                <label className="flex h-10 items-center gap-3 self-end rounded-md border border-[#d7e4de] bg-[#f8fbf9] px-3 text-sm font-medium text-[#224238]">
                                  <input type="checkbox" className="h-4 w-4 accent-[#4F726B]" checked={activeQuestion.required} disabled={isBusy} onChange={(event) => updateQuestionField("required", event.target.checked)} />
                                  Required answer
                                </label>
                                <div className="space-y-2 md:col-span-2">
                                  <FieldLabel htmlFor="question-description">Help text</FieldLabel>
                                  <Textarea id="question-description" rows={2} className="border-[#d7e4de] bg-white" value={activeQuestion.description || ""} onChange={(event) => updateQuestionField("description", event.target.value)} />
                                </div>
                                <div className="space-y-2 md:col-span-2">
                                  <FieldLabel htmlFor="question-placeholder">Placeholder</FieldLabel>
                                  <Input id="question-placeholder" className={inputClassName} value={activeQuestion.placeholder || ""} onChange={(event) => updateQuestionField("placeholder", event.target.value)} />
                                </div>
                              </div>

                              <>
                                  {activeQuestion.metadata?.fields?.length ? <div className="space-y-4 rounded-xl border border-[#d9e6e0] bg-[#f8fbf9] p-4">
                                    <div><h4 className="text-sm font-semibold text-[#24453b]">Record field wording</h4><p className="text-xs text-[#71857d]">Edit the fields clients see inside each record. Their saved values and answer keys stay preserved.</p></div>
                                    {embeddedInMatter
                                      ? activeQuestion.metadata.fields.map((field) => (
                                          <EmbeddedNestedQuestionEditor
                                            key={field.id}
                                            question={field}
                                            kind="record"
                                            legacy={legacyPage}
                                            sourceQuestions={flattenQuestions(activeQuestion.metadata.fields)}
                                            onUpdate={updateNestedQuestion}
                                            onDeleteOption={deleteNestedOption}
                                          />
                                        ))
                                      : <RecordFieldWording fields={activeQuestion.metadata.fields} onChange={updateRecordFieldText} legacy={legacyPage} />}
                                  </div> : null}

                                  {activeQuestion.followUps?.length ? (
                                <div className="space-y-4 rounded-xl border border-[#d9e6e0] bg-[#f8fbf9] p-4">
                                  <div>
                                    <h4 className="text-sm font-semibold text-[#24453b]">Follow-up wording</h4>
                                    <p className="text-xs text-[#71857d]">Edit the wording clients see when a follow-up question appears.</p>
                                  </div>
                                  {embeddedInMatter ? activeQuestion.followUps.map((question) => (
                                    <EmbeddedNestedQuestionEditor
                                      key={question.id}
                                      question={question}
                                      kind="follow-up"
                                      legacy={legacyPage}
                                      sourceQuestions={pageQuestions}
                                      onUpdate={updateNestedQuestion}
                                      onDeleteOption={deleteNestedOption}
                                    />
                                  )) : flattenFollowUps(activeQuestion.followUps).map(({ question, depth }) => (
                                    <div key={question.id} className="space-y-3 border-l-2 border-[#b9d6ca] pl-4" style={{ marginLeft: `${Math.min(depth - 1, 3) * 12}px` }}>
                                      <p className="font-mono text-[11px] text-[#71857d]">{question.answerKey}</p>
                                      <div className="space-y-2">
                                        <FieldLabel htmlFor={`follow-up-${question.id}-label`}>Question text</FieldLabel>
                                        <Textarea
                                          id={`follow-up-${question.id}-label`}
                                          rows={2}
                                          className="border-[#d7e4de] bg-white"
                                          value={question.label || ""}
                                          onChange={(event) => updateFollowUpText(question.id, "label", event.target.value)}
                                        />
                                      </div>
                                      <div className="grid gap-3 md:grid-cols-2">
                                        <div className="space-y-2">
                                          <FieldLabel htmlFor={`follow-up-${question.id}-description`}>Help text</FieldLabel>
                                          <Input
                                            id={`follow-up-${question.id}-description`}
                                            className={inputClassName}
                                            value={question.description || ""}
                                            onChange={(event) => updateFollowUpText(question.id, "description", event.target.value)}
                                          />
                                        </div>
                                        <div className="space-y-2">
                                          <FieldLabel htmlFor={`follow-up-${question.id}-placeholder`}>Placeholder</FieldLabel>
                                          <Input
                                            id={`follow-up-${question.id}-placeholder`}
                                            className={inputClassName}
                                            value={question.placeholder || ""}
                                            onChange={(event) => updateFollowUpText(question.id, "placeholder", event.target.value)}
                                          />
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                                  ) : null}

                                  {showOptions ? (
                                <div className="space-y-3 rounded-xl border border-[#e1e9e5] bg-[#f8fbf9] p-4">
                                  <div className="flex items-center justify-between gap-3">
                                    <div>
                                      <h4 className="text-sm font-semibold text-[#24453b]">Answer choices</h4>
                                      <p className="text-xs text-[#71857d]">Edit the option label clients see. Keep stored values stable so existing answers continue to match.</p>
                                    </div>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      disabled={activeQuestion.type === "yesNo" || isBusy}
                                      onClick={addOption}
                                    >
                                      <Plus />
                                      {embeddedInMatter ? "Add choice" : "Add"}
                                    </Button>
                                  </div>
                                  <div className="space-y-2">
                                    {activeQuestionOptions.map((option, optionIndex) => (
                                      <div
                                        key={`${option.value}-${optionIndex}`}
                                        className={embeddedInMatter
                                          ? "grid gap-2 sm:grid-cols-[minmax(0,1fr)_36px]"
                                          : "grid gap-2 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)_36px]"}
                                      >
                                        {!embeddedInMatter ? (
                                          <Input className={`${inputClassName} font-mono`} aria-label={`Option ${optionIndex + 1} value`} value={option.value} disabled={isBusy || activeQuestion.type === "yesNo"} onChange={(event) => updateOption(optionIndex, "value", event.target.value)} />
                                        ) : null}
                                        <Input className={inputClassName} aria-label={`Option ${optionIndex + 1} label`} value={option.label} onChange={(event) => updateOption(optionIndex, "label", event.target.value)} />
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="icon"
                                          className="text-red-600 hover:bg-red-50"
                                          disabled={activeQuestion.type === "yesNo" || activeQuestionOptions.length <= 1 || isBusy}
                                          onClick={() => deleteOption(optionIndex)}
                                          aria-label={embeddedInMatter ? `Delete choice ${optionIndex + 1}` : `Delete option ${optionIndex + 1}`}
                                        >
                                          <Trash2 />
                                        </Button>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                                  ) : null}

                                  <div className="space-y-3 rounded-xl border border-[#e1e9e5] p-4">
                                    <label className="flex items-center gap-3 text-sm font-semibold text-[#24453b]">
                                      <input
                                        type="checkbox"
                                        className="h-4 w-4 accent-[#4F726B]"
                                        checked={Boolean(firstCondition)}
                                        disabled={isBusy || (!firstCondition && conditionSourceQuestions.length === 0)}
                                        onChange={(event) => toggleCondition(event.target.checked)}
                                      />
                                      Show this question conditionally
                                    </label>
                                    {firstCondition ? embeddedInMatter ? (
                                      <div className="grid gap-3 md:grid-cols-3">
                                        <div className="space-y-2">
                                          <FieldLabel htmlFor="condition-question">After this question</FieldLabel>
                                          <select
                                            id="condition-question"
                                            className={selectClassName}
                                            value={firstCondition.field || ""}
                                            onChange={(event) => updateConditionSource(event.target.value)}
                                          >
                                            <option value="" disabled>Select a question</option>
                                            {conditionSourceQuestions.map((question) => (
                                              <option key={question.id} value={question.answerKey}>{question.label}</option>
                                            ))}
                                          </select>
                                        </div>
                                        <div className="space-y-2">
                                          <FieldLabel htmlFor="condition-operator">Rule</FieldLabel>
                                          <select id="condition-operator" className={selectClassName} value={firstCondition.op || "equals"} onChange={(event) => updateCondition("op", event.target.value)}>
                                            {CONDITION_OPERATORS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                                          </select>
                                        </div>
                                        <div className="space-y-2">
                                          <FieldLabel htmlFor="condition-answer">Answer</FieldLabel>
                                          {["exists", "notExists"].includes(firstCondition.op) ? (
                                            <p id="condition-answer" className="flex h-10 items-center text-sm text-[#60786f]">No answer needs to be selected.</p>
                                          ) : conditionSourceOptions.length ? (
                                            <select
                                              id="condition-answer"
                                              className={selectClassName}
                                              multiple={["in", "notIn"].includes(firstCondition.op)}
                                              value={["in", "notIn"].includes(firstCondition.op)
                                                ? Array.isArray(firstCondition.value) ? firstCondition.value : [firstCondition.value].filter(Boolean)
                                                : firstCondition.value ?? ""}
                                              onChange={(event) => updateCondition(
                                                "value",
                                                ["in", "notIn"].includes(firstCondition.op)
                                                  ? Array.from(event.target.selectedOptions || []).map((option) => option.value)
                                                  : event.target.value
                                              )}
                                            >
                                              <option value="" disabled>Select an answer</option>
                                              {conditionSourceOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                                            </select>
                                          ) : conditionSourceQuestion?.type === "checkbox" ? (
                                            <select
                                              id="condition-answer"
                                              className={selectClassName}
                                              value={checkboxConditionEditorValue}
                                              onChange={(event) => updateCondition(
                                                "value",
                                                ["in", "notIn"].includes(firstCondition.op)
                                                  ? event.target.value === "both" ? [true, false] : [event.target.value === "true"]
                                                  : event.target.value === "true"
                                              )}
                                            >
                                              <option value="true">Checked</option>
                                              <option value="false">Not checked</option>
                                              {["in", "notIn"].includes(firstCondition.op) ? <option value="both">Either answer</option> : null}
                                            </select>
                                          ) : (
                                            <Input
                                              id="condition-answer"
                                              className={inputClassName}
                                              value={conditionValue}
                                              onChange={(event) => updateCondition(
                                                "value",
                                                ["in", "notIn"].includes(firstCondition.op)
                                                  ? event.target.value.split(",").map((value) => value.trim())
                                                  : event.target.value
                                              )}
                                            />
                                          )}
                                        </div>
                                      </div>
                                    ) : (
                                      <div className="grid gap-3 md:grid-cols-3">
                                        <div className="space-y-2">
                                          <FieldLabel htmlFor="condition-field">Answer key</FieldLabel>
                                          <Input id="condition-field" list="question-answer-keys" className={`${inputClassName} font-mono`} value={firstCondition.field || ""} disabled={isBusy} onChange={(event) => updateCondition("field", event.target.value)} />
                                          <datalist id="question-answer-keys">
                                            {conditionSourceQuestions.map((question) => <option key={question.id} value={question.answerKey} />)}
                                          </datalist>
                                        </div>
                                        <div className="space-y-2">
                                          <FieldLabel htmlFor="condition-operator">Rule</FieldLabel>
                                          <select id="condition-operator" className={selectClassName} value={firstCondition.op || "equals"} disabled={isBusy} onChange={(event) => updateCondition("op", event.target.value)}>
                                            {CONDITION_OPERATORS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                                          </select>
                                        </div>
                                        <div className="space-y-2">
                                          <FieldLabel htmlFor="condition-value" hint={conditionSourceQuestion?.type === "checkbox" ? "boolean" : ["in", "notIn"].includes(firstCondition.op) ? "comma separated" : ""}>Value</FieldLabel>
                                          {conditionSourceQuestion?.type === "checkbox" ? (
                                            <select id="condition-value" className={selectClassName} value={checkboxConditionEditorValue} disabled={isBusy || ["exists", "notExists"].includes(firstCondition.op)} onChange={(event) => updateCondition("value", ["in", "notIn"].includes(firstCondition.op) ? event.target.value === "both" ? [true, false] : [event.target.value === "true"] : event.target.value === "true")}>
                                              <option value="" disabled>Select a boolean</option>
                                              <option value="true">True</option>
                                              <option value="false">False</option>
                                              {["in", "notIn"].includes(firstCondition.op) ? <option value="both">True or false</option> : null}
                                            </select>
                                          ) : (
                                            <Input id="condition-value" className={inputClassName} value={conditionValue} disabled={isBusy || ["exists", "notExists"].includes(firstCondition.op)} onChange={(event) => updateCondition("value", ["in", "notIn"].includes(firstCondition.op) ? event.target.value.split(",").map((value) => value.trim()) : event.target.value)} />
                                          )}
                                        </div>
                                      </div>
                                    ) : null}
                                    {activeQuestion.visibleIf?.length > 1 ? (
                                      <p className="text-xs text-amber-700">This question has additional display rules. They remain unchanged while you edit the first rule.</p>
                                    ) : null}
                                  </div>
                                  <QuestionCrmSyncPanel
                                    question={activeQuestion}
                                    disabled={isBusy}
                                    onChange={updateQuestionCrm}
                                  />
                                </>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </section>

            {!embeddedInMatter ? (
              <details
                className="group overflow-hidden rounded-2xl border border-white/80 bg-white shadow-sm"
                onToggle={(event) => {
                  if (event.currentTarget.open && !jsonHasPendingEdits) {
                    setJsonText(JSON.stringify(definition, null, 2));
                    setJsonError("");
                  }
                }}
              >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-5 sm:px-6">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#e8f4ee] text-[#4F726B]">
                    <Braces className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-[#17372e]">Advanced JSON</h3>
                    <p className="text-xs text-[#71857d]">Inspect or import the complete definition, including nested follow-ups.</p>
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 text-[#71857d] transition-transform group-open:rotate-90" />
              </summary>
              <div className="space-y-4 border-t border-[#e1e9e5] px-5 py-5 sm:px-6">
                {machineKeysLocked ? (
                  <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">Advanced JSON is read-only for this built-in page. Use the wording and option fields above to make the supported changes.</p>
                ) : null}
                <Textarea
                  value={jsonText}
                  onChange={(event) => {
                    setJsonText(event.target.value);
                    setJsonHasPendingEdits(true);
                    setJsonError("");
                  }}
                  readOnly={machineKeysLocked}
                  spellCheck={false}
                  aria-label="Questionnaire JSON"
                  className="min-h-[420px] border-[#d7e4de] bg-[#11221d] font-mono text-xs leading-5 text-[#d8eee5]"
                />
                {jsonError ? <p role="alert" className="text-sm text-red-600">{jsonError}</p> : null}
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" className="border-[#d7e4de] bg-white" disabled={machineKeysLocked || !jsonHasPendingEdits} onClick={applyJson}>
                    <Check />
                    Apply JSON
                  </Button>
                  {jsonHasPendingEdits ? (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        setJsonText(JSON.stringify(definition, null, 2));
                        setJsonHasPendingEdits(false);
                        setJsonError("");
                      }}
                    >
                      Discard JSON edits
                    </Button>
                  ) : null}
                  <label className={`inline-flex min-h-9 items-center justify-center gap-2 rounded-md border border-[#d7e4de] bg-white px-4 py-2 text-sm font-medium text-[#38564b] ${machineKeysLocked ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:bg-[#f8fbf9]"}`}>
                    <FileJson className="h-4 w-4" />
                    Import file
                    <input type="file" accept="application/json,.json" className="sr-only" disabled={machineKeysLocked} onChange={(event) => {
                      importJson(event.target.files?.[0]);
                      event.target.value = "";
                    }} />
                  </label>
                </div>
              </div>
              </details>
            ) : null}
          </fieldset>
        )}
      </div>
    </div>
  );
}
