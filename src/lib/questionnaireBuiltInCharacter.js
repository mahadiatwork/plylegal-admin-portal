import { temporaryWork482Definition } from './questionnaireStarterTemplates.js';

const YES_NO_OPTIONS = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
];

const TRAINING_TYPE_OPTIONS = [
  'Military Training',
  'Paramilitary Training',
  'Weapons Training',
  'Explosives Training',
  'Chemical Product Manufacturing',
  'Biological Product Manufacturing',
  'Other',
].map(value => ({ value, label: value }));

const SERVICE_TYPE_OPTIONS = [
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
].map(value => ({ value, label: value }));

const LOCATION_TYPE_OPTIONS = [
  'Immigration Detention',
  'Refugee Camp',
  'Centre for Refugees',
].map(value => ({ value, label: value }));

export const SPONSOR_CHARACTER_DECLARATIONS = [
  ['convicted_child_offence', 'Has your Sponsor specifically been convicted of a crime or offence in any country (including any conviction which is removed from official records), relating to persons under the age of 18, including but not limited to: child abuse, child sex, endangering a child, indecent dealings with a child, or possession of child pornography?'],
  ['charged_child_offence', 'Has your Sponsor specifically been charged with any offence that is currently awaiting legal action in any country relating to persons under the age of 18, including but not limited to: child abuse, child sex, endangering a child, indecent dealings with a child, or possession of child pornography?'],
  ['convicted_general_offence', 'In addition to any offence disclosed above, has your Sponsor ever been convicted of an offence in any country (including any conviction which is now removed from official records)? This may include traffic and other non criminal offences. If in doubt, click Yes.'],
  ['charged_general_offence', 'In addition to any offence disclosed above, has your Sponsor ever been charged with any offence that is currently awaiting legal action? This may include traffic and other non criminal offences. If in doubt, click Yes.'],
  ['acquitted_mental_illness', 'Has your Sponsor ever been acquitted of any offence on the grounds of mental illness, unsoundness of mind or insanity? This may include traffic and other non criminal offences. If in doubt, click Yes.'],
  ['removed_deported', 'Has your Sponsor been removed or deported from any country?'],
  ['left_to_avoid_removal', 'Has your Sponsor left any country to avoid being removed or deported from that country?'],
  ['excluded_from_country', 'Has your Sponsor been excluded from or asked to leave any country?'],
  ['war_crimes', 'Has your Sponsor committed or been involved in the commission of war crimes against humanity or human rights?'],
  ['national_security_risk', 'Has your Sponsor ever been involved in activities which would represent a risk to national security in Australia or any other country?'],
  ['outstanding_debts', 'Has your Sponsor ever had any outstanding debts to the Australian Government or any public authority in Australia?'],
  ['people_smuggling', 'Has your Sponsor been involved in any activity or been convicted of any offence relating to the illegal movement of people to any country?'],
  ['military_training', 'Has your Sponsor ever undergone any military/paramilitary training, been trained in weapons/explosives or in the manufacture of chemical/biological products?'],
  ['military_service', 'Has your Sponsor ever served in a military force, police force, state sponsored / private militia or intelligence agency (including secret police)?'],
].map(([key, label]) => ({ key, label }));

const APPROVED_PROTECTION_LABELS = Object.fromEntries(
  temporaryWork482Definition.pages
    .find(page => page.id === 'all-applicants-character')
    .questions.map(question => [question.id, question.label])
);

const PROTECTION_APPROVED_KEYS = {
  awaiting_legal_action: 'char_q01',
  convicted_offence: 'char_q02',
  domestic_violence_order: 'char_q03',
  arrest_warrant: 'char_q04',
  child_sex_offence: 'char_q05',
  sex_offender_register: 'char_q06',
  insanity_acquittal: 'char_q07',
  unfit_to_plead: 'char_q08',
  national_security_risk: 'char_q09',
  war_crimes: 'char_q10',
  associated_criminal_conduct: 'char_q11',
  associated_violent_org: 'char_q12',
  military_service: 'char_q13',
  military_training: 'char_q14',
  people_smuggling: 'char_q15',
  outstanding_debts: 'char_q18',
};

