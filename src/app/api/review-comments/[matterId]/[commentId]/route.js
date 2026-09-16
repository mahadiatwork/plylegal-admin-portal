import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import { db } from "@/lib/firebase-admin";
import { resolveMatterApplication } from "@/lib/matterResolver";
import zohoClient from "@/lib/zohoClient";
import {
  ZOHO_CORRECTION_MODULE,
  ZOHO_CORRECTION_NOTIFY_STATUS,
  ZOHO_CORRECTION_OPEN_STATUS,
  ZOHO_CORRECTION_PREFIX,
  ZOHO_CORRECTION_SUBFORM,
  areAllZohoCorrectionItemsDone,
  buildZohoCorrectionItemStatusUpdate,
  cleanText,
  fetchZohoCorrectionRecord,
  serializeZohoCorrection,
  zohoCorrectionBelongsToMatter,
} from "@/lib/zohoCorrections";

const REVIEW_COMMENT_STATUSES = new Set(["open", "resolved"]);

function getDealId(application, matterId) {
  return (
    cleanText(application?.zohoId) ||
    cleanText(application?.zohoDealId) ||
    cleanText(application?.dealId) ||
    (application?.id !== matterId ? cleanText(matterId) : "")
  );
}

function correctionError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

// PATCH /api/review-comments/[matterId]/[commentId] — update a comment (resolve, edit)
export async function PATCH(request, { params }) {
  if (!(await getAdminSession())) {
    return NextResponse.json(
      { success: false, error: "Admin session is required" },
      { status: 401 }
    );
  }

  try {
    const { matterId, commentId } = await params;
    const body = await request.json();

    if (!commentId) {
      return NextResponse.json(
        { success: false, error: "commentId is required" },
        { status: 400 }
      );
    }

    const resolved = await resolveMatter(matterId);
    if (!resolved?.appId) {
      return NextResponse.json({ success: false, error: "Application not found" }, { status: 404 });
    }

    if (commentId.startsWith(ZOHO_CORRECTION_PREFIX)) {
      const dealId = getDealId(resolved.application, matterId);
      const zohoCorrectionId = commentId.slice(ZOHO_CORRECTION_PREFIX.length);
      const action = cleanText(body.action);

      if (!zohoCorrectionId) {
        return NextResponse.json(
          { success: false, error: "Zoho correction cannot be resolved" },
          { status: 400 }
        );
      }

      const correctionRecord = await fetchZohoCorrectionRecord(zohoClient, zohoCorrectionId);

      if (!correctionRecord) {
        return NextResponse.json(
          { success: false, error: "Zoho correction was not found" },
          { status: 404 }
        );
      }

      if (!zohoCorrectionBelongsToMatter(correctionRecord, dealId)) {
        return NextResponse.json(
          { success: false, error: "Zoho correction does not belong to this matter" },
          { status: 404 }
        );
      }

      if (action === "updateCorrectionItemStatus") {
        let subformUpdate;

        try {
          subformUpdate = buildZohoCorrectionItemStatusUpdate(
            correctionRecord,
            body.itemId,
            body.status
          );
        } catch (error) {
          throw correctionError(error.message);
        }

        await zohoClient.updateRecord(ZOHO_CORRECTION_MODULE, zohoCorrectionId, {
          [ZOHO_CORRECTION_SUBFORM]: subformUpdate,
        });

        const updatedRecord =
          (await fetchZohoCorrectionRecord(zohoClient, zohoCorrectionId)) || correctionRecord;

        return NextResponse.json({
          success: true,
          correction: serializeZohoCorrection(updatedRecord),
        });
      }

      const wantsNotifyClient =
        action === "notifyClient" ||
        body.status === "resolved" ||
        body.status === ZOHO_CORRECTION_NOTIFY_STATUS;
      const wantsReopen = body.status === "open";

      if (!wantsNotifyClient && !wantsReopen) {
        return NextResponse.json(
          { success: false, error: "Status is invalid" },
          { status: 400 }
        );
      }

      if (wantsNotifyClient && !areAllZohoCorrectionItemsDone(correctionRecord)) {
        return NextResponse.json(
          {
            success: false,
            error: "All correction items must be Done before notifying the client",
          },
          { status: 409 }
        );
      }

      await zohoClient.updateRecord(ZOHO_CORRECTION_MODULE, zohoCorrectionId, {
        Status: wantsReopen ? ZOHO_CORRECTION_OPEN_STATUS : ZOHO_CORRECTION_NOTIFY_STATUS,
      });

      const updatedRecord =
        (await fetchZohoCorrectionRecord(zohoClient, zohoCorrectionId)) || correctionRecord;

      return NextResponse.json({
        success: true,
        correction: serializeZohoCorrection(updatedRecord),
      });
    }

    const commentRef = db
      .collection("applications")
      .doc(resolved.appId)
      .collection("reviewComments")
      .doc(commentId);

    const updateData = {
      updatedAt: new Date(),
    };

    if (body.status) {
      if (!REVIEW_COMMENT_STATUSES.has(body.status)) {
        return NextResponse.json(
          { success: false, error: "Status is invalid" },
          { status: 400 }
        );
      }
      updateData.status = body.status;
    }
    if (body.body) updateData.body = body.body;
    if (body.severity) updateData.severity = body.severity;

    await commentRef.update(updateData);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Error updating review comment:", err);
    const status = err.status || 500;
    return NextResponse.json(
      {
        success: false,
        error: status < 500 ? err.message : "Failed to update comment",
      },
      { status }
    );
  }
}

// DELETE /api/review-comments/[matterId]/[commentId] — delete a comment
export async function DELETE(request, { params }) {
  if (!(await getAdminSession())) {
    return NextResponse.json(
      { success: false, error: "Admin session is required" },
      { status: 401 }
    );
  }

  try {
    const { matterId, commentId } = await params;

    if (!commentId) {
      return NextResponse.json(
        { success: false, error: "commentId is required" },
        { status: 400 }
      );
    }

    const resolved = await resolveMatter(matterId);
    if (!resolved?.appId) {
      return NextResponse.json({ success: false, error: "Application not found" }, { status: 404 });
    }

    await db
      .collection("applications")
      .doc(resolved.appId)
      .collection("reviewComments")
      .doc(commentId)
      .delete();

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Error deleting review comment:", err);
    return NextResponse.json(
      { success: false, error: "Failed to delete comment" },
      { status: 500 }
    );
  }
}

// Helper: resolve Deal ID to Firebase doc ID. Firebase doc IDs are a fallback for
// older links, but deal fields are always checked first.
async function resolveMatter(matterId) {
  if (!matterId) return null;
  return resolveMatterApplication(db, matterId);
}
