import {
  QUESTIONNAIRE_LEGACY_CATALOG_VERSION,
  questionnaireBuiltInTemplates,
} from './questionnaireBuiltIns.js';

function definitionContextKey(definition) {
  const context = definition?.visaContext
    || (Array.isArray(definition?.visaContexts) ? definition.visaContexts[0] : "");
  return `${definition?.visaType || ''}:${context || ''}`;
}

const builtInPages = questionnaireBuiltInTemplates.flatMap(definition => (
  definition.pages.map(page => ({ key: `${definitionContextKey(definition)}:${page.route}`, page }))
));
const builtInPagesByRoute = new Map(builtInPages.map(({ key, page }) => [key, page]));

function questionsById(questions, result = new Map()) {
  for (const question of questions || []) {
    if (question?.id) result.set(question.id, question);
    questionsById(question?.followUps, result);
    questionsById(question?.metadata?.fields, result);
  }
  return result;
}

function catalogBaselineSnapshot(page) {
  const questions = questionsById(page.questions);
  return {
    version: QUESTIONNAIRE_LEGACY_CATALOG_VERSION,
    questionIds: [...questions.keys()],
    introBlockCount: page.introBlocks?.length || 0,
    presentationSectionCounts: Object.fromEntries(
      [...questions].flatMap(([id, question]) => Array.isArray(question.metadata?.presentation?.sections)
        ? [[id, question.metadata.presentation.sections.length]]
        : [])
    ),
  };
}

function upgradeQuestionRequirements(questions, baselineById) {
  let changed = false;
  const upgraded = (questions || []).map(question => {
    const baseline = baselineById.get(question?.id);
    const matchesBaselineField = baseline
      && baseline.answerKey === question.answerKey
      && baseline.type === question.type;
    let next = question;

    // Before legacyCatalogVersion 2, generated built-in fields were all
    // stored as optional. Restore only requirements present in today's exact
    // built-in field contract; every other structural value remains protected.
    if (matchesBaselineField && baseline.required === true && question.required !== true) {
      next = { ...next, required: true };
      changed = true;
    }

    const followUps = upgradeQuestionRequirements(next.followUps, baselineById);
    if (followUps.changed) {
      next = { ...next, followUps: followUps.questions };
      changed = true;
    }

    const fields = upgradeQuestionRequirements(next.metadata?.fields, baselineById);
    if (fields.changed) {
      next = {
        ...next,
        metadata: { ...next.metadata, fields: fields.questions },
      };
      changed = true;
    }
    return next;
  });

  return { changed, questions: changed ? upgraded : questions };
}

function valuesMatch(left, right) {
  return JSON.stringify(stable(left)) === JSON.stringify(stable(right));
}

function migratedCopyValue(savedValue, originalValue, baselineValue) {
  if (savedValue === undefined) return baselineValue;
  return originalValue !== undefined && valuesMatch(savedValue, originalValue)
    ? baselineValue
    : savedValue;
}

function copyVisibleOptionLabels(baselineOptions, savedOptions, originalOptions) {
  if (!Array.isArray(baselineOptions)) return baselineOptions;
  const savedByValue = new Map(
    (savedOptions || [])
      .filter(option => option && Object.hasOwn(option, 'value'))
      .map(option => [option.value, option])
  );
  const originalByValue = new Map(
    (originalOptions || [])
      .filter(option => option && Object.hasOwn(option, 'value'))
      .map(option => [option.value, option])
  );
  const migrated = baselineOptions.map(option => {
    const saved = savedByValue.get(option.value);
    const original = originalByValue.get(option.value);
    return typeof saved?.label === 'string'
      ? { ...structuredClone(saved), ...option, label: migratedCopyValue(saved.label, original?.label, option.label) }
      : option;
  });
  const baselineValues = new Set(baselineOptions.map(option => option.value));
  for (const saved of savedOptions || []) {
    if (saved && Object.hasOwn(saved, 'value') && !baselineValues.has(saved.value)) {
      migrated.push(structuredClone(saved));
    }
  }
  return migrated;
}

