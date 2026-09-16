export const QUESTIONNAIRE_DEFINITIONS_COLLECTION = "questionnaireDefinitions";
export const QUESTIONNAIRE_DEFINITION_REVISIONS_COLLECTION = "questionnaireDefinitionRevisions";
export const QUESTIONNAIRE_DEFINITION_SCHEMA_VERSION = 1;
export const QUESTIONNAIRE_DEFINITION_STATUSES = ["draft", "active", "archived"];
export const QUESTIONNAIRE_VISA_TYPES = ["temporary-work", "partner", "protection"];
export const QUESTIONNAIRE_QUESTION_TYPES = [
  "text",
  "textarea",
  "radio",
  "select",
  "checkbox",
  "dateParts",
  "yesNo",
  "repeater",
];
export const QUESTIONNAIRE_PAGE_SCOPES = ["shared", "profile"];
export const QUESTIONNAIRE_CONDITION_OPERATORS = [
  "equals",
  "notEquals",
  "in",
  "notIn",
  "exists",
  "notExists",
];

export const QUESTIONNAIRE_DEFINITION_LIMITS = Object.freeze({
  maxBytes: 900 * 1024,
  maxPages: 100,
  maxQuestionsPerPage: 200,
  maxQuestionDepth: 5,
  maxOptionsPerQuestion: 100,
  maxConditionsPerQuestion: 50,
  maxIntroBlocksPerPage: 50,
  maxIntroListItems: 100,
  maxVisaContexts: 20,
});

const MAX_ID_LENGTH = 128;
const MAX_KEY_LENGTH = 256;
const MAX_ROUTE_LENGTH = 300;
const MAX_SHORT_TEXT_LENGTH = 2_000;
const MAX_LONG_TEXT_LENGTH = 10_000;
const MAX_VERSION_LENGTH = 64;
const SAFE_DOCUMENT_ID = /^[A-Za-z0-9](?:[A-Za-z0-9_-]{0,126}[A-Za-z0-9])?$/;
const SAFE_NODE_ID = /^[A-Za-z0-9](?:[A-Za-z0-9_.:-]{0,126}[A-Za-z0-9])?$/;
const SAFE_DATA_KEY = /^[A-Za-z0-9](?:[A-Za-z0-9_-]{0,254}[A-Za-z0-9])?$/;
const SAFE_SLUG = /^[a-z0-9](?:[a-z0-9-]{0,126}[a-z0-9])?$/;
const SAFE_ROUTE_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const UNSAFE_OBJECT_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const TEMPORARY_WORK_VISA_CONTEXTS = new Set(["482", "186"]);
const RESERVED_WORKFLOW_ROUTE = /\/(?:start|profile|submit)$/;
const PROFILE_QUESTIONNAIRE_ROUTE = /^\/intake\/(?:temporary-work|partner|protection)\/(?:main-applicant|spouse-partner|children\/[^/]+|non-migrating\/[^/]+)\//;

const DEFINITION_FIELDS = new Set([
  "id",
  "visaType",
  "visaContext",
  "visaContexts",
  "title",
  "version",
  "status",
  "pages",
  "schemaVersion",
  "revision",
  "createdAt",
  "createdBy",
  "updatedAt",
  "updatedBy",
  "publishedAt",
  "publishedBy",
  "archivedAt",
  "archivedBy",
]);
const PAGE_FIELDS = new Set([
  "id",
  "route",
  "title",
  "sectionKey",
  "completionKey",
  "scope",
  "order",
  "introBlocks",
  "questions",
  "metadata",
]);
const QUESTION_FIELDS = new Set([
  "id",
  "answerKey",
  "label",
  "type",
  "required",
  "defaultValue",
  "description",
  "placeholder",
  "inputType",
  "rows",
  "options",
  "monthOptions",
  "optionsSource",
  "visibleIf",
  "clearWhenHidden",
  "followUps",
  "parts",
  "yearRange",
  "maxYear",
  "component",
  "metadata",
  "validation",
]);
const OPTION_FIELDS = new Set(["value", "label"]);
const CONDITION_FIELDS = new Set(["field", "op", "value"]);
const PART_FIELDS = new Set(["day", "month", "year"]);
const VALIDATION_FIELDS = new Set(["requiredMessage"]);

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function cleanText(value) {
  return typeof value === "string" ? value.trim() : value;
}

function pushUnknownFields(value, allowedFields, path, issues) {
  if (!isPlainObject(value)) return;
  for (const key of Object.keys(value)) {
    if (!allowedFields.has(key)) {
      issues.push(`${path}.${key} is not supported`);
    }
  }
}

function validateString(value, path, issues, { required = false, max = MAX_SHORT_TEXT_LENGTH, pattern } = {}) {
  if (value === undefined || value === null) {
    if (required) issues.push(`${path} is required`);
    return;
  }
  if (typeof value !== "string") {
    issues.push(`${path} must be a string`);
    return;
  }
  const normalized = value.trim();
  if (required && !normalized) issues.push(`${path} is required`);
  if (normalized.length > max) issues.push(`${path} must be ${max} characters or fewer`);
  if (normalized && pattern && !pattern.test(normalized)) issues.push(`${path} contains unsupported characters`);
}

function validateDataKey(value, path, issues, { required = false } = {}) {
  validateString(value, path, issues, {
    required,
    max: MAX_KEY_LENGTH,
    pattern: SAFE_DATA_KEY,
  });
  if (typeof value === "string" && UNSAFE_OBJECT_KEYS.has(value.trim().toLocaleLowerCase("en"))) {
    issues.push(`${path} is reserved and cannot be used as a storage key`);
  }
}

