import {
  CRM_CLEAR_POLICIES,
  CRM_MAPPING_MODES,
  CRM_TARGETS,
  CRM_TRANSFORMS,
  SAFE_ZOHO_FIELD_API_NAME,
  compatibleTransformsFor,
  getCrmCatalogField,
  moduleForCrmTarget,
} from "./crmFieldCatalog.js";

const CRM_FIELDS = new Set([
  "mode",
  "target",
  "module",
  "fieldApiName",
  "transform",
  "clearPolicy",
  "optionMap",
  "required",
  "version",
]);

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

export function getQuestionnairePageProfileRole(page) {
  const metadataRole = typeof page?.metadata?.profileRole === "string" ? page.metadata.profileRole.trim() : "";
  if (metadataRole) return metadataRole === "main" ? "main_applicant" : metadataRole;
  const route = String(page?.route || "");
  if (route.includes("/non-migrating/")) return "non_migrating";
  if (route.includes("/children/")) return "child";
  if (route.includes("/spouse-partner/")) return "spouse";
  if (route.includes("/main-applicant/")) return "main_applicant";
  return "";
}

export function walkQuestionnaireQuestions(definition, visit) {
  (definition?.pages || []).forEach((page, pageIndex) => {
    const profileRole = getQuestionnairePageProfileRole(page);
    const walk = (questions, path, inRepeater) => {
      if (!Array.isArray(questions)) return;
      questions.forEach((question, index) => {
        const questionPath = `${path}[${index}]`;
        visit({
          question,
          path: questionPath,
          page,
          pageIndex,
          profileRole,
          inRepeater,
        });
        if (question?.followUps) walk(question.followUps, `${questionPath}.followUps`, inRepeater);
        if (question?.metadata?.fields) {
          walk(question.metadata.fields, `${questionPath}.metadata.fields`, true);
        }
      });
    };
    walk(page?.questions, `pages[${pageIndex}].questions`, false);
  });
}

export function normalizeCrmMapping(raw) {
  if (raw === undefined || raw === null) return null;
  if (!isPlainObject(raw)) return { invalid: true, reason: "crm must be an object" };
  const mode = isNonEmptyString(raw.mode) ? raw.mode.trim() : CRM_MAPPING_MODES.unconfigured;
  if (mode === CRM_MAPPING_MODES.unconfigured) {
    return { mode: CRM_MAPPING_MODES.unconfigured };
  }
  if (mode === CRM_MAPPING_MODES.portal_only || raw.target === CRM_TARGETS.portal_only) {
    const normalized = { mode: CRM_MAPPING_MODES.portal_only, target: CRM_TARGETS.portal_only };
    if (raw.required === true) normalized.required = true;
    return normalized;
  }
  if (mode !== CRM_MAPPING_MODES.field) {
    return { invalid: true, reason: `unsupported crm mode "${mode}"` };
  }
  const normalized = {
    mode: CRM_MAPPING_MODES.field,
    target: isNonEmptyString(raw.target) ? raw.target.trim() : "",
    module: isNonEmptyString(raw.module) ? raw.module.trim() : "",
    fieldApiName: isNonEmptyString(raw.fieldApiName) ? raw.fieldApiName.trim() : "",
    transform: isNonEmptyString(raw.transform) ? raw.transform.trim() : "",
    clearPolicy: isNonEmptyString(raw.clearPolicy)
      ? raw.clearPolicy.trim()
      : CRM_CLEAR_POLICIES.preserve_when_empty,
    optionMap: isPlainObject(raw.optionMap) ? { ...raw.optionMap } : {},
  };
  if (raw.required === true) normalized.required = true;
  if (Number.isInteger(raw.version) && raw.version > 0) normalized.version = raw.version;
  return normalized;
}

function destinationKey(mapping, profileRole) {
  if (mapping.target === CRM_TARGETS.profile_record) {
    return `${mapping.target}:${profileRole || ""}:${mapping.module}:${mapping.fieldApiName}`;
  }
  return `${mapping.target}:${mapping.module}:${mapping.fieldApiName}`;
}

