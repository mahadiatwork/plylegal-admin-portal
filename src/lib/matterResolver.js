export async function resolveMatterApplication(db, matterId) {
  if (!db || !matterId) return null;

  const appsRef = db.collection("applications");
  const lookupFields = ["zohoId", "zohoDealId", "dealId"];

  for (const field of lookupFields) {
    const snapshot = await appsRef.where(field, "==", matterId).limit(1).get();
    if (!snapshot.empty) {
      const appDoc = snapshot.docs[0];
      return {
        appId: appDoc.id,
        appDoc,
        matchedBy: field,
        application: { id: appDoc.id, ...appDoc.data() },
      };
    }
  }

  const directDoc = await appsRef.doc(matterId).get();

  if (directDoc.exists) {
    return {
      appId: directDoc.id,
      appDoc: directDoc,
      matchedBy: "firebaseId",
      application: { id: directDoc.id, ...directDoc.data() },
    };
  }

  return null;
}
