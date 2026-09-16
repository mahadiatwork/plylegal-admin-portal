import {
  normalizeQuestionnaireDefinition,
  serializeQuestionnaireDefinitionDoc,
} from "./questionnaireDefinitions.js";

export function inferQuestionnaireAudience(application = {}, questionnaire = {}) {
  const description = [application.type, application.reference, application.visaTypeCode].filter(Boolean).join(" ").toLowerCase();
  const context = String(questionnaire.visaContext || application.visaContext || "");
  const visaContext = ["186", "482"].includes(context)
    ? context
    : /186|employer nomination/.test(description) ? "186"
      : /482|skills in demand/.test(description) ? "482" : undefined;
  const visaType = visaContext ? "temporary-work"
    : /866|protection/.test(description) ? "protection"
      : String(application.visaTypeCode || "").toLowerCase() || "partner";
  return { visaType, visaContext };
}

function contextsFor(definition) {
  return definition.visaContexts?.length ? definition.visaContexts
    : definition.visaContext ? [definition.visaContext] : [];
}

function milliseconds(value) {
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (Number.isFinite(value?.seconds)) return value.seconds * 1000;
  return Date.parse(value || "") || 0;
}

export function selectCurrentQuestionnaireDefinition(definitions, audience) {
  return definitions.filter((definition) => {
    const contexts = contextsFor(definition);
    return definition.status === "active" && definition.visaType === audience.visaType
      && (!contexts.length || contexts.includes(audience.visaContext));
  }).sort((left, right) =>
    Number(contextsFor(right).length > 0) - Number(contextsFor(left).length > 0)
    || milliseconds(right.updatedAt) - milliseconds(left.updatedAt)
    || String(right.version || "").localeCompare(String(left.version || ""), undefined, { numeric: true })
    || String(left.id).localeCompare(String(right.id))
  )[0] || null;
}

/** A partial published definition overrides its pages; other pages keep their built-in questions. */
export function mergeQuestionnaireReviewPages(builtIn, remote) {
  if (!remote) return builtIn;
  const pages = new Map((builtIn?.pages || []).map((page) => [page.route, page]));
  remote.pages.forEach((page) => {
    const fallback = pages.get(page.route);
    pages.set(page.route, {
      ...page,
      metadata: {
        ...page.metadata,
        navigationTitle: fallback?.metadata?.originalDisplayTitle || fallback?.title || page.title,
      },
    });
  });
  return { ...remote, pages: [...pages.values()].sort((a, b) => (a.order || 0) - (b.order || 0)) };
}

export async function loadQuestionnaireReviewDefinition(database, audience, builtIn, { timeoutMs = 10000 } = {}) {
  let timeout;
  try {
    const remote = (async () => {
      const snapshot = await database.collection("questionnaireDefinitions").where("status", "==", "active").get();
      const selected = selectCurrentQuestionnaireDefinition(
        snapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id })), audience
      );
      if (!selected) return null;
      const doc = snapshot.docs.find((candidate) => candidate.id === selected.id);
      const legacyPages = Object.hasOwn(selected, "pages") ? undefined
        : (await doc.ref.collection("pages").get()).docs.map((page) => ({ ...page.data(), id: page.id }));
      return normalizeQuestionnaireDefinition(serializeQuestionnaireDefinitionDoc(doc, legacyPages));
    })();
    const definition = await Promise.race([
      remote,
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error("Questionnaire template read timed out")), timeoutMs);
      }),
    ]);
    if (!definition) return { definition: builtIn, source: "built-in" };
    return { definition: mergeQuestionnaireReviewPages(builtIn, definition), source: "database" };
  } catch {
    // Template availability must never suppress the matter's saved answers.
    return { definition: builtIn, source: "built-in" };
  } finally {
    clearTimeout(timeout);
  }
}