export function validateQuestionCrmMapping(question, path, context, issues) {
  const raw = question?.metadata?.crm;
  if (raw === undefined) return null;
  if (!isPlainObject(raw)) {
    issues.push(`${path}.metadata.crm must be an object`);
    return null;
  }
  for (const key of Object.keys(raw)) {
    if (!CRM_FIELDS.has(key)) issues.push(`${path}.metadata.crm.${key} is not supported`);
  }

  const mapping = normalizeCrmMapping(raw);
  if (mapping?.invalid) {
    issues.push(`${path}.metadata.crm ${mapping.reason}`);
    return null;
  }
  if (!mapping || mapping.mode === CRM_MAPPING_MODES.unconfigured) {
    if (raw.required === true) {
      issues.push(`${path}.metadata.crm is required but not configured`);
    }
    return mapping;
  }
  if (mapping.mode === CRM_MAPPING_MODES.portal_only) return mapping;

  if (question?.type === "repeater" || context.inRepeater) {
    issues.push(`${path}.metadata.crm cannot use field mode on repeater questions or repeater fields`);
    return mapping;
  }
  if (!Object.values(CRM_TARGETS).includes(mapping.target) || mapping.target === CRM_TARGETS.portal_only) {
    issues.push(`${path}.metadata.crm.target is unsupported`);
    return mapping;
  }
  const expectedModule = moduleForCrmTarget(mapping.target);
  if (!expectedModule) {
    issues.push(`${path}.metadata.crm.target is unsupported`);
    return mapping;
  }
  if (mapping.module !== expectedModule) {
    issues.push(`${path}.metadata.crm.module must be "${expectedModule}" for target "${mapping.target}"`);
  }
  if (!SAFE_ZOHO_FIELD_API_NAME.test(mapping.fieldApiName)) {
    issues.push(`${path}.metadata.crm.fieldApiName is not a safe Zoho API name`);
    return mapping;
  }
  const catalogField = getCrmCatalogField(mapping.module, mapping.fieldApiName);
  if (!catalogField) {
    issues.push(`${path}.metadata.crm.fieldApiName is not in the approved CRM catalog`);
    return mapping;
  }
  if (!Object.values(CRM_TRANSFORMS).includes(mapping.transform)) {
    issues.push(`${path}.metadata.crm.transform is unsupported`);
    return mapping;
  }
  const compatible = compatibleTransformsFor(question.type, catalogField.type);
  if (!compatible.includes(mapping.transform)) {
    issues.push(
      `${path}.metadata.crm.transform "${mapping.transform}" is incompatible with ${question.type} → ${catalogField.type}`
    );
  }
  if (!Object.values(CRM_CLEAR_POLICIES).includes(mapping.clearPolicy)) {
    issues.push(`${path}.metadata.crm.clearPolicy is unsupported`);
  }
  if (mapping.transform === CRM_TRANSFORMS.picklist) {
    if (!isPlainObject(raw.optionMap) || Object.keys(mapping.optionMap).length === 0) {
      issues.push(`${path}.metadata.crm.optionMap is required for picklist transforms`);
    } else {
      for (const [portalValue, zohoValue] of Object.entries(mapping.optionMap)) {
        if (!isNonEmptyString(portalValue) || !isNonEmptyString(zohoValue)) {
          issues.push(`${path}.metadata.crm.optionMap values must be non-empty strings`);
          break;
        }
        if (
          Array.isArray(catalogField.picklistValues)
          && !catalogField.picklistValues.includes(zohoValue)
        ) {
          issues.push(
            `${path}.metadata.crm.optionMap["${portalValue}"] is not an allowed picklist value`
          );
        }
      }
    }
  }

  if (context.destinations instanceof Map) {
    const key = destinationKey(mapping, context.profileRole);
    const previous = context.destinations.get(key);
    if (previous && previous.questionId !== question.id) {
      issues.push(
        `${path}.metadata.crm destination ${mapping.module}.${mapping.fieldApiName} conflicts with ${previous.path}`
      );
    } else {
      context.destinations.set(key, { path, questionId: question.id });
    }
  }
  return mapping;
}

export function validateDefinitionCrmMappings(definition, issues) {
  const destinations = new Map();
  walkQuestionnaireQuestions(definition, ({ question, path, profileRole, inRepeater }) => {
    validateQuestionCrmMapping(
      question,
      path,
      {
        profileRole,
        inRepeater,
        destinations,
        definitionStatus: definition?.status,
      },
      issues,
    );
  });
}

export function getCrmCoverageSummary(definition) {
  const summary = { mapped: 0, portalOnly: 0, unconfigured: 0, total: 0 };
  walkQuestionnaireQuestions(definition, ({ question }) => {
    summary.total += 1;
    const mapping = normalizeCrmMapping(question?.metadata?.crm);
    if (!mapping || mapping.mode === CRM_MAPPING_MODES.unconfigured || mapping.invalid) {
      summary.unconfigured += 1;
    } else if (mapping.mode === CRM_MAPPING_MODES.portal_only) {
      summary.portalOnly += 1;
    } else {
      summary.mapped += 1;
    }
  });
  return summary;
}

export function hasInvalidEnabledCrmMapping(definition) {
  const issues = [];
  validateDefinitionCrmMappings(definition, issues);
  return issues;
}
