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

function findQuestionById(questions, questionId) {
  for (const question of questions || []) {
    if (question.id === questionId) return question;
    const nested = findQuestionById(question.followUps, questionId)
      || findQuestionById(question.metadata?.fields, questionId);
    if (nested) return nested;
  }
  return null;
}

function findTemplateQuestion(template, questionId) {
  for (const page of template.pages) {
    const question = findQuestionById(page.questions, questionId);
    if (question) return question;
  }
  return null;
}

test('custom client choice controls remain editable in every final built-in catalog', () => {
  const genderValues = ['Male', 'Female', 'Other'];
  const maritalStatusValues = ['Never Married', 'Married', 'De Facto Relationship', 'Divorced', 'Widowed', 'Separated'];
  const byTemplateId = new Map(questionnaireBuiltInTemplates.map(template => [template.id, template]));
  const cases = [
    ['built-in-temporary-work-482', 'temporary-work-non-migrating-member-profile-details-sex', 'radio', genderValues],
    ['built-in-temporary-work-482', 'temporary-work-non-migrating-member-profile-passport-sex', 'radio', genderValues],
    ['built-in-temporary-work-186', 'temporary-work-non-migrating-member-profile-details-sex', 'radio', genderValues],
    ['built-in-temporary-work-186', 'temporary-work-non-migrating-member-profile-passport-sex', 'radio', genderValues],
    ['built-in-partner', 'partner-main-applicant-family-children-gender', 'radio', genderValues],
    ['built-in-partner', 'partner-family-sponsor-details-marital_status', 'select', maritalStatusValues],
    ['built-in-partner', 'partner-family-sponsor-family-family_members-gender', 'radio', genderValues],
    ['built-in-partner', 'partner-family-sponsor-previous-sponsorship-previous_sponsorships-gender', 'radio', genderValues],
    ['built-in-partner', 'partner-relationships-previous-relationships-applicant_previous_relationships_list-gender', 'radio', genderValues],
    ['built-in-partner', 'partner-relationships-previous-relationships-spouse_previous_relationships_list-gender', 'radio', genderValues],
    ['built-in-partner', 'partner-relationships-supporting-witnesses-supporting_witnesses-gender', 'radio', genderValues],
    ['built-in-partner', 'partner-all-applicants-contacts-family_in_australia-gender', 'radio', genderValues],
    ['built-in-partner', 'partner-non-migrating-member-profile-details-sex', 'radio', genderValues],
    ['built-in-partner', 'partner-non-migrating-member-profile-passport-sex', 'radio', genderValues],
    ['built-in-protection', 'protection-all-applicants-contacts-main_applicant_contacts-gender', 'radio', genderValues],
    ['built-in-protection', 'protection-non-migrating-member-profile-details-sex', 'radio', genderValues],
    ['built-in-protection', 'protection-non-migrating-member-profile-passport-sex', 'radio', genderValues],
  ];

  for (const [templateId, questionId, type, optionValues] of cases) {
    const question = findTemplateQuestion(byTemplateId.get(templateId), questionId);
    assert.ok(question, `${templateId} should include ${questionId}`);
    const answerKey = questionId.endsWith('-marital_status')
      ? 'marital_status'
      : questionId.endsWith('-sex')
        ? 'sex'
        : 'gender';
    assert.equal(question.answerKey, answerKey, `${questionId} should retain its saved answer key`);
    assert.equal(question.type, type, `${questionId} should preserve its client choice control`);
    assert.deepEqual(question.options.map(option => option.value), optionValues);
    assert.deepEqual(question.options.map(option => option.label), optionValues);
    assert.deepEqual(question.metadata.originalOptions, question.options);
  }
});

test('reviewed nested client choices retain their exact stored values and editable labels', () => {
  const byTemplateId = new Map(questionnaireBuiltInTemplates.map(template => [template.id, template]));
  const identityDocumentValues = [
    'Birth certificate',
    'Drivers licence',
    'Marriage certificate',
    'Change of name certificate',
    'Military discharge certificate',
    'Other',
  ];
  const cases = [
    ['built-in-temporary-work-482', 'temporary-work-non-migrating-member-profile-details-relationship', 'select', ['parent', 'sibling', 'child', 'grandparent', 'other_relative']],
    ['built-in-temporary-work-186', 'temporary-work-non-migrating-member-profile-details-relationship_status', 'select', ['Never Married', 'Married', 'De Facto Relationship', 'Divorced', 'Widowed', 'Separated']],
    ['built-in-partner', 'partner-non-migrating-member-profile-other-names-other_names-type', 'select', ['alias', 'maiden_name', 'name_at_birth', 'other_spelling']],
    ['built-in-protection', 'protection-main-applicant-identity-other_identity_documents-document_type', 'select', identityDocumentValues],
    ['built-in-partner', 'partner-spouse-partner-identity-other_identity_documents-document_type', 'select', identityDocumentValues],
    ['built-in-partner', 'partner-relationships-previous-relationships-applicant_previous_relationships_list-type_of_relationship', 'select', ['De Facto Relationship', 'Engaged', 'Married', 'Other']],
    ['built-in-partner', 'partner-relationships-previous-relationships-spouse_previous_relationships_list-how_relationship_ceased', 'select', ['Divorce', 'Separation', 'Death', 'Other']],
    ['built-in-partner', 'partner-all-applicants-future-travel-future_travel-reason', 'select', ['Work, study or training', 'Business', 'Visit Family', 'Holiday or Leisure', 'Military Deployment', 'Other']],
    ['built-in-protection', 'protection-employment-commercial_address_type', 'select', ['Business', 'Residential', 'Postal', 'Other']],
  ];

  for (const [templateId, questionId, type, values] of cases) {
    const question = findTemplateQuestion(byTemplateId.get(templateId), questionId);
    assert.ok(question, `${templateId} should include ${questionId}`);
    assert.equal(question.type, type);
    assert.deepEqual(question.options.map(option => option.value), values);
    assert.deepEqual(question.metadata.originalOptions, question.options);
  }

  const residenceApplicant = findTemplateQuestion(
    byTemplateId.get('built-in-temporary-work-482'),
    'temporary-work-all-applicants-countries-of-residence-residence_records-applicant_name',
  );
  assert.equal(residenceApplicant.type, 'select');
  assert.equal(residenceApplicant.optionsSource, 'applicants');
  assert.equal(residenceApplicant.options, undefined);
});

