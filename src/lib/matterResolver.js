export async function resolveMatterApplication(db, matterId) {
  if (!db || !matterId) return null;

  const appsRef = db.collection("applications");
  const directDoc = await appsRef.doc(matterId).get();

  if (directDoc.exists) {
    return {
      appId: directDoc.id,
      appDoc: directDoc,
      application: { id: directDoc.id, ...directDoc.data() },
    };
  }

  const lookupFields = ["zohoId", "zohoDealId", "dealId"];

  for (const field of lookupFields) {
    const snapshot = await appsRef.where(field, "==", matterId).limit(1).get();
    if (!snapshot.empty) {
      const appDoc = snapshot.docs[0];
      return {
        appId: appDoc.id,
        appDoc,
        application: { id: appDoc.id, ...appDoc.data() },
      };
    }
  }

  return null;
}
