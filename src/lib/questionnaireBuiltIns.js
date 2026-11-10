import { questionnaireBuiltInPages } from './questionnaireBuiltInPages.js';
import { temporaryWork482Definition } from './questionnaireStarterTemplates.js';
import { applyQuestionnaireBuiltInDetails } from './questionnaireBuiltInDetails.js';
import { applyQuestionnaireBuiltInIdentity } from './questionnaireBuiltInIdentity.js';
import { applyQuestionnaireBuiltInCharacter } from './questionnaireBuiltInCharacter.js';
import { applyQuestionnaireBuiltInChoices } from './questionnaireBuiltInChoices.js';
import { applyQuestionnaireBuiltInConditionalRules } from './questionnaireBuiltInConditionalRules.js';
import { applyQuestionnaireBuiltInProtectionEnrichment, applyProtectionRepeaterPresentationFallback } from './questionnaireBuiltInProtectionEnrichment.js';
import { mergeDatePartGroups, convertCountrySelects } from './questionnaireBuiltInRecordEnrichment.js';
import { applyQuestionnaireBuiltInTemporaryWork482Enrichment, finalizeTemporaryWork482Enrichment } from './questionnaireBuiltInTemporaryWork482Enrichment.js';
import { applyQuestionnaireBuiltInTemporaryWork186Enrichment, finalizeTemporaryWork186Enrichment } from './questionnaireBuiltInTemporaryWork186Enrichment.js';
import { applyTemporaryWorkRepeaterPresentationFallback } from './questionnaireBuiltInTemporaryWorkEnrichment.js';
import { applyQuestionnaireBuiltInPartnerEnrichment, finalizePartnerEnrichment, applyPartnerRepeaterPresentationFallback } from './questionnaireBuiltInPartnerEnrichment.js';

export const QUESTIONNAIRE_LEGACY_CATALOG_VERSION = 4;

const TEMPORARY_WORK_SHARED_ROUTE_ORDER = [
  '/intake/temporary-work/main-applicant/details',
  '/intake/temporary-work/main-applicant/other',
  '/intake/temporary-work/main-applicant/identity',
  '/intake/temporary-work/main-applicant/contact-details',
  '/intake/temporary-work/main-applicant/employment',
  '/intake/temporary-work/main-applicant/education',
  '/intake/temporary-work/main-applicant/skills',
  '/intake/temporary-work/main-applicant/language',
  '/intake/temporary-work/spouse-partner/details',
  '/intake/temporary-work/spouse-partner/other-details',
  '/intake/temporary-work/spouse-partner/identity',
  '/intake/temporary-work/children/child-profile/details',
  '/intake/temporary-work/children/child-profile/other',
  '/intake/temporary-work/children/child-profile/identity',
  '/intake/temporary-work/children/child-profile/custody',
  '/intake/temporary-work/non-migrating/member-profile/details',
  '/intake/temporary-work/non-migrating/member-profile/passport',
  '/intake/temporary-work/non-migrating/member-profile/identity',
  '/intake/temporary-work/non-migrating/member-profile/other-names',
  '/intake/temporary-work/non-migrating/member-profile/citizenship',
  '/intake/temporary-work/non-migrating/member-profile/health',
  '/intake/temporary-work/all-applicants/visas',
  '/intake/temporary-work/all-applicants/travel-history',
  '/intake/temporary-work/all-applicants/countries-of-residence',
  '/intake/temporary-work/all-applicants/health',
  '/intake/temporary-work/all-applicants/character',
];

function orderTemporaryWorkPages(pages, visaContext) {
  const order = visaContext === '186'
    ? [
        ...TEMPORARY_WORK_SHARED_ROUTE_ORDER.slice(0, 10),
        '/intake/temporary-work/spouse-partner/education',
        '/intake/temporary-work/spouse-partner/language',
        ...TEMPORARY_WORK_SHARED_ROUTE_ORDER.slice(10),
      ]
    : TEMPORARY_WORK_SHARED_ROUTE_ORDER;
  const routeOrder = new Map(order.map((route, index) => [route, index]));
  return [...pages].sort((left, right) => (routeOrder.get(left.route) ?? Number.MAX_SAFE_INTEGER) - (routeOrder.get(right.route) ?? Number.MAX_SAFE_INTEGER));
}

