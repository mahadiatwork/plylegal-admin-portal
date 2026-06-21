import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/adminSession";
import { db, initResult } from "@/lib/firebase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DOCUMENT_SOURCE = "documentReview";

function serializeTimestamp(value) {
  if (!value) return null;
  return value?.toDate?.()?.toISOString?.() || value;
}

function serializeApplication(appDoc) {
  if (!appDoc?.exists) return null;

  const data = appDoc.data() || {};
  return {
    id: appDoc.id,
    reference: data.reference || data.matterReference || data.name || data.Name || "",
    applicantName:
      data.applicantName ||
      data.clientName ||
      data.contactName ||
      data.fullName ||
      data.Name ||
      "",
    visaType: data.visaType || data.visaTypeCode || data.applicationType || "",
    zohoId: data.zohoId || data.zohoDealId || data.dealId || "",
  };
}

function serializeComment(doc, application) {
  const data = doc.data() || {};

  return {
    id: doc.id,
    applicationId: application?.id || "",
    matterId: application?.id || "",
    application,
    path: data.path || "",
    label: data.label || "",
    body: data.body || "",
    severity: data.severity || "issue",
    status: data.status || "open",
    source: data.source || "",
    documentUrl: data.documentUrl || "",
    authorName: data.authorName || "",
    createdAt: serializeTimestamp(data.createdAt),
    updatedAt: serializeTimestamp(data.updatedAt),
  };
}

export async function GET() {
  try {
    await requireAdminSession("/admin/document-review");

    if (!db) {
      return NextResponse.json(
        {
          success: false,
          error: "Database not initialized",
          details: initResult?.error || "Unknown error",
        },
        { status: 500 }
      );
    }

    const snapshot = await db
      .collectionGroup("reviewComments")
      .where("source", "==", DOCUMENT_SOURCE)
      .get();

    const applicationRefs = new Map();
    snapshot.docs.forEach((doc) => {
      const appRef = doc.ref.parent.parent;
      if (appRef) {
        applicationRefs.set(appRef.path, appRef);
      }
    });

    const applicationEntries = await Promise.all(
      Array.from(applicationRefs.entries()).map(async ([path, ref]) => [
        path,
        serializeApplication(await ref.get()),
      ])
    );
    const applicationsByPath = new Map(applicationEntries);

    const corrections = snapshot.docs
      .map((doc) => {
        const appRef = doc.ref.parent.parent;
        const application = appRef ? applicationsByPath.get(appRef.path) : null;
        return serializeComment(doc, application);
      })
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

    return NextResponse.json({ success: true, corrections });
  } catch (error) {
    console.error("Error loading document review corrections:", error);
    return NextResponse.json(
      { success: false, error: "Failed to load document review corrections" },
      { status: 500 }
    );
  }
}