function validateBoolean(value, path, issues) {
  if (value !== undefined && typeof value !== "boolean") {
    issues.push(`${path} must be a boolean`);
  }
}

function validateFiniteNumber(value, path, issues, { integer = false, min, max } = {}) {
  if (value === undefined) return;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    issues.push(`${path} must be a finite number`);
    return;
  }
  if (integer && !Number.isInteger(value)) issues.push(`${path} must be an integer`);
  if (min !== undefined && value < min) issues.push(`${path} must be at least ${min}`);
  if (max !== undefined && value > max) issues.push(`${path} must be at most ${max}`);
}

function validateJsonValue(value, path, issues, depth = 0) {
  if (depth > 20) {
    issues.push(`${path} is nested too deeply`);
    return;
  }
  if (value === null || ["string", "boolean"].includes(typeof value)) return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) issues.push(`${path} must not contain a non-finite number`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => validateJsonValue(item, `${path}[${index}]`, issues, depth + 1));
    return;
  }
  if (!isPlainObject(value)) {
    issues.push(`${path} must contain only JSON values`);
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (UNSAFE_OBJECT_KEYS.has(key)) {
      issues.push(`${path}.${key} is not allowed`);
      continue;
    }
    validateJsonValue(child, `${path}.${key}`, issues, depth + 1);
  }
}

function validateOptions(options, path, issues) {
  if (options === undefined) return;
  if (!Array.isArray(options)) {
    issues.push(`${path} must be an array`);
    return;
  }
  if (options.length > QUESTIONNAIRE_DEFINITION_LIMITS.maxOptionsPerQuestion) {
    issues.push(`${path} cannot contain more than ${QUESTIONNAIRE_DEFINITION_LIMITS.maxOptionsPerQuestion} options`);
  }
  const seenValues = new Set();
  options.forEach((option, index) => {
    const optionPath = `${path}[${index}]`;
    if (!isPlainObject(option)) {
      issues.push(`${optionPath} must be an object`);
      return;
    }
    pushUnknownFields(option, OPTION_FIELDS, optionPath, issues);
    validateString(option.value, `${optionPath}.value`, issues, { required: true, max: MAX_KEY_LENGTH });
    validateString(option.label, `${optionPath}.label`, issues, { required: true, max: MAX_SHORT_TEXT_LENGTH });
    if (typeof option.value === "string" && option.value.trim()) {
      const key = option.value.trim().toLocaleLowerCase("en");
      if (seenValues.has(key)) issues.push(`${optionPath}.value "${key}" is duplicated`);
      seenValues.add(key);
    }
  });
}

function validateConditions(conditions, path, issues) {
  if (conditions === undefined) return;
  if (!Array.isArray(conditions)) {
    issues.push(`${path} must be an array`);
    return;
  }
  if (conditions.length > QUESTIONNAIRE_DEFINITION_LIMITS.maxConditionsPerQuestion) {
    issues.push(`${path} cannot contain more than ${QUESTIONNAIRE_DEFINITION_LIMITS.maxConditionsPerQuestion} conditions`);
  }
  conditions.forEach((condition, index) => {
    const conditionPath = `${path}[${index}]`;
    if (!isPlainObject(condition)) {
      issues.push(`${conditionPath} must be an object`);
      return;
    }
    pushUnknownFields(condition, CONDITION_FIELDS, conditionPath, issues);
    validateDataKey(condition.field, `${conditionPath}.field`, issues, { required: true });
    if (!QUESTIONNAIRE_CONDITION_OPERATORS.includes(condition.op)) {
      issues.push(`${conditionPath}.op is unsupported`);
      return;
    }
    if (["in", "notIn"].includes(condition.op)) {
      if (!Array.isArray(condition.value)) {
        issues.push(`${conditionPath}.value must be an array for ${condition.op}`);
      } else {
        if (condition.value.length > QUESTIONNAIRE_DEFINITION_LIMITS.maxOptionsPerQuestion) {
          issues.push(`${conditionPath}.value cannot contain more than ${QUESTIONNAIRE_DEFINITION_LIMITS.maxOptionsPerQuestion} items`);
        }
        condition.value.forEach((item, itemIndex) => {
          if (item !== null && !["string", "number", "boolean"].includes(typeof item)) {
            issues.push(`${conditionPath}.value[${itemIndex}] must be a scalar JSON value`);
          }
        });
      }
    } else if (!["exists", "notExists"].includes(condition.op)) {
      if (!hasOwn(condition, "value")) {
        issues.push(`${conditionPath}.value is required for ${condition.op}`);
      } else if (
        condition.value !== null &&
        !["string", "number", "boolean"].includes(typeof condition.value)
      ) {
        issues.push(`${conditionPath}.value must be a scalar JSON value`);
      }
    }
  });
}

function reserveScopedStorageKey(value, path, state, answerKeyScope, issues) {
  if (typeof value !== "string" || !value.trim()) return;

  const storageKey = value.trim();
  const scopedStorageKeys = state.seenStorageKeysByScope.get(answerKeyScope) || new Set();
  if (scopedStorageKeys.has(storageKey)) {
    issues.push(`${path} storage key "${storageKey}" is duplicated within ${answerKeyScope}`);
  }
  scopedStorageKeys.add(storageKey);
  state.seenStorageKeysByScope.set(answerKeyScope, scopedStorageKeys);
}

