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
    pages: structuredClone(source.pages || []),
  };
}
