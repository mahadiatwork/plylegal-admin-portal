import { countTrueCompletionKeys } from "@/lib/questionnaireProgress";

function timestampMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.toDate === "function") return value.toDate().getTime();
  if (value instanceof Date) return value.getTime();

  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function bestTimestamp(application, questionnaire, completion) {
  return Math.max(
    timestampMillis(application?.updatedAt),
    timestampMillis(application?.lastUpdated),
    timestampMillis(application?.createdAt),
    timestampMillis(questionnaire?.updatedAt),
    timestampMillis(questionnaire?.lastUpdated),
    timestampMillis(completion?.updatedAt),
    timestampMillis(completion?.lastUpdated)
  );
}

async function hydrateCandidate(appDoc, matchedBy) {
  const [questionnaireSnap, completionSnap] = await Promise.all([
    appDoc.ref.collection("data").doc("questionnaire").get(),
    appDoc.ref.collection("data").doc("completion").get(),
  ]);

  const application = appDoc.data() || {};
  const questionnaire = questionnaireSnap.exists ? questionnaireSnap.data() : {};
  const completion = completionSnap.exists ? completionSnap.data() : {};

  return {
    appId: appDoc.id,
    appDoc,
    matchedBy,
    application: { id: appDoc.id, ...application },
    duplicateScore: {
      updatedAt: bestTimestamp(application, questionnaire, completion),
      completedKeys: countTrueCompletionKeys(completion),
      profileCount: Array.isArray(questionnaire?.profiles) ? questionnaire.profiles.length : 0,
      hasQuestionnaire: questionnaireSnap.exists,
      hasCompletion: completionSnap.exists,
    },
  };
}

function compareCandidates(a, b) {
  const aScore = a.duplicateScore;
  const bScore = b.duplicateScore;

  return (
    bScore.updatedAt - aScore.updatedAt ||
    bScore.completedKeys - aScore.completedKeys ||
    bScore.profileCount - aScore.profileCount ||
    Number(bScore.hasQuestionnaire) - Number(aScore.hasQuestionnaire) ||
    Number(bScore.hasCompletion) - Number(aScore.hasCompletion) ||
    a.appId.localeCompare(b.appId)
  );
}

export async function resolveMatterApplication(db, matterId) {
  if (!db || !matterId) return null;

  const appsRef = db.collection("applications");

  const directDoc = await appsRef.doc(matterId).get();

  if (directDoc.exists) {
    return hydrateCandidate(directDoc, "firebaseId");
  }

  const lookupFields = ["zohoId", "zohoDealId", "dealId"];
  for (const field of lookupFields) {
    const snapshot = await appsRef.where(field, "==", matterId).limit(25).get();
    if (!snapshot.empty) {
      const candidates = await Promise.all(
        snapshot.docs.map((doc) => hydrateCandidate(doc, field))
      );
      candidates.sort(compareCandidates);
      return {
        ...candidates[0],
        duplicateCount: candidates.length,
        duplicateIds: candidates.map((candidate) => candidate.appId),
      };
    }
  }

  return null;
}