const PROTECTION_SCOPED_LABELS = {
  police_check_last_12_months: 'Has any applicant applied for a police clearance certificate in the last 12 months?',
  immigration_detention: 'Has any applicant previously been in immigration detention, a refugee camp or centre for refugees?',
  psychiatric_institution: 'Has any applicant ever been confined in a prison or psychiatric institution by order of a court in relation to criminal proceedings?',
  false_misleading_info: 'Has any applicant ever provided any information or a document to the Australian Immigration or Customs Authorities which was wrong, incorrect, false or misleading?',
  visa_refused: 'Has any applicant ever had a visa or entry permit for any country (including Australia) refused?',
  overstayed_visa: 'Has any applicant ever overstayed a visa or entry permit in any country (including Australia)?',
  deported_removed: 'Has any applicant ever been removed or deported from any country (including Australia)?',
  avoid_removal: 'Has any applicant ever left any country to avoid being removed or deported from that country (including Australia)?',
  excluded_from_country: 'Has any applicant ever been excluded from or asked to leave any country (including Australia)?',
  citizenship_refusal: 'Has any applicant ever been refused, renounced or rescinded citizenship of any country?',
  sponsorship_payment: 'Has any person included in this application made or offered to make a payment or provide another benefit of any kind to another person or entity in return for the sponsorship, nomination or support for an Australian visa?',
};

export const PROTECTION_CHARACTER_DECLARATIONS = [
  ['police_check_last_12_months', 'police_check_details'],
  ['immigration_detention', 'immigration_detention_details'],
  ['convicted_offence', 'convicted_offence_details'],
  ['awaiting_legal_action', 'awaiting_legal_action_details'],
  ['domestic_violence_order', 'domestic_violence_details'],
  ['arrest_warrant', 'arrest_warrant_details'],
  ['child_sex_offence', 'child_sex_offence_details'],
  ['sex_offender_register', 'sex_offender_register_details'],
  ['psychiatric_institution', 'psychiatric_institution_details'],
  ['insanity_acquittal', 'insanity_acquittal_details'],
  ['unfit_to_plead', 'unfit_to_plead_details'],
  ['false_misleading_info', 'false_misleading_info_details'],
  ['visa_refused', 'visa_refused_details'],
  ['overstayed_visa', 'overstayed_visa_details'],
  ['deported_removed', 'deported_removed_details'],
  ['avoid_removal', 'avoid_removal_details'],
  ['excluded_from_country', 'excluded_from_country_details'],
  ['citizenship_refusal', 'citizenship_refusal_details'],
  ['war_crimes', 'war_crimes_details'],
  ['national_security_risk', 'national_security_details'],
  ['outstanding_debts', 'outstanding_debts_details'],
  ['people_smuggling', 'people_smuggling_details'],
  ['associated_criminal_conduct', 'criminal_conduct_details'],
  ['associated_violent_org', 'violent_org_details'],
  ['military_training', 'military_training_details'],
  ['military_service', 'military_service_details'],
  ['sponsorship_payment', 'sponsorship_payment_details'],
].map(([key, detailsKey]) => ({
  key,
  detailsKey,
  label: PROTECTION_SCOPED_LABELS[key]
    || APPROVED_PROTECTION_LABELS[PROTECTION_APPROVED_KEYS[key]],
}));

function choiceMetadata(options) {
  return { originalOptions: options.map(option => ({ ...option })) };
}

function yesNoQuestion(pageId, key, label, required) {
  const options = YES_NO_OPTIONS.map(option => ({ ...option }));
  return {
    id: `${pageId}-${key}`,
    answerKey: key,
    label,
    type: 'yesNo',
    required,
    defaultValue: 'no',
    options,
    metadata: {
      originalLabel: label,
      ...choiceMetadata(options),
    },
  };
}

function rowField(repeaterId, answerKey, label, { type = 'text', required = false, options } = {}) {
  return {
    id: `${repeaterId}-${answerKey}`,
    answerKey,
    label,
    type,
    required,
    ...(options ? { options: options.map(option => ({ ...option })) } : {}),
    metadata: {
      originalLabel: label,
      ...(options ? choiceMetadata(options) : {}),
    },
  };
}

