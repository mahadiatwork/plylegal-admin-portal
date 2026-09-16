const YES_NO = [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }];
const choices = values => values.map(value => ({ value, label: value }));
function field(prefix, key, label, type = 'text', extra = {}) {
  return { id: `${prefix}-${key}`, answerKey: key, label, type, required: false, ...extra,
    metadata: { originalLabel: label, ...(extra.options ? { originalOptions: structuredClone(extra.options) } : {}), ...extra.metadata } };
}
function date(prefix, key, label, extra = {}) {
  return field(prefix, key, label, 'dateParts', { parts: { day: `${key}_day`, month: `${key}_month`, year: `${key}_year` }, ...extra });
}
const conditional = (field, value = 'yes') => [{ field, op: 'equals', value }];
function passportFields(prefix) {
  return [
    field(prefix, 'document_type', 'Type of Document', 'select', { options: choices(['Passport', 'Emergency Passport', 'Travel Document']) }),
    field(prefix, 'document_number', 'Passport/Document Number'),
    field(prefix, 'passport_country', 'Passport Country'),
    field(prefix, 'place_of_issue', 'Place of Issue / Issuing Authority'),
    field(prefix, 'nationality', 'Nationality'),
    field(prefix, 'gender', 'Gender as shown on this document', 'select', { options: choices(['Male', 'Female', 'X/Unspecified']) }),
    field(prefix, 'name', 'Name'),
    date(prefix, 'date_issued', 'Date of Issue'),
    field(prefix, 'is_original_date', 'Is this the Original Date of Issue?', 'yesNo', { options: YES_NO }),
    date(prefix, 'original_date', 'Original Date of Issue', { visibleIf: conditional('is_original_date', 'no') }),
    date(prefix, 'date_expiry', 'Date of Expiry'),
    field(prefix, 'document_status', 'Document Status', 'select', { options: choices(['Current', 'Expired', 'Lost', 'Stolen', 'Cancelled', 'Damaged']) }),
  ];
}
function nationalCardFields(prefix) {
  return [
    field(prefix, 'family_name', 'Family name'), field(prefix, 'given_names', 'Given names'),
    field(prefix, 'identification_number', 'Identification number'), field(prefix, 'country_of_issue', 'Country of issue'),
    date(prefix, 'date_issued', 'Date of issue (optional)'), date(prefix, 'date_expiry', 'Date of expiry (optional)'),
  ];
}
function setLabel(question, label) {
  return { ...question, label, metadata: { ...question.metadata, originalLabel: label } };
}

/** JSX, rather than obsolete zod fields, defines the current preserved client form. */
export function applyQuestionnaireBuiltInIdentity(pages) {
  return pages.map(page => {
    if (/\/temporary-work\/main-applicant\/other$/.test(page.route)) {
      const questions = page.questions.filter(question => ['has_other_names', 'other_names'].includes(question.answerKey));
      const records = questions.find(question => question.answerKey === 'other_names');
      if (records) records.visibleIf = conditional('has_other_names');
      return { ...page, questions };
    }
    if (!/\/(?:main-applicant|spouse-partner|children\/[^/]+)\/identity$/.test(page.route)) return page;
    const keys = new Set(page.questions.map(question => question.answerKey));
    const questions = page.questions.map(question => {
      switch (question.answerKey) {
        case 'has_passport':
          return { ...setLabel(question, 'Do you currently hold or have you ever held a Passport or Travel Document?'), type: 'yesNo', options: YES_NO, metadata: { ...question.metadata, group: 'Passport / Travel Document', originalLabel: 'Do you currently hold or have you ever held a Passport or Travel Document?', originalOptions: YES_NO } };
        case 'passports':
          return { ...setLabel(question, 'Passport / Travel Document'), visibleIf: conditional('has_passport'), metadata: { ...question.metadata, originalLabel: 'Passport / Travel Document', group: 'Passport / Travel Document', fields: passportFields(question.id) } };
        case 'has_national_id':
          return { ...setLabel(question, 'Do you have a National ID card?'), metadata: { ...question.metadata, originalLabel: 'Do you have a National ID card?', group: 'National Identity Document' } };
        case 'national_id_card':
          return { ...setLabel(question, 'National identity card'), visibleIf: conditional('has_national_id'), metadata: { ...question.metadata, originalLabel: 'National identity card', group: 'National Identity Document', collection: 'object', fields: nationalCardFields(question.id) } };
        case 'other_identity_documents':
          return { ...setLabel(question, 'Other Identity Documents'), ...(keys.has('has_other_identity_documents') ? { visibleIf: conditional('has_other_identity_documents') } : {}), metadata: { ...question.metadata, originalLabel: 'Other Identity Documents', group: 'Other Identity Documents' } };
        case 'stateless_explanation':
          return { ...question, visibleIf: conditional('citizen_of_country', 'no') };
        case 'ever_been_citizen':
          return { ...question, visibleIf: conditional('citizen_of_country', 'no') };
        case 'pr_countries':
          return { ...setLabel(question, 'Residence rights'), visibleIf: conditional('permanent_residency_rights'), metadata: { ...question.metadata, originalLabel: 'Residence rights', fields: [
            field(question.id, 'country', 'Country'),
            field(question.id, 'status', 'Residence right', 'select', { options: choices(['Permanent', 'Temporary']) }),
            date(question.id, 'expiry', 'Expiry date', { visibleIf: conditional('status', 'Temporary') }),
          ] } };
        default: return question;
      }
    });
    return { ...page, questions };
  });
}