function overlayPresentationCopy(baseline, saved, original, previousSectionCount = 0) {
  if (!baseline) return baseline;
  const presentation = { ...structuredClone(saved || {}), ...structuredClone(baseline) };
  for (const field of ['addLabel', 'emptyMessage', 'addDialogTitle', 'editDialogTitle', 'dialogSubtitle']) {
    if (Object.hasOwn(saved || {}, field)) {
      presentation[field] = migratedCopyValue(saved[field], original?.[field], baseline[field]);
    }
  }
  if (baseline.actions) {
    presentation.actions = { ...(saved?.actions || {}), ...baseline.actions };
    for (const field of Object.keys(baseline.actions)) {
      if (Object.hasOwn(saved?.actions || {}, field)) {
        presentation.actions[field] = migratedCopyValue(saved.actions[field], original?.actions?.[field], baseline.actions[field]);
      }
    }
  }
  if (Array.isArray(baseline.columns)) {
    const savedColumns = new Map((saved?.columns || []).map(column => [column.key, column]));
    const originalColumns = new Map((original?.columns || []).map(column => [column.key, column]));
    presentation.columns = baseline.columns.map(column => {
      const savedColumn = savedColumns.get(column.key);
      return savedColumn?.label === undefined ? { ...(savedColumn || {}), ...column } : {
        ...savedColumn,
        ...column,
        label: migratedCopyValue(savedColumn.label, originalColumns.get(column.key)?.label, column.label),
      };
    });
    const baselineColumnKeys = new Set(baseline.columns.map(column => column.key));
    presentation.columns.push(...(saved?.columns || [])
      .filter(column => !baselineColumnKeys.has(column.key))
      .map(column => structuredClone(column)));
  }
  if (Array.isArray(baseline.sections)) {
    presentation.sections = baseline.sections.flatMap((section, index) => {
      const savedSection = saved?.sections?.[index];
      const originalSection = original?.sections?.[index];
      if (!savedSection && index < previousSectionCount) return [];
      return [{
        ...(savedSection || {}),
        ...section,
        ...(savedSection?.heading !== undefined ? { heading: migratedCopyValue(savedSection.heading, originalSection?.heading, section.heading) } : {}),
        ...(savedSection?.description !== undefined ? { description: migratedCopyValue(savedSection.description, originalSection?.description, section.description) } : {}),
      }];
    });
    presentation.sections.push(...(saved?.sections || [])
      .slice(baseline.sections.length)
      .map(section => structuredClone(section)));
  }
  return presentation;
}

function mergeValidation(baseline, saved) {
  if (!baseline) return saved ? structuredClone(saved) : baseline;
  const baselineRules = baseline.rules || [];
  const baselineRuleKeys = new Set(baselineRules.map(rule => `${rule.id}:${rule.field || ''}`));
  return {
    ...(saved || {}),
    ...baseline,
    ...(baseline.rules || saved?.rules ? {
      rules: [
        ...structuredClone(baselineRules),
        ...(saved?.rules || []).filter(rule => !baselineRuleKeys.has(`${rule.id}:${rule.field || ''}`)).map(rule => structuredClone(rule)),
      ],
    } : {}),
  };
}

function mergeQuestionCopies(baselineQuestions, savedQuestions, previousSnapshot, report, path) {
  const savedById = new Map((savedQuestions || []).filter(question => question?.id).map(question => [question.id, question]));
  const baselineIds = new Set((baselineQuestions || []).map(question => question.id));
  const previousIds = new Set(previousSnapshot?.questionIds || []);
  const merged = [];
  for (const baseline of baselineQuestions || []) {
    const saved = savedById.get(baseline.id);
    if (!saved && previousIds.has(baseline.id)) {
      report.preserved.push(`${path}: preserved deletion of ${baseline.id}`);
      continue;
    }
    if (!saved) report.added.push(`${path}: added ${baseline.id}`);
    merged.push(overlayQuestionCopy(baseline, saved, previousSnapshot, report, path));
  }
  for (const saved of savedQuestions || []) {
    if (!baselineIds.has(saved?.id)) {
      merged.push(structuredClone(saved));
      report.preserved.push(`${path}: preserved unknown question ${saved?.id || '(without id)'}`);
    }
  }
  return merged;
}

