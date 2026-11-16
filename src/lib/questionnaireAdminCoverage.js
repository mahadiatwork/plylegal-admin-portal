import { getBuiltInQuestionnaireDefinition } from "./questionnaireBuiltIns.js";
import { isDefinitionNavigation } from "./questionnaireNavigationModel.js";

function definitionVisaContext(definition) {
  return definition?.visaContexts?.[0] || definition?.visaContext;
}

/**
 * The client portal falls back to its built-in form when a saved definition
 * omits a route. Show those same fallback pages in the admin editor so every
 * client-facing section remains visible and editable.
 *
 * A definition-driven questionnaire (`navigation.mode === "definition"`) is the opposite: the
 * client shows only what the definition lists, with no built-in fallback. Padding it with the
 * built-in pages would silently re-add sections an administrator never chose (and made a blank
 * questionnaire impossible), so those definitions are returned exactly as saved.
 */
export function completeAdminQuestionnairePages(definition) {
  if (!definition || !Array.isArray(definition.pages)) return definition;
  if (isDefinitionNavigation(definition)) return definition;

  const builtIn = getBuiltInQuestionnaireDefinition({
    visaType: definition.visaType,
    visaContext: definitionVisaContext(definition),
  });
  if (!builtIn) return definition;

  const existingRoutes = new Set(definition.pages.map((page) => page.route));
  const missingPages = builtIn.pages.filter((page) => !existingRoutes.has(page.route));
  if (!missingPages.length) return definition;

  return {
    ...definition,
    pages: [...definition.pages, ...missingPages]
      .sort((left, right) => (left.order || 0) - (right.order || 0)),
  };
}