function builtInDefinition(visaType, visaContext, title) {
  let sourcePages = structuredClone(questionnaireBuiltInPages.filter(page =>
    page.route.startsWith(`/intake/${visaType}/`) &&
    !(visaContext === '482' && /\/spouse-partner\/(education|language)$/.test(page.route))
  ));
  if (visaType === 'protection') {
    sourcePages = applyQuestionnaireBuiltInProtectionEnrichment(sourcePages);
  }
  if (visaType === 'temporary-work' && visaContext === '482') {
    sourcePages = applyQuestionnaireBuiltInTemporaryWork482Enrichment(sourcePages);
  }
  if (visaType === 'temporary-work' && visaContext === '186') {
    sourcePages = applyQuestionnaireBuiltInTemporaryWork186Enrichment(sourcePages);
  }
  if (visaType === 'partner') {
    sourcePages = applyQuestionnaireBuiltInPartnerEnrichment(sourcePages);
  }
  let pages = applyQuestionnaireBuiltInConditionalRules(
    applyQuestionnaireBuiltInChoices(
      applyQuestionnaireBuiltInCharacter(
        applyQuestionnaireBuiltInIdentity(
          applyQuestionnaireBuiltInDetails(sourcePages)
        )
      )
    )
  );
  if (visaType === 'protection') {
    pages = pages.map((page) => ({ ...page, questions: mergeDatePartGroups(page.questions) }));
    pages = pages.map((page) => ({ ...page, questions: convertCountrySelects(page.questions) }));
    pages = applyProtectionRepeaterPresentationFallback(pages);
  }
  if (visaType === 'temporary-work' && visaContext === '482') {
    pages = finalizeTemporaryWork482Enrichment(pages);
    pages = applyTemporaryWorkRepeaterPresentationFallback(pages);
  }
  if (visaType === 'temporary-work' && visaContext === '186') {
    pages = finalizeTemporaryWork186Enrichment(pages);
    pages = applyTemporaryWorkRepeaterPresentationFallback(pages);
  }
  if (visaType === 'partner') {
    pages = finalizePartnerEnrichment(pages);
    pages = applyPartnerRepeaterPresentationFallback(pages);
  }
  if (visaType === 'temporary-work') {
    const character = structuredClone(temporaryWork482Definition.pages[0]);
    character.id = 'temporary-work-all-applicants-character';
    pages.push(character);
    pages = orderTemporaryWorkPages(pages, visaContext);
  }
  const preserveDisplayBaseline = question => {
    if (question.metadata?.originalLabel && question.metadata.originalLabel !== question.label) {
      question.metadata.originalDisplayLabel = question.label;
    }
    question.metadata?.fields?.forEach(preserveDisplayBaseline);
    question.followUps?.forEach(preserveDisplayBaseline);
  };
  pages.filter(page => page.metadata?.renderer === 'legacy').forEach(page => {
    page.metadata.originalDisplayTitle = page.title;
    if (page.route.includes('/non-migrating/member-profile/')) {
      page.metadata.titleIncludesPerson = true;
      page.metadata.titleTemplate = `${page.title} — {profileName}`;
    }
    if (/\/(?:main-applicant|spouse-partner|children\/[^/]+)\/details$/.test(page.route)) page.metadata.titleIncludesPerson = true;
    page.questions.forEach(preserveDisplayBaseline);
  });
  return {
    id: `built-in-${visaType}${visaContext ? `-${visaContext}` : ''}`,
    title,
    visaType,
    ...(visaContext ? { visaContext, visaContexts: [visaContext] } : { visaContexts: [] }),
    version: '1.0.0', status: 'active', schemaVersion: 1, revision: 0,
    pages: pages.map((page, index) => ({
      ...page,
      order: (index + 1) * 10,
      metadata: {
        ...page.metadata,
        legacyCatalogVersion: QUESTIONNAIRE_LEGACY_CATALOG_VERSION,
      },
    })),
  };
}

// These immutable source templates remain bundled even when Firebase is unavailable.
// Administrators create independent drafts; saving templates never writes client answers.
export const questionnaireBuiltInTemplates = [
  builtInDefinition('temporary-work', '482', 'Skills in Demand Visa (482)'),
  builtInDefinition('temporary-work', '186', 'Employer Nomination Visa (186)'),
  builtInDefinition('partner', null, 'Partner Visa Questionnaire (Subclasses 820/801/309/100)'),
  builtInDefinition('protection', null, 'Protection Visa (Subclass 866)'),
];

export function getBuiltInQuestionnaireDefinition({ visaType = 'temporary-work', visaContext } = {}) {
  const context = visaType === 'temporary-work' ? String(visaContext || '482') : null;
  return questionnaireBuiltInTemplates.find(definition =>
    definition.visaType === visaType && (!context || definition.visaContext === context)
  ) || null;
}

export function getBuiltInQuestionnairePage(id) {
  return questionnaireBuiltInTemplates.flatMap(definition => definition.pages)
    .find(page => page.metadata?.builtInPageId === id) || null;
}
