import assert from 'node:assert/strict';
import test from 'node:test';
import { questionnaireBuiltInTemplates, getBuiltInQuestionnaireDefinition } from './questionnaireBuiltIns.js';
import { createQuestionnaireDraft } from './questionnaireDrafts.js';
import { getQuestionnaireDefinitionIssues, normalizeQuestionnaireDefinition, assertQuestionnaireDefinitionStructureEditable } from './questionnaireDefinitions.js';
import { getLegacyQuestionnairePublishIssues } from './questionnaireLegacyProtection.js';
import { getRegisteredQuestionnaireRoutes } from './routes.js';

for (const template of questionnaireBuiltInTemplates) {
  test(`${template.title}: the complete fallback can be published without altering saved answer contracts`, () => {
    const definition = normalizeQuestionnaireDefinition({ ...createQuestionnaireDraft(template, `test-${template.id}`), status: 'active' });
    assert.deepEqual(getQuestionnaireDefinitionIssues(definition), []);
    assert.deepEqual(getLegacyQuestionnairePublishIssues(definition), []);
    assert.ok(definition.pages.length > 20);
    const routes = new Set(getRegisteredQuestionnaireRoutes(definition.visaType, definition.visaContexts).map(route => route.href));
    assert.ok(definition.pages.every(page => routes.has(page.route)), 'every page has a registered client form');
  });
}

test('subclass selection preserves separate complete 482 and 186 templates', () => {
  assert.equal(getBuiltInQuestionnaireDefinition({ visaType: 'temporary-work', visaContext: '186' }).visaContext, '186');
  const routes = definition => definition.pages.map(page => page.route);
  assert.ok(routes(getBuiltInQuestionnaireDefinition({ visaType: 'temporary-work', visaContext: '186' })).some(route => route.endsWith('/spouse-partner/education')));
  assert.ok(!routes(getBuiltInQuestionnaireDefinition({ visaType: 'temporary-work', visaContext: '482' })).some(route => route.endsWith('/spouse-partner/education')));
});

test('legacy wording edits include nested row labels while live answer structure stays locked', () => {
  const source = normalizeQuestionnaireDefinition(questionnaireBuiltInTemplates[0]);
  const edited = structuredClone(source);
  const page = edited.pages.find(page => page.route.endsWith('/main-applicant/other'));
  page.questions[0].label = 'Updated question wording';
  const record = page.questions.find(question => question.metadata?.fields?.length);
  record.metadata.fields[0].label = 'Updated record field wording';
  assert.deepEqual(getLegacyQuestionnairePublishIssues(edited), []);
  assert.doesNotThrow(() => assertQuestionnaireDefinitionStructureEditable(source, edited));
  for (const alter of [
    page => { page.questions[0].answerKey = 'renamed_answer'; },
    page => { page.questions[0].type = 'text'; },
    page => { page.questions[0].visibleIf = [{ field: 'has_other_names', op: 'equals', value: 'yes' }]; },
    page => { page.metadata.renderer = 'dynamic'; },
    page => { page.metadata.storagePath = 'other_client_answers'; },
    page => { page.questions[1].metadata.fields[0].answerKey = 'changed_row_key'; },
  ]) {
    const changed = structuredClone(edited);
    alter(changed.pages.find(candidate => candidate.id === page.id));
    assert.ok(getLegacyQuestionnairePublishIssues(changed).length);
  }
});

test('schema backed records reject unsafe nested keys before persistence', () => {
  const template = structuredClone(questionnaireBuiltInTemplates[0]);
  const record = template.pages.flatMap(page => page.questions).find(question => question.metadata?.fields?.length);
  record.metadata.fields[0].answerKey = '__proto__';
  assert.ok(getQuestionnaireDefinitionIssues(template).some(issue => issue.includes('reserved') || issue.includes('unsupported characters')));
});

test('copy edits cannot give the same ambiguous static label conflicting wording', () => {
  const template = structuredClone(questionnaireBuiltInTemplates[0]);
  const page = template.pages.find(page => page.route.endsWith('/main-applicant/identity'));
  const seen = new Map();
  let duplicate;
  const visit = questions => questions.forEach(question => {
    const original = question.metadata?.originalLabel;
    if (original && seen.has(original) && !duplicate) duplicate = question;
    seen.set(original, question);
    if (question.metadata?.fields) visit(question.metadata.fields);
  });
  visit(page.questions);
  assert.ok(duplicate);
  duplicate.label = 'Conflicting wording for one occurrence';
  assert.ok(getLegacyQuestionnairePublishIssues(template).some(issue => issue.includes('same revised wording')));
});