function validateQuestion(question, path, state, answerKeyScope, issues, depth) {
  if (!isPlainObject(question)) {
    issues.push(`${path} must be an object`);
    return;
  }
  state.count += 1;
  if (depth > QUESTIONNAIRE_DEFINITION_LIMITS.maxQuestionDepth) {
    issues.push(`${path} exceeds the maximum follow-up depth of ${QUESTIONNAIRE_DEFINITION_LIMITS.maxQuestionDepth}`);
  }
  pushUnknownFields(question, QUESTION_FIELDS, path, issues);
  validateString(question.id, `${path}.id`, issues, {
    required: true,
    max: MAX_ID_LENGTH,
    pattern: SAFE_NODE_ID,
  });
  validateDataKey(question.answerKey, `${path}.answerKey`, issues, { required: true });
  validateString(question.label, `${path}.label`, issues, { required: true, max: MAX_SHORT_TEXT_LENGTH });
  if (!QUESTIONNAIRE_QUESTION_TYPES.includes(question.type)) {
    issues.push(`${path}.type "${String(question.type)}" is unsupported`);
  }
  if (question.type === "repeater" && state.definitionStatus === "active" &&
      !(Array.isArray(question.metadata?.fields) && question.metadata.fields.length)) {
    issues.push(`${path}.type repeater requires a developer component and cannot be published from the global builder`);
  }

  if (typeof question.id === "string" && question.id.trim()) {
    const id = question.id.trim();
    if (state.seenQuestionIds.has(id)) issues.push(`${path}.id "${id}" is duplicated`);
    state.seenQuestionIds.add(id);
  }
  if (typeof question.answerKey === "string" && question.answerKey.trim()) {
    reserveScopedStorageKey(question.answerKey, `${path}.answerKey`, state, answerKeyScope, issues);
  }

  validateString(question.description, `${path}.description`, issues, { max: MAX_LONG_TEXT_LENGTH });
  validateString(question.placeholder, `${path}.placeholder`, issues, { max: MAX_SHORT_TEXT_LENGTH });
  validateString(question.inputType, `${path}.inputType`, issues, { max: 64, pattern: SAFE_NODE_ID });
  validateString(question.component, `${path}.component`, issues, { max: MAX_ID_LENGTH, pattern: SAFE_NODE_ID });
  validateBoolean(question.required, `${path}.required`, issues);
  validateBoolean(question.clearWhenHidden, `${path}.clearWhenHidden`, issues);
  validateFiniteNumber(question.rows, `${path}.rows`, issues, { integer: true, min: 1, max: 50 });
  validateFiniteNumber(question.yearRange, `${path}.yearRange`, issues, { integer: true, min: 1, max: 300 });
  validateFiniteNumber(question.maxYear, `${path}.maxYear`, issues, { integer: true, min: -10_000, max: 10_000 });

  validateOptions(question.options, `${path}.options`, issues);
  validateOptions(question.monthOptions, `${path}.monthOptions`, issues);
  if (question.optionsSource !== undefined && question.optionsSource !== "applicants") {
    issues.push(`${path}.optionsSource is unsupported`);
  }
  if (["radio", "select"].includes(question.type)) {
    const hasOptions = Array.isArray(question.options) && question.options.length > 0;
    if (!hasOptions && question.optionsSource !== "applicants") {
      issues.push(`${path} requires options or optionsSource`);
    }
  }
  if (question.type === "yesNo" && Array.isArray(question.options)) {
    const optionValues = question.options.map((option) => option?.value).sort();
    if (
      optionValues.length !== 2 ||
      optionValues[0] !== "no" ||
      optionValues[1] !== "yes"
    ) {
      issues.push(`${path}.options for yesNo must contain exactly the values "yes" and "no"`);
    }
  }

  validateConditions(question.visibleIf, `${path}.visibleIf`, issues);
  if (hasOwn(question, "defaultValue")) {
    validateJsonValue(question.defaultValue, `${path}.defaultValue`, issues);
  }
  if (hasOwn(question, "metadata")) {
    if (!isPlainObject(question.metadata)) issues.push(`${path}.metadata must be an object`);
    else validateJsonValue(question.metadata, `${path}.metadata`, issues);
  }
  if (question.metadata?.fields !== undefined) {
    if (question.type !== "repeater") {
      issues.push(`${path}.metadata.fields is only supported for repeater questions`);
    } else if (!Array.isArray(question.metadata.fields) || question.metadata.fields.length === 0) {
      issues.push(`${path}.metadata.fields must contain row questions`);
    } else {
      if (question.metadata.collection !== undefined && !["array", "object"].includes(question.metadata.collection)) {
        issues.push(`${path}.metadata.collection must be "array" or "object"`);
      }
      const rowScope = `${answerKeyScope}:${question.answerKey}`;
      question.metadata.fields.forEach((field, index) => {
        validateQuestion(field, `${path}.metadata.fields[${index}]`, state, rowScope, issues, depth + 1);
      });
      validatePageConditionReferences(question.metadata.fields, `${path}.metadata.fields`, issues);
    }
  }
  if (hasOwn(question, "validation")) {
    if (!isPlainObject(question.validation)) {
      issues.push(`${path}.validation must be an object`);
    } else {
      pushUnknownFields(question.validation, VALIDATION_FIELDS, `${path}.validation`, issues);
      validateString(question.validation.requiredMessage, `${path}.validation.requiredMessage`, issues, {
        max: MAX_SHORT_TEXT_LENGTH,
      });
    }
  }

  if (hasOwn(question, "parts")) {
    if (!isPlainObject(question.parts)) {
      issues.push(`${path}.parts must be an object`);
    } else {
      pushUnknownFields(question.parts, PART_FIELDS, `${path}.parts`, issues);
      const partNames = [];
      for (const part of PART_FIELDS) {
        validateDataKey(question.parts[part], `${path}.parts.${part}`, issues, { required: true });
        if (typeof question.parts[part] === "string" && question.parts[part].trim()) {
          partNames.push(question.parts[part].trim());
          if (question.type === "dateParts") {
            reserveScopedStorageKey(
              question.parts[part],
              `${path}.parts.${part}`,
              state,
              answerKeyScope,
              issues
            );
          }
        }
      }
      if (new Set(partNames).size !== partNames.length) {
        issues.push(`${path}.parts values must be unique`);
      }
    }
  } else if (
    question.type === "dateParts" &&
    typeof question.answerKey === "string" &&
    question.answerKey.trim()
  ) {
    for (const part of PART_FIELDS) {
      const generatedPartName = `${question.answerKey.trim()}_${part}`;
      const generatedPartPath = `${path}.parts.${part} (generated)`;
      validateDataKey(generatedPartName, generatedPartPath, issues, { required: true });
      reserveScopedStorageKey(
        generatedPartName,
        generatedPartPath,
        state,
        answerKeyScope,
        issues
      );
    }
  }

  if (question.followUps !== undefined) {
    if (!Array.isArray(question.followUps)) {
      issues.push(`${path}.followUps must be an array`);
    } else {
      question.followUps.forEach((followUp, index) => {
        validateQuestion(
          followUp,
          `${path}.followUps[${index}]`,
          state,
          answerKeyScope,
          issues,
          depth + 1
        );
      });
    }
  }
}