function overlayQuestionCopy(baseline, saved, previousSnapshot, report, path) {
  let question = saved
    ? { ...structuredClone(saved), ...structuredClone(baseline) }
    : structuredClone(baseline);
  if (saved) {
    for (const [field, originalField] of [['label', 'originalLabel'], ['description', 'originalDescription'], ['placeholder', 'originalPlaceholder']]) {
      if (Object.hasOwn(saved, field)) {
        question[field] = migratedCopyValue(saved[field], saved.metadata?.[originalField], baseline[field]);
      }
    }
    if (baseline.options) {
      question.options = copyVisibleOptionLabels(baseline.options, saved.options, saved.metadata?.originalOptions);
    }
    if (baseline.monthOptions) {
      question.monthOptions = copyVisibleOptionLabels(baseline.monthOptions, saved.monthOptions, saved.metadata?.originalMonthOptions);
    }
    question.metadata = { ...(saved.metadata || {}), ...(question.metadata || {}) };
    question.metadata.validation = mergeValidation(baseline.metadata?.validation, saved.metadata?.validation);
    if (!question.metadata.validation) delete question.metadata.validation;
    if (baseline.metadata?.presentation) {
      question.metadata.presentation = overlayPresentationCopy(
        baseline.metadata.presentation,
        saved.metadata?.presentation,
        saved.metadata?.originalPresentation,
        previousSnapshot?.presentationSectionCounts?.[baseline.id] || 0,
      );
    }
    if (saved.metadata?.crm) question.metadata.crm = structuredClone(saved.metadata.crm);
    if (Object.keys(question.metadata).length === 0) delete question.metadata;
  }

  if (baseline.followUps || saved?.followUps) {
    question.followUps = mergeQuestionCopies(
      baseline.followUps || [],
      saved?.followUps || [],
      previousSnapshot,
      report,
      `${path}.${baseline.id}.followUps`,
    );
  }

  if (baseline.metadata?.fields || saved?.metadata?.fields) {
    question.metadata = {
      ...question.metadata,
      fields: mergeQuestionCopies(
        baseline.metadata?.fields || [],
        saved?.metadata?.fields || [],
        previousSnapshot,
        report,
        `${path}.${baseline.id}.fields`,
      ),
    };
  }
  return question;
}

function hydrateLegacyPage(page, baseline, report) {
  const previousSnapshot = page.metadata?.legacyCatalogBaseline;
  const originalIntroBlocks = page.metadata?.originalIntroBlocks;
  const introBlocks = Array.isArray(baseline.introBlocks)
    ? baseline.introBlocks.flatMap((block, index) => {
        const saved = page.introBlocks?.[index];
        const original = originalIntroBlocks?.[index];
        if (!saved && index < (previousSnapshot?.introBlockCount || 0)) {
          report.preserved.push(`${page.id}: preserved deletion of intro block ${index}`);
          return [];
        }
        if (!saved || saved.type !== block.type) {
          report.added.push(`${page.id}: added intro block ${index}`);
          return [structuredClone(block)];
        }
        if (block.type === 'paragraph') {
          return [{ ...structuredClone(saved), ...block, text: migratedCopyValue(saved.text, original?.text, block.text) }];
        }
        return [{
          ...structuredClone(saved),
          ...block,
          ...(saved.lead !== undefined ? { lead: migratedCopyValue(saved.lead, original?.lead, block.lead) } : {}),
          items: (block.items || []).map((item, itemIndex) => migratedCopyValue(saved.items?.[itemIndex], original?.items?.[itemIndex], item)),
        }];
      })
    : undefined;
  if (introBlocks) {
    introBlocks.push(...(page.introBlocks || [])
      .slice(baseline.introBlocks.length)
      .map((block, index) => {
        report.preserved.push(`${page.id}: preserved unknown intro block ${baseline.introBlocks.length + index}`);
        return structuredClone(block);
      }));
  }
  return {
    ...structuredClone(page),
    ...structuredClone(baseline),
    title: typeof page.title === 'string'
      ? migratedCopyValue(page.title, page.metadata?.originalDisplayTitle || page.metadata?.originalTitle, baseline.title)
      : baseline.title,
    order: Number.isFinite(page.order) ? page.order : baseline.order,
    questions: mergeQuestionCopies(
      baseline.questions,
      page.questions,
      previousSnapshot,
      report,
      page.id,
    ),
    ...(introBlocks ? { introBlocks } : {}),
    metadata: {
      ...(page.metadata || {}),
      ...baseline.metadata,
      legacyCatalogVersion: QUESTIONNAIRE_LEGACY_CATALOG_VERSION,
      legacyCatalogBaseline: catalogBaselineSnapshot(baseline),
    },
  };
}

