import { NextResponse } from "next/server";
import { db, initResult } from "@/lib/firebase-admin";
import { resolveMatterApplication } from "@/lib/matterResolver";
import zohoClient from "@/lib/zohoClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DOCUMENT_SOURCE = "documentReview";
const FINAL_FILE_FIELD = "Final_File_For_Visa_Submission";

function errorResponse(error, status = 500, details = null) {
  return NextResponse.json({ success: false, error, details }, { status });
}

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function getDealId(application, matterId) {
  return (
    cleanText(application?.zohoId) ||
    cleanText(application?.zohoDealId) ||
    cleanText(application?.dealId) ||
    (application?.id !== matterId ? cleanText(matterId) : "")
  );
}

function getWorkDriveResourceId(resourceData) {
  return (
    cleanText(resourceData?.workDriveResourceId) ||
    cleanText(resourceData?.workdriveResourceId) ||
    cleanText(resourceData?.workdriveId) ||
    cleanText(resourceData?.workDriveId) ||
    cleanText(resourceData?.workDriveFileId) ||
    cleanText(resourceData?.workdriveFileId) ||
    cleanText(resourceData?.resourceId)
  );
}

async function resolveMatter(matterId) {
  if (!db) {
    return {
      response: errorResponse(
        "Database not initialized",
        500,
        initResult?.error || "Unknown error"
      ),
    };
  }

  if (!matterId) {
    return { response: errorResponse("Matter ID is required", 400) };
  }

  const resolved = await resolveMatterApplication(db, matterId);
  if (!resolved) {
    return { response: errorResponse("Matter not found", 404) };
  }

  return { resolved };
}

export async function PATCH(request, { params }) {
  try {
    const { matterId, resourceId } = await params;

    if (!resourceId) {
      return errorResponse("Resource ID is required", 400);
    }

    const { resolved, response } = await resolveMatter(matterId);
    if (response) return response;

    const body = await request.json().catch(() => ({}));

    if (body.status && body.status !== "archived") {
      return errorResponse("Only archive updates are supported", 400);
    }

    const resourceRef = db
      .collection("applications")
      .doc(resolved.appId)
      .collection("resources")
      .doc(resourceId);
    const resourceSnap = await resourceRef.get();

    if (!resourceSnap.exists) {
      return errorResponse("Resource not found", 404);
    }

    const resourceData = resourceSnap.data() || {};
    const workDriveResourceId = getWorkDriveResourceId(resourceData);
    if (workDriveResourceId) {
      await zohoClient.deleteWorkDriveResource(workDriveResourceId);
    }

    const now = new Date();
    const applicationRef = db.collection("applications").doc(resolved.appId);
    const batch = db.batch();
    let documentReviewDealId = "";

    if (resourceData.source === DOCUMENT_SOURCE) {
      batch.set(
        applicationRef,
        {
          [FINAL_FILE_FIELD]: null,
          updatedAt: now,
        },
        { merge: true }
      );

      documentReviewDealId = getDealId(resolved.application, matterId);
    }

    batch.update(resourceRef, {
      status: "archived",
      archivedAt: now,
      updatedAt: now,
      archivedBy: "admin",
    });
    await batch.commit();

    if (documentReviewDealId) {
      await zohoClient.updateRecord("Deals", documentReviewDealId, {
        [FINAL_FILE_FIELD]: null,
      }).catch((clearError) => {
        console.error("Failed to clear document review URL from Zoho Deal:", clearError);
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error archiving resource:", error);
    return errorResponse("Failed to archive resource", 500, error.message);
  }
}