function collectPageQuestionEntries(questions, path, entries = []) {
  if (!Array.isArray(questions)) return entries;

  questions.forEach((question, index) => {
    const questionPath = `${path}[${index}]`;
    if (!isPlainObject(question)) return;

    entries.push({
      question,
      path: questionPath,
      answerKey: typeof question.answerKey === "string" ? question.answerKey.trim() : "",
    });
    collectPageQuestionEntries(question.followUps, `${questionPath}.followUps`, entries);
  });

  return entries;
}

function getStaticOptionValues(question) {
  if (
    !["radio", "select", "yesNo"].includes(question.type) ||
    question.optionsSource ||
    !Array.isArray(question.options) ||
    question.options.length === 0
  ) {
    return null;
  }

  const values = [];
  for (const option of question.options) {
    if (!isPlainObject(option) || typeof option.value !== "string" || !option.value.trim()) {
      return null;
    }
    values.push(option.value.trim());
  }
  return new Set(values);
}

function validateStaticConditionValues(condition, conditionPath, source, issues) {
  const optionValues = getStaticOptionValues(source.question);
  if (!optionValues) return;

  let values = [];
  if (["equals", "notEquals"].includes(condition.op)) {
    if (!hasOwn(condition, "value")) return;
    values = [{ value: condition.value, path: `${conditionPath}.value` }];
  } else if (["in", "notIn"].includes(condition.op)) {
    if (!Array.isArray(condition.value)) return;
    values = condition.value.map((value, index) => ({
      value,
      path: `${conditionPath}.value[${index}]`,
    }));
  }

  values.forEach(({ value, path }) => {
    if (!optionValues.has(value)) {
      const displayValue = typeof value === "string" ? JSON.stringify(value) : String(value);
      issues.push(
        `${path} ${displayValue} must match an option value from "${source.answerKey}"`
      );
    }
  });
}

function validatePageConditionReferences(questions, pagePath, issues) {
  const entries = collectPageQuestionEntries(questions, `${pagePath}.questions`);
  const entriesByAnswerKey = new Map();
  const dependencies = new Map(entries.map((entry) => [entry, []]));

  entries.forEach((entry) => {
    if (entry.answerKey && !entriesByAnswerKey.has(entry.answerKey)) {
      entriesByAnswerKey.set(entry.answerKey, entry);
    }
  });

  entries.forEach((target) => {
    if (!Array.isArray(target.question.visibleIf)) return;

    target.question.visibleIf.forEach((condition, conditionIndex) => {
      if (!isPlainObject(condition) || typeof condition.field !== "string") return;
      const conditionPath = `${target.path}.visibleIf[${conditionIndex}]`;
      const sourceKey = condition.field.trim();
      if (!sourceKey) return;

      const source = entriesByAnswerKey.get(sourceKey);
      if (!source) {
        issues.push(`${conditionPath}.field "${sourceKey}" must match an answerKey on the same page`);
        return;
      }

      validateStaticConditionValues(condition, conditionPath, source, issues);
      if (source === target) {
        issues.push(`${conditionPath}.field cannot reference its own question answerKey "${sourceKey}"`);
        return;
      }
      dependencies.get(target).push({ source, conditionPath });
    });
  });

  const states = new Map();
  function visit(entry) {
    states.set(entry, "visiting");
    for (const dependency of dependencies.get(entry) || []) {
      const sourceState = states.get(dependency.source);
      if (sourceState === "visiting") {
        issues.push(
          `${dependency.conditionPath}.field creates a conditional dependency cycle involving "${dependency.source.answerKey}"`
        );
      } else if (sourceState !== "visited") {
        visit(dependency.source);
      }
    }
    states.set(entry, "visited");
  }

  entries.forEach((entry) => {
    if (!states.has(entry)) visit(entry);
  });
}