/**
 * Hydrate saved built-in snapshots created before the current legacy catalog.
 *
 * The version marker distinguishes an old snapshot from a current structural
 * edit. Legacy pages receive the latest protected storage structure while
 * retaining their editable wording and option labels. A full old definition
 * also lets us carry corrected requirements onto the one page being promoted
 * to the dynamic renderer in the same save.
 */
export function migrateLegacyQuestionnaireDefinition(definition) {
  const report = { added: [], preserved: [], conflicts: [], unresolved: [] };
  if (!definition || !Array.isArray(definition.pages)) return { definition, report };

  const needsMigration = definition.pages.some(page =>
    page?.metadata?.legacyCatalogVersion !== QUESTIONNAIRE_LEGACY_CATALOG_VERSION
      && builtInPagesByRoute.has(`${definitionContextKey(definition)}:${page.route}`)
  );
  if (!needsMigration) return { definition, report };

  let changed = false;
  const pages = definition.pages.map(page => {
    const baseline = builtInPagesByRoute.get(`${definitionContextKey(definition)}:${page.route}`);
    if (
      !baseline
      || page.metadata?.legacyCatalogVersion === QUESTIONNAIRE_LEGACY_CATALOG_VERSION
    ) {
      return page;
    }

    if (page.metadata?.renderer === 'legacy' && baseline.metadata?.renderer === 'legacy') {
      changed = true;
      return hydrateLegacyPage(page, baseline, report);
    }

    const requirements = baseline.metadata?.renderer === 'legacy'
      ? upgradeQuestionRequirements(page.questions, questionsById(baseline.questions))
      : { changed: false, questions: page.questions };
    changed = true;
    report.preserved.push(`${page.id}: preserved dynamic structure while advancing the catalog baseline`);
    return {
      ...page,
      questions: requirements.questions,
      metadata: {
        ...page.metadata,
        legacyCatalogVersion: QUESTIONNAIRE_LEGACY_CATALOG_VERSION,
        legacyCatalogBaseline: catalogBaselineSnapshot(baseline),
      },
    };
  });

  return { definition: changed ? { ...definition, pages } : definition, report };
}

export function hydrateLegacyQuestionnaireDefinition(definition) {
  return migrateLegacyQuestionnaireDefinition(definition).definition;
}
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
}
function stripCrmFromContractMetadata(metadata) {
  const contract = {};
  for (const [key, value] of Object.entries(metadata || {})) {
    if (key === 'crm' || key.startsWith('original')) continue;
    if (key === 'fields') contract.fields = value.map(questionContract);
    else if (key === 'presentation') {
      contract.presentation = {
        ...(value.rowFormatter ? { rowFormatter: value.rowFormatter } : {}),
        ...(Array.isArray(value.columns) ? { columns: value.columns.map(({ key: columnKey, format }) => ({ key: columnKey, ...(format ? { format } : {}) })) } : {}),
        ...(Array.isArray(value.sections) ? { sectionCount: value.sections.length } : {}),
      };
    } else contract[key] = value;
  }
  return contract;
}

