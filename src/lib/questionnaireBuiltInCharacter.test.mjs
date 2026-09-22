import assert from 'node:assert/strict';
import test from 'node:test';
import {
  QUESTIONNAIRE_LEGACY_CATALOG_VERSION,
  getBuiltInQuestionnaireDefinition,
} from './questionnaireBuiltIns.js';
import {
  PROTECTION_CHARACTER_DECLARATIONS,
  SPONSOR_CHARACTER_DECLARATIONS,
} from './questionnaireBuiltInCharacter.js';
import { hydrateLegacyQuestionnaireDefinition } from './questionnaireLegacyProtection.js';

const valueList = question => question.options.map(option => option.value);
const byAnswerKey = page => new Map(page.questions.map(question => [question.answerKey, question]));
const rowByAnswerKey = repeater => new Map(
  repeater.metadata.fields.map(field => [field.answerKey, field])
);

function pageFor(visaType, route) {
  return getBuiltInQuestionnaireDefinition({ visaType }).pages.find(page => page.route === route);
}

test('partner Sponsor Character preserves every declaration, detail collection, and dialog field', () => {
  const page = pageFor('partner', '/intake/partner/family-sponsor/character');
  assert.equal(page.metadata.storagePath, 'familySponsor.details');
  assert.equal(page.questions.length, SPONSOR_CHARACTER_DECLARATIONS.length * 2);
  const questions = byAnswerKey(page);

  for (const { key, label } of SPONSOR_CHARACTER_DECLARATIONS) {
    const source = questions.get(key);
    const details = questions.get(`${key}_details`);
    assert.ok(source, key);
    assert.equal(source.label, label);
    assert.equal(source.type, 'yesNo');
    assert.equal(source.required, true);
    assert.equal(source.defaultValue, 'no');
    assert.deepEqual(valueList(source), ['yes', 'no']);
    assert.deepEqual(source.metadata.originalOptions, source.options);
    assert.ok(details, `${key}_details`);
    assert.equal(details.type, 'repeater');
    assert.equal(details.required, false);
    assert.deepEqual(details.visibleIf, [{ field: key, op: 'equals', value: 'yes' }]);
    assert.equal(rowByAnswerKey(details).has('applicant_name'), false);
    assert.equal(rowByAnswerKey(details).get('details').type, 'textarea');
  }

  const offenceFields = rowByAnswerKey(questions.get('convicted_child_offence_details'));
  assert.deepEqual([...offenceFields.keys()], [
    'country', 'date_day', 'date_month', 'date_year', 'offence_type', 'details',
  ]);
  const generalFields = rowByAnswerKey(questions.get('removed_deported_details'));
  assert.deepEqual([...generalFields.keys()], [
    'country', 'date_day', 'date_month', 'date_year', 'details',
  ]);
  assert.deepEqual([...rowByAnswerKey(questions.get('national_security_risk_details')).keys()], [
    'country', 'details',
  ]);

  const trainingFields = rowByAnswerKey(questions.get('military_training_details'));
  assert.deepEqual([...trainingFields.keys()], [
    'country_of_training',
    'date_from_day', 'date_from_month', 'date_from_year',
    'date_to_day', 'date_to_month', 'date_to_year',
    'training_type', 'details',
  ]);
  assert.equal(trainingFields.get('training_type').type, 'select');
  assert.deepEqual(valueList(trainingFields.get('training_type')), [
    'Military Training',
    'Paramilitary Training',
    'Weapons Training',
    'Explosives Training',
    'Chemical Product Manufacturing',
    'Biological Product Manufacturing',
    'Other',
  ]);

  const serviceFields = rowByAnswerKey(questions.get('military_service_details'));
  assert.deepEqual([...serviceFields.keys()], [
    'country_of_service', 'country_of_deployment',
    'date_from_day', 'date_from_month', 'date_from_year',
    'date_to_day', 'date_to_month', 'date_to_year',
    'service_type', 'organisation_name', 'position_rank', 'duties_description', 'details',
  ]);
  assert.equal(serviceFields.get('service_type').type, 'select');
  assert.deepEqual(valueList(serviceFields.get('service_type')), [
    'Intelligence',
    'Military - Voluntary Service',
    'Military - Compulsory National Service',
    'Military - Conscription',
    'Military - Reserve',
    'National Guard',
    'Militia',
    'Paramilitary',
    'Police',
    'Secret Police',
  ]);
  assert.ok([...serviceFields.values()].every(field => field.required === false));
});

test('Protection Character restores all question sources and conditional detail collections', () => {
  const page = pageFor('protection', '/intake/protection/all-applicants/character');
  assert.equal(page.metadata.storagePath, 'protection_character');
  assert.equal(page.questions.length, PROTECTION_CHARACTER_DECLARATIONS.length * 2);
  const questions = byAnswerKey(page);

  for (const { key, detailsKey, label } of PROTECTION_CHARACTER_DECLARATIONS) {
    const source = questions.get(key);
    const details = questions.get(detailsKey);
    assert.ok(source, key);
    assert.equal(source.label, label);
    assert.equal(source.type, 'yesNo');
    assert.equal(source.required, false);
    assert.equal(source.defaultValue, 'no');
    assert.deepEqual(valueList(source), ['yes', 'no']);
    assert.deepEqual(source.metadata.originalOptions, source.options);
    assert.ok(details, detailsKey);
    assert.equal(details.type, 'repeater');
    assert.deepEqual(details.visibleIf, [{ field: key, op: 'equals', value: 'yes' }]);
  }

  const immigration = rowByAnswerKey(questions.get('immigration_detention_details'));
  assert.equal(immigration.get('location_type').type, 'select');
  assert.equal(immigration.get('location_type').required, true);
  assert.deepEqual(valueList(immigration.get('location_type')), [
    'Immigration Detention', 'Refugee Camp', 'Centre for Refugees',
  ]);

  const training = rowByAnswerKey(questions.get('military_training_details')).get('training_type');
  assert.equal(training.type, 'select');
  assert.deepEqual(valueList(training), [
    'Military Training',
    'Paramilitary Training',
    'Weapons Training',
    'Explosives Training',
    'Chemical Product Manufacturing',
    'Biological Product Manufacturing',
    'Other',
  ]);
  const service = rowByAnswerKey(questions.get('military_service_details')).get('service_type');
  assert.equal(service.type, 'select');
  assert.deepEqual(valueList(service), [
    'Intelligence',
    'Military - Voluntary Service',
    'Military - Compulsory National Service',
    'Military - Conscription',
    'Military - Reserve',
    'National Guard',
    'Militia',
    'Paramilitary',
    'Police',
    'Secret Police',
  ]);
});

test('legacy catalog hydration expands saved Character pages without changing their storage paths', () => {
  const saved = structuredClone(getBuiltInQuestionnaireDefinition({ visaType: 'partner' }));
  for (const page of saved.pages) page.metadata.legacyCatalogVersion = 2;
  const character = saved.pages.find(page => page.route === '/intake/partner/family-sponsor/character');
  character.questions = character.questions.filter(question =>
    ['duties_description', 'details'].includes(question.answerKey)
  );

  const hydrated = hydrateLegacyQuestionnaireDefinition(saved);
  const repaired = hydrated.pages.find(page => page.route === character.route);
  assert.equal(QUESTIONNAIRE_LEGACY_CATALOG_VERSION, 3);
  assert.equal(repaired.metadata.legacyCatalogVersion, 3);
  assert.equal(repaired.metadata.storagePath, 'familySponsor.details');
  assert.equal(repaired.questions.length, SPONSOR_CHARACTER_DECLARATIONS.length * 2);
});
