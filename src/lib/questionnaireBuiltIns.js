import { questionnaireBuiltInPages } from './questionnaireBuiltInPages.js';
import { temporaryWork482Definition } from './questionnaireStarterTemplates.js';
import { applyQuestionnaireBuiltInDetails } from './questionnaireBuiltInDetails.js';
import { applyQuestionnaireBuiltInIdentity } from './questionnaireBuiltInIdentity.js';
import { applyQuestionnaireBuiltInChoices } from './questionnaireBuiltInChoices.js';
import { applyQuestionnaireBuiltInConditionalRules } from './questionnaireBuiltInConditionalRules.js';

export const QUESTIONNAIRE_LEGACY_CATALOG_VERSION = 2;

function builtInDefinition(visaType, visaContext, title) {
  const pages = applyQuestionnaireBuiltInConditionalRules(
    applyQuestionnaireBuiltInChoices(
      applyQuestionnaireBuiltInIdentity(
        applyQuestionnaireBuiltInDetails(structuredClone(questionnaireBuiltInPages.filter(page =>
          page.route.startsWith(`/intake/${visaType}/`) &&
          !(visaContext === '482' && /\/spouse-partner\/(education|language)$/.test(page.route))
        )))
      )
    )
  );
  if (visaType === 'temporary-work') {
    const character = structuredClone(temporaryWork482Definition.pages[0]);
    character.id = 'temporary-work-all-applicants-character';
    pages.push(character);
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
  builtInDefinition('partner', null, 'Partner Visa (Subclass 820)'),
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