function validateIntroBlocks(blocks, path, issues) {
  if (blocks === undefined) return;
  if (!Array.isArray(blocks)) {
    issues.push(`${path} must be an array`);
    return;
  }
  if (blocks.length > QUESTIONNAIRE_DEFINITION_LIMITS.maxIntroBlocksPerPage) {
    issues.push(`${path} cannot contain more than ${QUESTIONNAIRE_DEFINITION_LIMITS.maxIntroBlocksPerPage} blocks`);
  }
  blocks.forEach((block, index) => {
    const blockPath = `${path}[${index}]`;
    if (!isPlainObject(block)) {
      issues.push(`${blockPath} must be an object`);
      return;
    }
    if (block.type === "paragraph") {
      pushUnknownFields(block, new Set(["type", "text"]), blockPath, issues);
      validateString(block.text, `${blockPath}.text`, issues, { required: true, max: MAX_LONG_TEXT_LENGTH });
      return;
    }
    if (block.type === "list") {
      pushUnknownFields(block, new Set(["type", "lead", "items"]), blockPath, issues);
      validateString(block.lead, `${blockPath}.lead`, issues, { max: MAX_LONG_TEXT_LENGTH });
      if (!Array.isArray(block.items) || block.items.length === 0) {
        if (!Array.isArray(block.items)) {
          issues.push(`${blockPath}.items must be an array`);
          return;
        }
      } else {
        if (block.items.length > QUESTIONNAIRE_DEFINITION_LIMITS.maxIntroListItems) {
          issues.push(`${blockPath}.items cannot contain more than ${QUESTIONNAIRE_DEFINITION_LIMITS.maxIntroListItems} items`);
        }
        block.items.forEach((item, itemIndex) => {
          validateString(item, `${blockPath}.items[${itemIndex}]`, issues, {
            required: true,
            max: MAX_LONG_TEXT_LENGTH,
          });
        });
      }
      return;
    }
    issues.push(`${blockPath}.type is unsupported`);
  });
}