function sponsorDetailFields(repeaterId, key) {
  const isService = key === 'military_service';
  const isTraining = key === 'military_training';
  const isMilitary = isService || isTraining;
  const isOffence = new Set([
    'convicted_child_offence',
    'charged_child_offence',
    'convicted_general_offence',
    'charged_general_offence',
  ]).has(key);
  const hasEventDate = isOffence
    || (!isMilitary && !['national_security_risk', 'outstanding_debts'].includes(key));
  const fields = [];

  if (isService) {
    fields.push(rowField(repeaterId, 'country_of_service', 'Country of Service'));
    fields.push(rowField(repeaterId, 'country_of_deployment', 'Country of Deployment'));
  } else if (isTraining) {
    fields.push(rowField(repeaterId, 'country_of_training', 'Country of Training'));
  } else {
    fields.push(rowField(repeaterId, 'country', 'Country'));
  }

  if (hasEventDate) {
    fields.push(
      rowField(repeaterId, 'date_day', 'Date - Day'),
      rowField(repeaterId, 'date_month', 'Date - Month'),
      rowField(repeaterId, 'date_year', 'Date - Year')
    );
  }
  if (isMilitary) {
    for (const direction of ['from', 'to']) {
      const title = direction === 'from' ? 'Date From' : 'Date To';
      fields.push(
        rowField(repeaterId, `date_${direction}_day`, `${title} - Day`),
        rowField(repeaterId, `date_${direction}_month`, `${title} - Month`),
        rowField(repeaterId, `date_${direction}_year`, `${title} - Year`)
      );
    }
  }
  if (isOffence) fields.push(rowField(repeaterId, 'offence_type', 'Offence Type'));
  if (isTraining) {
    fields.push(rowField(repeaterId, 'training_type', 'Type of Training', {
      type: 'select',
      options: TRAINING_TYPE_OPTIONS,
    }));
  }
  if (isService) {
    fields.push(
      rowField(repeaterId, 'service_type', 'Type of Service', {
        type: 'select',
        options: SERVICE_TYPE_OPTIONS,
      }),
      rowField(repeaterId, 'organisation_name', 'Name of Organisation/Unit/Brigade Group'),
      rowField(repeaterId, 'position_rank', 'Position/Rank'),
      rowField(repeaterId, 'duties_description', 'Description of Duties', { type: 'textarea' })
    );
  }
  fields.push(rowField(repeaterId, 'details', 'Give details', { type: 'textarea' }));
  return fields;
}

function rebuildPartnerSponsorCharacter(page) {
  const questions = SPONSOR_CHARACTER_DECLARATIONS.flatMap(({ key, label }) => {
    const repeaterId = `${page.id}-${key}_details`;
    return [
      yesNoQuestion(page.id, key, label, true),
      {
        id: repeaterId,
        answerKey: `${key}_details`,
        label: 'Details',
        type: 'repeater',
        required: false,
        visibleIf: [{ field: key, op: 'equals', value: 'yes' }],
        metadata: {
          originalLabel: 'Details',
          fields: sponsorDetailFields(repeaterId, key),
        },
      },
    ];
  });
  return { ...page, questions };
}

const PROTECTION_CHOICE_FIELDS = {
  immigration_detention_details: {
    answerKey: 'location_type',
    label: 'Location Type',
    required: true,
    options: LOCATION_TYPE_OPTIONS,
  },
  military_training_details: {
    answerKey: 'training_type',
    label: 'Training Type',
    required: false,
    options: TRAINING_TYPE_OPTIONS,
  },
  military_service_details: {
    answerKey: 'service_type',
    label: 'Service Type',
    required: false,
    options: SERVICE_TYPE_OPTIONS,
  },
};

function addProtectionChoiceField(repeater) {
  const choice = PROTECTION_CHOICE_FIELDS[repeater.answerKey];
  if (!choice) return repeater;
  const fields = [...(repeater.metadata?.fields || [])];
  const choiceIndex = fields.findIndex(field => field.answerKey === choice.answerKey);
  const reviewedField = rowField(repeater.id, choice.answerKey, choice.label, {
    type: 'select',
    required: choice.required,
    options: choice.options,
  });
  if (choiceIndex >= 0) fields[choiceIndex] = reviewedField;
  else {
    const detailsIndex = fields.findIndex(field => field.answerKey === 'details');
    fields.splice(detailsIndex < 0 ? fields.length : detailsIndex, 0, reviewedField);
  }
  return { ...repeater, metadata: { ...repeater.metadata, fields } };
}

function rebuildProtectionCharacter(page) {
  const existingByAnswerKey = new Map(page.questions.map(question => [question.answerKey, question]));
  const pairedDetailKeys = new Set();
  const questions = [];
  for (const { key, detailsKey, label } of PROTECTION_CHARACTER_DECLARATIONS) {
    const details = existingByAnswerKey.get(detailsKey);
    questions.push(yesNoQuestion(page.id, key, label, false));
    if (!details) continue;
    pairedDetailKeys.add(detailsKey);
    questions.push(addProtectionChoiceField({
      ...details,
      visibleIf: [{ field: key, op: 'equals', value: 'yes' }],
    }));
  }
  questions.push(...page.questions.filter(question => !pairedDetailKeys.has(question.answerKey)));
  return { ...page, questions };
}

/** Restore Character controls expressed through custom client JSX and dialog forms. */
export function applyQuestionnaireBuiltInCharacter(pages = []) {
  return pages.map(page => {
    if (page.route === '/intake/partner/family-sponsor/character') {
      return rebuildPartnerSponsorCharacter(page);
    }
    if (page.route === '/intake/protection/all-applicants/character') {
      return rebuildProtectionCharacter(page);
    }
    return page;
  });
}