test('choice casing and conditional rows match the client answer contract', () => {
  const partner = getBuiltInQuestionnaireDefinition({ visaType: 'partner' });
  const temporaryWork = getBuiltInQuestionnaireDefinition({ visaType: 'temporary-work', visaContext: '482' });
  const values = (template, id) => findTemplateQuestion(template, id).options.map(option => option.value);

  assert.deepEqual(values(partner, 'partner-all-applicants-visas-has_aus_visa_history'), ['yes', 'no']);
  assert.deepEqual(values(partner, 'partner-all-applicants-future-travel-has_future_travel'), ['Yes', 'No']);
  assert.deepEqual(values(partner, 'partner-all-applicants-contacts-has_family_in_australia'), ['Yes', 'No']);
  assert.deepEqual(values(temporaryWork, 'temporary-work-main-applicant-employment-employment_history-is_current_employment'), ['yes', 'no']);
  assert.deepEqual(values(temporaryWork, 'temporary-work-main-applicant-employment-employment_history-is_related_to_nominated_position'), ['yes', 'no']);

  const futureTravel = findTemplateQuestion(partner, 'partner-all-applicants-future-travel-future_travel');
  assert.equal(futureTravel.required, true);
  assert.deepEqual(futureTravel.visibleIf, [{ field: 'has_future_travel', op: 'equals', value: 'Yes' }]);
  const futureTravelOther = findTemplateQuestion(partner, 'partner-all-applicants-future-travel-future_travel-other_reason_details');
  assert.deepEqual(futureTravelOther.visibleIf, [{ field: 'reason', op: 'equals', value: 'Other' }]);
  const sponsorTravelOther = findTemplateQuestion(partner, 'partner-family-sponsor-travel-travel_history-reason_details');
  assert.deepEqual(sponsorTravelOther.visibleIf, [{ field: 'reason_for_being', op: 'equals', value: 'Other' }]);

  for (const template of questionnaireBuiltInTemplates) {
    const visit = questions => questions.flatMap(question => [
      question,
      ...visit(question.metadata?.fields || []),
      ...visit(question.followUps || []),
    ]);
    assert.ok(visit(template.pages.flatMap(page => page.questions))
      .filter(question => question.type === 'checkbox')
      .every(question => question.required === false));
  }
});

test('dynamic date lists avoid false static choices and reviewed future ranges remain usable', () => {
  const partner = getBuiltInQuestionnaireDefinition({ visaType: 'partner' });
  const textDateIds = [
    'partner-main-applicant-education-education_history-date_from_day',
    'partner-main-applicant-education-education_history-date_from_month',
    'partner-main-applicant-education-education_history-date_from_year',
    'partner-family-sponsor-identity-passports-date_issued_day',
    'partner-family-sponsor-identity-passports-date_issued_month',
    'partner-family-sponsor-identity-passports-date_issued_year',
    'partner-family-sponsor-family-family_members-birth_day',
    'partner-family-sponsor-family-family_members-birth_month',
    'partner-family-sponsor-family-family_members-birth_year',
    'partner-family-sponsor-circumstances-employment_history-date_from_day',
    'partner-family-sponsor-circumstances-employment_history-date_from_month',
    'partner-family-sponsor-circumstances-employment_history-date_from_year',
    'partner-all-applicants-future-addresses-future_addresses-date_to_day',
    'partner-all-applicants-future-addresses-future_addresses-date_to_month',
    'partner-all-applicants-future-addresses-future_addresses-date_to_year',
    'partner-family-sponsor-travel-travel_history-departure_date_day',
    'partner-family-sponsor-travel-travel_history-departure_date_month',
    'partner-family-sponsor-travel-travel_history-departure_date_year',
  ];
  for (const id of textDateIds) assert.equal(findTemplateQuestion(partner, id).type, 'text', id);
  assert.equal(findTemplateQuestion(partner, 'partner-children-child-profile-custody-primary_custody_details').type, 'text');

  const currentYear = new Date().getFullYear();
  const passportExpiry = findTemplateQuestion(partner, 'partner-main-applicant-identity-passports-date_expiry');
  assert.equal(passportExpiry.type, 'dateParts');
  assert.equal(passportExpiry.maxYear, currentYear + 50);
  assert.equal(passportExpiry.yearRange, currentYear + 50 - 2016 + 1);
  const residenceExpiry = findTemplateQuestion(partner, 'partner-main-applicant-identity-pr_countries-expiry');
  assert.equal(residenceExpiry.maxYear, currentYear + 79);
  assert.equal(residenceExpiry.yearRange, 80);
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