function validateRoute(route, path, issues) {
  validateString(route, path, issues, { required: true, max: MAX_ROUTE_LENGTH });
  if (typeof route !== "string" || !route.trim()) return;
  const value = route.trim();
  if (!value.startsWith("/intake/")) issues.push(`${path} must start with /intake/`);
  if (RESERVED_WORKFLOW_ROUTE.test(value)) {
    issues.push(`${path} targets a reserved start, profile, or submit workflow screen`);
  }
  if (/[?#\\%]/.test(value)) issues.push(`${path} cannot contain a query, hash, backslash, or encoded segment`);
  if (value.includes("//")) issues.push(`${path} cannot contain a double slash`);
  const segments = value.split("/").slice(1);
  if (segments.length < 2 || segments.some((segment) => !SAFE_ROUTE_SEGMENT.test(segment))) {
    issues.push(`${path} contains an unsafe path sequence`);
  }
}

function prepareDefinition(definition, { id } = {}) {
  if (!isPlainObject(definition)) return definition;
  const prepared = { ...definition };
  if (id !== undefined) prepared.id = id;
  if (!hasOwn(prepared, "schemaVersion")) prepared.schemaVersion = QUESTIONNAIRE_DEFINITION_SCHEMA_VERSION;
  if (!hasOwn(prepared, "revision")) prepared.revision = 0;
  if (!hasOwn(prepared, "status")) prepared.status = "draft";
  if (!hasOwn(prepared, "visaContexts")) {
    prepared.visaContexts = typeof prepared.visaContext === "string" && prepared.visaContext.trim()
      ? [prepared.visaContext]
      : [];
  }
  return prepared;
}

export class QuestionnaireDefinitionValidationError extends Error {
  constructor(issues) {
    super(`Invalid questionnaire definition: ${issues.join("; ")}`);
    this.name = "QuestionnaireDefinitionValidationError";
    this.issues = issues;
    this.status = 400;
  }
}

export function isSafeQuestionnaireDefinitionId(value) {
  return typeof value === "string" && SAFE_DOCUMENT_ID.test(value) && value !== "." && value !== "..";
}

export function slugifyQuestionnaireDefinitionId(value) {
  const slug = String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_ID_LENGTH)
    .replace(/-+$/g, "");
  return slug && SAFE_SLUG.test(slug) ? slug : "questionnaire-definition";
}

export function generateQuestionnaireDefinitionId(definition = {}, suffix = "") {
  const contexts = normalizeVisaContexts(definition.visaContexts, definition.visaContext);
  const parts = [
    definition.visaType,
    contexts.join("-"),
    definition.version ? `v${definition.version}` : "",
    suffix,
  ].filter(Boolean);
  return slugifyQuestionnaireDefinitionId(parts.join("-") || definition.title);
}

export function normalizeVisaContexts(visaContexts, legacyVisaContext) {
  const source = Array.isArray(visaContexts)
    ? visaContexts
    : typeof legacyVisaContext === "string" && legacyVisaContext.trim()
      ? [legacyVisaContext]
      : [];
  const seen = new Set();
  const normalized = [];
  for (const value of source) {
    if (typeof value !== "string") {
      normalized.push(value);
      continue;
    }
    const cleaned = value.trim();
    const key = cleaned.toLocaleLowerCase("en");
    if (!cleaned || seen.has(key)) continue;
    seen.add(key);
    normalized.push(cleaned);
  }
  return normalized;
}

export function visaContextsOverlap(left, right) {
  const leftContexts = normalizeVisaContexts(left?.visaContexts, left?.visaContext);
  const rightContexts = normalizeVisaContexts(right?.visaContexts, right?.visaContext);
  if (leftContexts.length === 0 || rightContexts.length === 0) return true;
  const rightSet = new Set(rightContexts.map((context) => String(context).toLocaleLowerCase("en")));
  return leftContexts.some((context) => rightSet.has(String(context).toLocaleLowerCase("en")));
}

export function getQuestionnaireDefinitionSizeBytes(definition) {
  try {
    return new TextEncoder().encode(JSON.stringify(definition)).byteLength;
  } catch {
    return Infinity;
  }
}

export function getQuestionnaireDefinitionIssues(input, options = {}) {
  const definition = prepareDefinition(input, options);
  const issues = [];
  if (!isPlainObject(definition)) return ["definition must be an object"];

  pushUnknownFields(definition, DEFINITION_FIELDS, "definition", issues);
  validateString(definition.id, "definition.id", issues, {
    required: true,
    max: MAX_ID_LENGTH,
    pattern: SAFE_DOCUMENT_ID,
  });
  validateString(definition.visaType, "definition.visaType", issues, {
    required: true,
    max: MAX_ID_LENGTH,
    pattern: SAFE_SLUG,
  });
  if (!QUESTIONNAIRE_VISA_TYPES.includes(definition.visaType)) {
    issues.push("definition.visaType is unsupported by the client portal");
  }
  validateString(definition.title, "definition.title", issues, { required: true, max: MAX_SHORT_TEXT_LENGTH });
  validateString(definition.version, "definition.version", issues, { required: true, max: MAX_VERSION_LENGTH });
  if (!QUESTIONNAIRE_DEFINITION_STATUSES.includes(definition.status)) {
    issues.push("definition.status is unsupported");
  }
  if (definition.schemaVersion !== QUESTIONNAIRE_DEFINITION_SCHEMA_VERSION) {
    issues.push(`definition.schemaVersion must be ${QUESTIONNAIRE_DEFINITION_SCHEMA_VERSION}`);
  }
  validateFiniteNumber(definition.revision, "definition.revision", issues, { integer: true, min: 0 });

  if (!Array.isArray(definition.visaContexts)) {
    issues.push("definition.visaContexts must be an array");
  } else {
    if (definition.visaContexts.length > QUESTIONNAIRE_DEFINITION_LIMITS.maxVisaContexts) {
      issues.push(`definition.visaContexts cannot contain more than ${QUESTIONNAIRE_DEFINITION_LIMITS.maxVisaContexts} entries`);
    }
    const seenContexts = new Set();
    definition.visaContexts.forEach((context, index) => {
      validateString(context, `definition.visaContexts[${index}]`, issues, {
        required: true,
        max: MAX_ID_LENGTH,
        pattern: SAFE_NODE_ID,
      });
      if (typeof context === "string" && context.trim()) {
        const key = context.trim().toLocaleLowerCase("en");
        if (seenContexts.has(key)) issues.push(`definition.visaContexts[${index}] "${key}" is duplicated`);
        seenContexts.add(key);
      }
    });
  }
  if (
    definition.visaType !== "temporary-work" &&
    Array.isArray(definition.visaContexts) &&
    definition.visaContexts.length > 0
  ) {
    issues.push("definition.visaContexts is only supported for temporary-work questionnaires");
  }
  if (definition.visaType === "temporary-work" && Array.isArray(definition.visaContexts)) {
    definition.visaContexts.forEach((context, index) => {
      if (
        typeof context === "string" &&
        context.trim() &&
        !TEMPORARY_WORK_VISA_CONTEXTS.has(context.trim())
      ) {
        issues.push(`definition.visaContexts[${index}] must be "482" or "186"`);
      }
    });
  }
  if (hasOwn(definition, "visaContext") && definition.visaContext !== undefined) {
    validateString(definition.visaContext, "definition.visaContext", issues, {
      max: MAX_ID_LENGTH,
      pattern: SAFE_NODE_ID,
    });
    if (
      typeof definition.visaContext === "string" &&
      definition.visaContext.trim() &&
      (!Array.isArray(definition.visaContexts) ||
        definition.visaContexts.length !== 1 ||
        definition.visaContexts[0] !== definition.visaContext.trim())
    ) {
      issues.push("definition.visaContext must match the sole visaContexts entry");
    }
  }

  if (!Array.isArray(definition.pages)) {
    issues.push("definition.pages must be an array");
  } else {
    if (definition.pages.length > QUESTIONNAIRE_DEFINITION_LIMITS.maxPages) {
      issues.push(`definition.pages cannot contain more than ${QUESTIONNAIRE_DEFINITION_LIMITS.maxPages} pages`);
    }
    if (definition.status === "active" && definition.pages.length === 0) {
      issues.push("an active definition must contain at least one page");
    }
    const seenPageIds = new Set();
    const seenRoutes = new Set();
    const globalQuestionState = {
      count: 0,
      definitionStatus: definition.status,
      seenQuestionIds: new Set(),
      seenStorageKeysByScope: new Map(),
    };
    definition.pages.forEach((page, pageIndex) => {
      const pagePath = `definition.pages[${pageIndex}]`;
      if (!isPlainObject(page)) {
        issues.push(`${pagePath} must be an object`);
        return;
      }
      pushUnknownFields(page, PAGE_FIELDS, pagePath, issues);
      validateString(page.id, `${pagePath}.id`, issues, {
        required: true,
        max: MAX_ID_LENGTH,
        pattern: SAFE_NODE_ID,
      });
      validateRoute(page.route, `${pagePath}.route`, issues);
      const expectedRoutePrefix = `/intake/${definition.visaType}/`;
      if (typeof page.route === "string" && !page.route.trim().startsWith(expectedRoutePrefix)) {
        issues.push(`${pagePath}.route must belong to the ${definition.visaType} questionnaire`);
      }
      validateString(page.title, `${pagePath}.title`, issues, {
        required: true,
        max: MAX_SHORT_TEXT_LENGTH,
      });
      validateDataKey(page.sectionKey, `${pagePath}.sectionKey`, issues, { required: true });
      validateString(page.completionKey, `${pagePath}.completionKey`, issues, { max: MAX_ROUTE_LENGTH });
      const expectedCompletionKey = typeof page.route === "string"
        ? page.route.trim().replace(/^\/intake\//, "")
        : "";
      if (
        typeof page.completionKey === "string" &&
        page.completionKey.trim() &&
        page.completionKey.trim() !== expectedCompletionKey
      ) {
        issues.push(`${pagePath}.completionKey must match its client route`);
      }
      if (page.scope !== undefined && !QUESTIONNAIRE_PAGE_SCOPES.includes(page.scope)) {
        issues.push(`${pagePath}.scope is unsupported`);
      }
      const routeNeedsProfile = typeof page.route === "string" && PROFILE_QUESTIONNAIRE_ROUTE.test(page.route.trim());
      if (routeNeedsProfile && page.scope !== "profile") {
        issues.push(`${pagePath}.scope must be "profile" for this client route`);
      }
      if (!routeNeedsProfile && page.scope === "profile") {
        issues.push(`${pagePath}.scope cannot be "profile" because this route has no applicant profile`);
      }
      validateFiniteNumber(page.order, `${pagePath}.order`, issues, { integer: true });
      validateIntroBlocks(page.introBlocks, `${pagePath}.introBlocks`, issues);
      if (hasOwn(page, "metadata")) {
        if (!isPlainObject(page.metadata)) issues.push(`${pagePath}.metadata must be an object`);
        else validateJsonValue(page.metadata, `${pagePath}.metadata`, issues);
      }

      for (const [value, seen, label] of [
        [page.id, seenPageIds, "id"],
        [page.route, seenRoutes, "route"],
      ]) {
        if (typeof value !== "string" || !value.trim()) continue;
        const key = value.trim();
        if (seen.has(key)) issues.push(`${pagePath}.${label} "${key}" is duplicated`);
        seen.add(key);
      }

      if (!Array.isArray(page.questions)) {
        issues.push(`${pagePath}.questions must be an array`);
        return;
      }
      const countBeforePage = globalQuestionState.count;
      const answerKeyScope = `${page.scope || "shared"}:${page.scope === "profile" ? `${page.metadata?.profileRole || ""}:` : ""}${
        typeof page.sectionKey === "string" ? page.sectionKey.trim() : ""
      }`;
      page.questions.forEach((question, questionIndex) => {
        validateQuestion(
          question,
          `${pagePath}.questions[${questionIndex}]`,
          globalQuestionState,
          answerKeyScope,
          issues,
          1
        );
      });
      validatePageConditionReferences(page.questions, pagePath, issues);
      const pageQuestionCount = globalQuestionState.count - countBeforePage;
      if (pageQuestionCount > QUESTIONNAIRE_DEFINITION_LIMITS.maxQuestionsPerPage) {
        issues.push(`${pagePath} cannot contain more than ${QUESTIONNAIRE_DEFINITION_LIMITS.maxQuestionsPerPage} questions including follow-ups`);
      }
      if (definition.status === "active" && pageQuestionCount === 0) {
        issues.push(`${pagePath} must contain at least one question when active`);
      }
    });
  }

  const size = getQuestionnaireDefinitionSizeBytes(definition);
  if (size > QUESTIONNAIRE_DEFINITION_LIMITS.maxBytes) {
    issues.push(`definition JSON is ${size} bytes; maximum is ${QUESTIONNAIRE_DEFINITION_LIMITS.maxBytes}`);
  }
  return issues;
}

function cloneJsonValue(value) {
  if (Array.isArray(value)) return value.map(cloneJsonValue);
  if (!isPlainObject(value)) return value;
  const copy = {};
  for (const [key, child] of Object.entries(value)) {
    if (!UNSAFE_OBJECT_KEYS.has(key)) copy[key] = cloneJsonValue(child);
  }
  return copy;
}

function canonicalOption(option) {
  return { value: option.value.trim(), label: option.label.trim() };
}

function canonicalQuestion(question) {
  const normalized = {
    id: question.id.trim(),
    answerKey: question.answerKey.trim(),
    label: question.label.trim(),
    type: question.type,
  };
  for (const field of ["description", "placeholder", "inputType", "component"]) {
    if (hasOwn(question, field)) normalized[field] = cleanText(question[field]);
  }
  for (const field of ["required", "clearWhenHidden", "rows", "yearRange", "maxYear", "defaultValue"]) {
    if (hasOwn(question, field)) normalized[field] = cloneJsonValue(question[field]);
  }
  if (question.options) normalized.options = question.options.map(canonicalOption);
  if (question.monthOptions) normalized.monthOptions = question.monthOptions.map(canonicalOption);
  if (question.optionsSource) normalized.optionsSource = question.optionsSource;
  if (question.visibleIf) {
    normalized.visibleIf = question.visibleIf.map((condition) => {
      const output = { field: condition.field.trim(), op: condition.op };
      if (hasOwn(condition, "value")) output.value = cloneJsonValue(condition.value);
      return output;
    });
  }
  if (question.parts) {
    normalized.parts = {
      day: question.parts.day.trim(),
      month: question.parts.month.trim(),
      year: question.parts.year.trim(),
    };
  }
  if (question.followUps) normalized.followUps = question.followUps.map(canonicalQuestion);
  if (question.metadata) normalized.metadata = cloneJsonValue(question.metadata);
  if (question.validation) {
    normalized.validation = {};
    if (hasOwn(question.validation, "requiredMessage")) {
      normalized.validation.requiredMessage = cleanText(question.validation.requiredMessage);
    }
  }
  return normalized;
}

function canonicalPage(page, index) {
  const normalized = {
    id: page.id.trim(),
    route: page.route.trim(),
    sectionKey: page.sectionKey.trim(),
    scope: page.scope || "shared",
    order: page.order ?? index * 10,
    completionKey: page.route.trim().replace(/^\/intake\//, ""),
    questions: page.questions.map(canonicalQuestion),
  };
  for (const field of ["title"]) {
    if (hasOwn(page, field)) normalized[field] = cleanText(page[field]);
  }
  if (page.introBlocks) {
    normalized.introBlocks = page.introBlocks.map((block) =>
      block.type === "list"
        ? {
            type: "list",
            ...(hasOwn(block, "lead") ? { lead: cleanText(block.lead) } : {}),
            items: block.items.map((item) => item.trim()),
          }
        : { type: "paragraph", text: block.text.trim() }
    );
  }
  if (page.metadata) normalized.metadata = cloneJsonValue(page.metadata);
  return normalized;
}

export function normalizeQuestionnaireDefinition(input, options = {}) {
  const prepared = prepareDefinition(input, options);
  const issues = getQuestionnaireDefinitionIssues(prepared);
  if (issues.length) throw new QuestionnaireDefinitionValidationError(issues);

  const visaContexts = normalizeVisaContexts(prepared.visaContexts, prepared.visaContext);
  const normalized = {
    id: prepared.id.trim(),
    visaType: prepared.visaType.trim(),
    visaContexts,
    title: prepared.title.trim(),
    version: prepared.version.trim(),
    status: prepared.status,
    schemaVersion: QUESTIONNAIRE_DEFINITION_SCHEMA_VERSION,
    revision: prepared.revision,
    pages: prepared.pages.map(canonicalPage),
  };
  if (visaContexts.length === 1) normalized.visaContext = visaContexts[0];
  return normalized;
}

export function mergeQuestionnaireDefinition(current, patch, options = {}) {
  if (!isPlainObject(patch)) {
    throw new QuestionnaireDefinitionValidationError(["definition patch must be an object"]);
  }
  const allowedPatchFields = new Set([
    "id",
    "visaType",
    "visaContext",
    "visaContexts",
    "title",
    "version",
    "status",
    "pages",
    "schemaVersion",
    "revision",
    "createdAt",
    "createdBy",
    "updatedAt",
    "updatedBy",
    "publishedAt",
    "publishedBy",
    "archivedAt",
    "archivedBy",
  ]);
  const unknown = Object.keys(patch).filter((key) => !allowedPatchFields.has(key));
  if (unknown.length) {
    throw new QuestionnaireDefinitionValidationError(
      unknown.map((key) => `definition.${key} is not supported`)
    );
  }

  const editableFields = ["visaType", "title", "version", "status", "pages", "schemaVersion"];
  const merged = { ...current, id: options.id || current.id };
  editableFields.forEach((field) => {
    if (hasOwn(patch, field)) merged[field] = patch[field];
  });
  if (hasOwn(patch, "visaContexts")) {
    merged.visaContexts = patch.visaContexts;
    delete merged.visaContext;
  } else if (hasOwn(patch, "visaContext")) {
    merged.visaContext = patch.visaContext;
    delete merged.visaContexts;
  }
  if (hasOwn(patch, "id") && patch.id !== merged.id) {
    throw new QuestionnaireDefinitionValidationError(["definition.id cannot be changed"]);
  }
  return normalizeQuestionnaireDefinition(merged, { id: merged.id });
}

/**
 * Questionnaire definitions are edited in place. Keep this validation step as
 * a named boundary for route handlers and backwards-compatible callers.
 */
export function assertQuestionnaireDefinitionStructureEditable(current, next, options = {}) {
  normalizeQuestionnaireDefinition(current, options);
  return normalizeQuestionnaireDefinition(next, options);
}

export function serializeFirestoreTimestamp(value) {
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value?.toDate === "function") return value.toDate().toISOString();
  if (typeof value === "object" && Number.isFinite(value.seconds)) {
    const milliseconds = value.seconds * 1000 + Math.floor((value.nanoseconds || 0) / 1_000_000);
    return new Date(milliseconds).toISOString();
  }
  return value;
}

function serializeValue(value) {
  const timestamp = serializeFirestoreTimestamp(value);
  if (timestamp !== value) return timestamp;
  if (Array.isArray(value)) return value.map(serializeValue);
  if (!isPlainObject(value)) return value;
  const serialized = {};
  for (const [key, child] of Object.entries(value)) serialized[key] = serializeValue(child);
  return serialized;
}

export function serializeQuestionnaireDefinitionDoc(doc, legacyPages) {
  const data = typeof doc?.data === "function" ? doc.data() || {} : doc || {};
  const id = doc?.id || data.id;
  const serialized = serializeValue(data);
  const visaContexts = normalizeVisaContexts(serialized.visaContexts, serialized.visaContext);
  const pages = Array.isArray(serialized.pages)
    ? serialized.pages
    : Array.isArray(legacyPages)
      ? legacyPages.map(serializeValue)
      : [];
  const output = {
    ...serialized,
    id,
    schemaVersion: Number.isInteger(serialized.schemaVersion)
      ? serialized.schemaVersion
      : QUESTIONNAIRE_DEFINITION_SCHEMA_VERSION,
    revision: Number.isInteger(serialized.revision) && serialized.revision >= 0
      ? serialized.revision
      : 0,
    visaContexts,
    pages: [...pages].sort((left, right) =>
      (Number(left?.order) || 0) - (Number(right?.order) || 0) ||
      String(left?.title || left?.id || "").localeCompare(String(right?.title || right?.id || ""))
    ),
  };
  if (visaContexts.length === 1) output.visaContext = visaContexts[0];
  else delete output.visaContext;
  return output;
}

export function sortQuestionnaireDefinitions(definitions) {
  return [...definitions].sort((left, right) => {
    const leftDate = Date.parse(left?.updatedAt || left?.createdAt || "") || 0;
    const rightDate = Date.parse(right?.updatedAt || right?.createdAt || "") || 0;
    if (leftDate !== rightDate) return rightDate - leftDate;
    return String(left?.title || left?.id || "").localeCompare(
      String(right?.title || right?.id || ""),
      undefined,
      { sensitivity: "base" }
    );
  });
}