function pageContractMetadata(metadata) {
  const contract = stripCrmFromContractMetadata(metadata || {});
  delete contract.legacyCatalogVersion;
  delete contract.legacyCatalogBaseline;
  delete contract.titleIncludesPerson;
  delete contract.titleTemplate;
  return contract;
}

function questionContract(question) {
  const { label, description, placeholder, options, followUps, metadata, ...contract } = question;
  return {
    ...contract,
    ...(!Object.hasOwn(metadata || {}, 'originalDescription') && description !== undefined ? { description } : {}),
    ...(!Object.hasOwn(metadata || {}, 'originalPlaceholder') && placeholder !== undefined ? { placeholder } : {}),
    ...(options ? { options: options.map(({ value }) => ({ value })) } : {}),
    ...(followUps ? { followUps: followUps.map(questionContract) } : {}),
    ...(metadata ? { metadata: stripCrmFromContractMetadata(metadata) } : {}),
  };
}
function pageContract(page) {
  return {
    id: page.id, route: page.route, sectionKey: page.sectionKey,
    completionKey: page.completionKey, scope: page.scope, metadata: pageContractMetadata(page.metadata),
    questions: page.questions.map(questionContract),
    introBlocks: (page.introBlocks || []).map(block => ({
      type: block.type, ...(block.type === 'list' ? { itemCount: block.items.length, hasLead: typeof block.lead === 'string' } : {}),
    })),
  };
}
function ambiguousCopyIssues(page, baseline) {
  const mappings = new Map();
  const record = (original, edited) => {
    if (typeof original !== 'string' || !original) return;
    const values = mappings.get(original) || new Set();
    values.add(edited);
    mappings.set(original, values);
  };
  const questions = (current, original) => {
    current.forEach((question, index) => {
      const source = original[index];
      if (!source) return;
      record(source.metadata?.originalLabel, question.label === source.label ? source.metadata?.originalLabel : question.label);
      for (const field of ['description', 'placeholder']) {
        const key = field === 'description' ? 'originalDescription' : 'originalPlaceholder';
        record(source.metadata?.[key], question[field] === source[field] ? source.metadata?.[key] : question[field]);
      }
      source.metadata?.originalOptions?.forEach(option => record(option.label, question.options?.find(candidate => candidate.value === option.value)?.label || option.label));
      if (source.metadata?.fields) questions(question.metadata?.fields || [], source.metadata.fields);
      if (source.followUps) questions(question.followUps || [], source.followUps);
    });
  };
  questions(page.questions, baseline.questions);
  return [...mappings].filter(([, values]) => values.size > 1).map(([text]) =>
    `${page.title}: "${text}" appears in several existing fields; use the same revised wording for every occurrence before saving`
  );
}

/** Preserve the storage contract of the shipped forms when saving edits. */
export function getLegacyQuestionnairePublishIssues(definition) {
  if (definition.status !== 'active') return [];
  definition = hydrateLegacyQuestionnaireDefinition(definition);
  const issues = [];
  for (const page of definition.pages || []) {
    const baseline = builtInPagesByRoute.get(`${definitionContextKey(definition)}:${page.route}`);
    if (!baseline) {
      if (page.metadata?.renderer === 'legacy') issues.push(`${page.title}: the original built-in page could not be found`);
      continue;
    }
    if (baseline.metadata?.renderer !== 'legacy') continue;
    if (page.metadata?.renderer !== 'legacy') {
      issues.push(`${page.title}: this shipped page has not been certified for the dynamic renderer; create and verify a Test copy before requesting promotion`);
      continue;
    }
    if (JSON.stringify(stable(pageContract(page))) !== JSON.stringify(stable(pageContract(baseline)))) {
      issues.push(`${page.title}: the built-in page's answer structure is preserved; edit its wording and option labels or restore the original structure before saving`);
    } else {
      issues.push(...ambiguousCopyIssues(page, baseline));
    }
  }
  return issues;
}
