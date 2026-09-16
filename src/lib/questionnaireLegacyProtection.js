import { questionnaireBuiltInTemplates } from './questionnaireBuiltIns.js';

const legacyPages = questionnaireBuiltInTemplates.flatMap(definition => definition.pages)
  .filter(page => page.metadata?.renderer === 'legacy');
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
  const issues = [];
  for (const page of definition.pages || []) {
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
