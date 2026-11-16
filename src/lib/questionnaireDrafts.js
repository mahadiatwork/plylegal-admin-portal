import { getBuiltInQuestionnaireDefinition } from "./questionnaireBuiltIns.js";
import { getLegacyQuestionnairePublishIssues } from "./questionnaireLegacyProtection.js";
import { isDefinitionNavigation } from "./questionnaireNavigationModel.js";

/** Start a separate draft without unpublishing the questionnaire clients use. */
export function createQuestionnaireDraft(source, id) {
  return {
    id,
    schemaVersion: source.schemaVersion || 1,
    title: source.title,
    version: source.version || "1.0.0",
    visaType: source.visaType,
    visaContexts: [...(source.visaContexts || (source.visaContext ? [source.visaContext] : []))],
    status: "draft",
    revision: 0,
    // Which groups the questionnaire includes (and their order) is part of the questionnaire.
    ...(source.navigation ? { navigation: structuredClone(source.navigation) } : {}),
    pages: structuredClone(source.pages || []),
  };
}

/** Copy an existing questionnaire into a draft for the selected CRM matter type. */
export function createQuestionnaireDraftForMatterType(source, id, matterType) {
  if (!matterType || source.visaType !== matterType.visaType) {
    throw new Error("Choose a questionnaire from the same visa family as the matter type.");
  }

  const draft = createQuestionnaireDraft(source, id);
  const sourceContexts = draft.visaContexts;
  // A definition-driven questionnaire lists exactly the sections its author chose; rebuilding it
  // from the other context's built-in template would discard them.
  const keepsOwnPages = isDefinitionNavigation(source);
  draft.visaContexts = [...matterType.visaContexts];
  if (draft.visaContexts.length === 1) draft.visaContext = draft.visaContexts[0];
  else delete draft.visaContext;

  if (
    keepsOwnPages ||
    matterType.visaType !== "temporary-work" ||
    (sourceContexts.length === draft.visaContexts.length &&
      sourceContexts.every((context) => draft.visaContexts.includes(context)))
  ) return draft;

  const target = getBuiltInQuestionnaireDefinition({
    visaType: matterType.visaType,
    visaContext: draft.visaContexts[0],
  });
  if (!target) throw new Error("The selected matter type has no questionnaire template.");

  const sourcePagesByRoute = new Map(draft.pages.map((page) => [page.route, page]));
  draft.pages = target.pages.map((targetPage, index) => {
    const sourcePage = sourcePagesByRoute.get(targetPage.route);
    if (!sourcePage) return structuredClone(targetPage);

    const candidate = {
      ...target,
      status: "active",
      pages: target.pages.map((page, pageIndex) => pageIndex === index ? sourcePage : page),
    };
    return structuredClone(
      getLegacyQuestionnairePublishIssues(candidate).length ? targetPage : sourcePage
    );
  });
  return draft;
}
