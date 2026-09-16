import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import { db, initResult } from "@/lib/firebase-admin";
import { normalizeMatterResourceOrder } from "@/lib/matterResources.mjs";
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

function isDocumentReviewFile(resourceData) {
  if (resourceData?.source !== DOCUMENT_SOURCE || resourceData?.type !== "file") {
    return false;
  }

  const mimeType = cleanText(resourceData.mimeType).toLowerCase();
  const fileName = cleanText(resourceData.fileName || resourceData.title);
  return mimeType === "application/pdf" || /\.pdf$/i.test(fileName);
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
    const session = await getAdminSession();
    if (!session) {
      return errorResponse("Admin session is required", 401);
    }
    const actor = session.role || "admin";

    const { matterId, resourceId } = await params;

    if (!resourceId) {
      return errorResponse("Resource ID is required", 400);
    }

    const { resolved, response } = await resolveMatter(matterId);
    if (response) return response;

    const body = await request.json().catch(() => ({}));

    const hasStatus = Object.prototype.hasOwnProperty.call(body, "status");
    const requestedStatus = cleanText(body.status).toLowerCase();
    if (hasStatus && requestedStatus !== "archived") {
      return errorResponse("Only archived status updates are supported", 400);
    }

    const resourcesRef = db
      .collection("applications")
      .doc(resolved.appId)
      .collection("resources");
    const resourceRef = resourcesRef.doc(resourceId);
    const isArchive = requestedStatus === "archived";

    if (!isArchive) {
      const resourceSnap = await resourceRef.get();
      if (!resourceSnap.exists) {
        return errorResponse("Resource not found", 404);
      }
      const resourceData = resourceSnap.data() || {};
      const updates = {};
      const now = new Date();

      if (Object.prototype.hasOwnProperty.call(body, "title")) {
        const title = cleanText(body.title);
        if (!title) return errorResponse("Resource title is required", 400);
        updates.title = title;
      }

      if (Object.prototype.hasOwnProperty.call(body, "category")) {
        const category = cleanText(body.category);
        if (!category) return errorResponse("Resource category is required", 400);
        updates.category = category;
      }

      if (Object.prototype.hasOwnProperty.call(body, "order")) {
        const order = normalizeMatterResourceOrder(body.order, null);
        if (order === null) return errorResponse("Resource order must be a number", 400);
        updates.order = order;
      }

      if (!Object.keys(updates).length) {
        return errorResponse("No supported fields were provided", 400);
      }

      updates.updatedAt = now;
      updates.updatedBy = actor;
      await resourceRef.update(updates);

      return NextResponse.json({
        success: true,
        resource: {
          id: resourceId,
          ...resourceData,
          ...updates,
          updatedAt: now.toISOString(),
        },
      });
    }

    const applicationRef = db.collection("applications").doc(resolved.appId);
    const archiveResult = await db.runTransaction(async (transaction) => {
      const currentSnapshot = await transaction.get(resourceRef);
      if (!currentSnapshot.exists) {
        throw Object.assign(new Error("Resource not found"), { status: 404 });
      }

      const resourceData = currentSnapshot.data() || {};
      const documentReviewFile = isDocumentReviewFile(resourceData);
      const workDriveResourceId = getWorkDriveResourceId(resourceData);
      let finalFileUrl = null;

      if (documentReviewFile) {
        const snapshot = await transaction.get(resourcesRef.orderBy("createdAt", "desc"));
        for (const doc of snapshot.docs) {
          const data = doc.data() || {};
          if (
            doc.id === resourceId ||
            !isDocumentReviewFile(data) ||
            data.status === "archived"
          ) {
            continue;
          }
          finalFileUrl =
            cleanText(data.publicUrl) ||
            cleanText(data.url) ||
            cleanText(data.externalUrl) ||
            cleanText(data.workDriveShareUrl) ||
            cleanText(data.downloadUrl) ||
            cleanText(data.workDrivePermalink) ||
            null;
          if (finalFileUrl) break;
        }
      }

      const now = new Date();
      if (documentReviewFile) {
        transaction.set(
          applicationRef,
          {
            [FINAL_FILE_FIELD]: finalFileUrl,
            updatedAt: now,
          },
          { merge: true }
        );
      }
      transaction.update(resourceRef, {
        status: "archived",
        archivedAt: now,
        updatedAt: now,
        archivedBy: actor,
        ...(workDriveResourceId || documentReviewFile
          ? { workDriveCleanupPending: true }
          : {}),
      });

      return { documentReviewFile, finalFileUrl, workDriveResourceId };
    });

    const { documentReviewFile, finalFileUrl, workDriveResourceId } =
      archiveResult;
    const documentReviewDealId = documentReviewFile
      ? getDealId(resolved.application, matterId)
      : "";
    if (documentReviewDealId) {
      try {
        await zohoClient.updateRecord("Deals", documentReviewDealId, {
          [FINAL_FILE_FIELD]: finalFileUrl,
        });
      } catch (updateError) {
        console.error("Failed to update document review URL on Zoho Deal:", updateError);
        return NextResponse.json(
          {
            success: false,
            archived: true,
            cleanupPending: true,
            error:
              "Resource is hidden from the client portal, but the Zoho document reference could not be updated. Retry cleanup.",
          },
          { status: 502 }
        );
      }
    }

    if (workDriveResourceId) {
      try {
        await zohoClient.deleteWorkDriveResource(workDriveResourceId);
      } catch (cleanupError) {
        console.error("Failed to delete archived WorkDrive resource:", cleanupError);
        return NextResponse.json(
          {
            success: false,
            archived: true,
            cleanupPending: true,
            error:
              "Resource is hidden from the client portal, but WorkDrive cleanup failed. Retry cleanup.",
          },
          { status: 502 }
        );
      }
    }

    if (workDriveResourceId || documentReviewFile) {
      try {
        await resourceRef.update({
          workDriveCleanupPending: false,
          workDriveCleanedAt: workDriveResourceId ? new Date() : null,
          updatedAt: new Date(),
          updatedBy: actor,
        });
      } catch (markerError) {
        console.error("Failed to clear archived resource cleanup marker:", markerError);
        return NextResponse.json(
          {
            success: false,
            archived: true,
            cleanupPending: true,
            error:
              "Resource cleanup completed, but its status could not be saved. Retry cleanup.",
          },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      success: true,
      ...(documentReviewFile ? { finalFileUrl } : {}),
    });
  } catch (error) {
    console.error("Error updating matter resource:", error);
    return errorResponse(
      error.status ? error.message : "Failed to update matter resource",
      error.status || 500,
      error.status ? null : error.message
    );
  }
}
