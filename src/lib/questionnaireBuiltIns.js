import { questionnaireBuiltInPages } from './questionnaireBuiltInPages.js';
import { temporaryWork482Definition } from './questionnaireStarterTemplates.js';
import { applyQuestionnaireBuiltInDetails } from './questionnaireBuiltInDetails.js';
import { applyQuestionnaireBuiltInIdentity } from './questionnaireBuiltInIdentity.js';
import { applyQuestionnaireBuiltInCharacter } from './questionnaireBuiltInCharacter.js';
import { applyQuestionnaireBuiltInChoices } from './questionnaireBuiltInChoices.js';
import { applyQuestionnaireBuiltInConditionalRules } from './questionnaireBuiltInConditionalRules.js';
import { applyQuestionnaireBuiltInProtectionEnrichment, applyProtectionRepeaterPresentationFallback } from './questionnaireBuiltInProtectionEnrichment.js';
import { mergeDatePartGroups, convertCountrySelects, applyRepeaterPresentationFallback } from './questionnaireBuiltInRecordEnrichment.js';
import { applyQuestionnaireBuiltInTemporaryWork482Enrichment, finalizeTemporaryWork482Enrichment } from './questionnaireBuiltInTemporaryWork482Enrichment.js';

export const QUESTIONNAIRE_LEGACY_CATALOG_VERSION = 3;

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
    pages = applyRepeaterPresentationFallback(pages, '/intake/temporary-work/');
  }
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
