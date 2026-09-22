import {
  QUESTIONNAIRE_LEGACY_CATALOG_VERSION,
  questionnaireBuiltInTemplates,
} from './questionnaireBuiltIns.js';

const legacyPages = questionnaireBuiltInTemplates.flatMap(definition => definition.pages)
  .filter(page => page.metadata?.renderer === 'legacy');
const legacyPagesByRoute = new Map(legacyPages.map(page => [page.route, page]));

function questionsById(questions, result = new Map()) {
  for (const question of questions || []) {
    if (question?.id) result.set(question.id, question);
    questionsById(question?.followUps, result);
    questionsById(question?.metadata?.fields, result);
  }
  return result;
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

function copyVisibleOptionLabels(baselineOptions, savedOptions) {
  if (!Array.isArray(baselineOptions)) return baselineOptions;
  const savedByValue = new Map(
    (savedOptions || [])
      .filter(option => option && Object.hasOwn(option, 'value'))
      .map(option => [option.value, option])
  );
  return baselineOptions.map(option => {
    const saved = savedByValue.get(option.value);
    return typeof saved?.label === 'string' ? { ...option, label: saved.label } : option;
  });
}

function overlayQuestionCopy(baseline, savedById) {
  const saved = savedById.get(baseline.id);
  let question = structuredClone(baseline);
  if (saved) {
    for (const field of ['label', 'description', 'placeholder']) {
      if (Object.hasOwn(saved, field)) question[field] = saved[field];
    }
    if (baseline.options) {
      question.options = copyVisibleOptionLabels(baseline.options, saved.options);
    }
    if (baseline.monthOptions) {
      question.monthOptions = copyVisibleOptionLabels(baseline.monthOptions, saved.monthOptions);
    }
  }

  if (baseline.followUps) {
    question.followUps = baseline.followUps.map(followUp =>
      overlayQuestionCopy(followUp, savedById)
    );
  }

  if (baseline.metadata?.fields) {
    question.metadata = {
      ...question.metadata,
      fields: baseline.metadata.fields.map(field =>
        overlayQuestionCopy(field, savedById)
      ),
    };
  }
  return question;
}

function overlayIntroCopy(baselineBlocks, savedBlocks) {
  if (!Array.isArray(baselineBlocks)) return baselineBlocks;
  return baselineBlocks.map((block, index) => {
    const saved = savedBlocks?.[index];
    if (!saved || saved.type !== block.type) return structuredClone(block);
    if (block.type === 'paragraph') {
      return typeof saved.text === 'string' ? { ...block, text: saved.text } : block;
    }
    return {
      ...block,
      ...(typeof saved.lead === 'string' ? { lead: saved.lead } : {}),
      items: block.items.map((item, itemIndex) =>
        typeof saved.items?.[itemIndex] === 'string' ? saved.items[itemIndex] : item
      ),
    };
  });
}

function hydrateLegacyPage(page, baseline) {
  const savedById = questionsById(page.questions);
  return {
    ...structuredClone(baseline),
    title: typeof page.title === 'string' ? page.title : baseline.title,
    order: Number.isFinite(page.order) ? page.order : baseline.order,
    questions: baseline.questions.map(question =>
      overlayQuestionCopy(question, savedById)
    ),
    ...(baseline.introBlocks
      ? { introBlocks: overlayIntroCopy(baseline.introBlocks, page.introBlocks) }
      : {}),
    metadata: {
      ...baseline.metadata,
      legacyCatalogVersion: QUESTIONNAIRE_LEGACY_CATALOG_VERSION,
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
export function hydrateLegacyQuestionnaireDefinition(definition) {
  if (!definition || !Array.isArray(definition.pages)) return definition;

  const needsMigration = definition.pages.some(page =>
    page?.metadata?.renderer === 'legacy'
      && page.metadata?.legacyCatalogVersion !== QUESTIONNAIRE_LEGACY_CATALOG_VERSION
      && legacyPagesByRoute.has(page.route)
  );
  if (!needsMigration) return definition;

  let changed = false;
  const pages = definition.pages.map(page => {
    const baseline = legacyPagesByRoute.get(page.route);
    if (
      !baseline
      || page.metadata?.legacyCatalogVersion === QUESTIONNAIRE_LEGACY_CATALOG_VERSION
    ) {
      return page;
    }

    if (page.metadata?.renderer === 'legacy') {
      changed = true;
      return hydrateLegacyPage(page, baseline);
    }

    const requirements = upgradeQuestionRequirements(
      page.questions,
      questionsById(baseline.questions)
    );
    changed = true;
    return {
      ...page,
      questions: requirements.questions,
      metadata: {
        ...page.metadata,
        legacyCatalogVersion: QUESTIONNAIRE_LEGACY_CATALOG_VERSION,
      },
    };
  });

  return changed ? { ...definition, pages } : definition;
}
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
}
function questionContract(question) {
  const { label, description, placeholder, options, followUps, metadata, ...contract } = question;
  return {
    ...contract,
    ...(!Object.hasOwn(metadata || {}, 'originalDescription') && description !== undefined ? { description } : {}),
    ...(!Object.hasOwn(metadata || {}, 'originalPlaceholder') && placeholder !== undefined ? { placeholder } : {}),
    ...(options ? { options: options.map(({ value }) => ({ value })) } : {}),
    ...(followUps ? { followUps: followUps.map(questionContract) } : {}),
    ...(metadata ? { metadata: {
      ...metadata,
      ...(metadata.fields ? { fields: metadata.fields.map(questionContract) } : {}),
    } } : {}),
  };
}
function pageContract(page) {
  return {
    id: page.id, route: page.route, sectionKey: page.sectionKey,
    completionKey: page.completionKey, scope: page.scope, metadata: page.metadata,
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
    // A page that has been deliberately promoted to the schema renderer is no
    // longer coupled to its shipped React form. Its storage keys are still
    // validated by the questionnaire schema, while choices and display rules
    // may now change through the owner-facing builder.
    if (page.metadata?.renderer !== 'legacy') continue;

    const baseline = legacyPages.find(candidate => candidate.route === page.route);
    if (!baseline) {
      if (page.metadata?.renderer === 'legacy') issues.push(`${page.title}: the original built-in page could not be found`);
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
