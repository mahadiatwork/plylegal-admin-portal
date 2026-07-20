import { NextResponse } from "next/server";
import { db } from "@/lib/firebase-admin";
import { resolveMatterApplication } from "@/lib/matterResolver";
import zohoClient from "@/lib/zohoClient";

const REVIEW_COMMENT_STATUSES = new Set(["open", "resolved"]);
const ZOHO_CORRECTION_PREFIX = "zohoCorrection:";

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

// PATCH /api/review-comments/[matterId]/[commentId] — update a comment (resolve, edit)
export async function PATCH(request, { params }) {
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
      if (!body.status || !REVIEW_COMMENT_STATUSES.has(body.status)) {
        return NextResponse.json(
          { success: false, error: "Status is invalid" },
          { status: 400 }
        );
      }

      const dealId = getDealId(resolved.application, matterId);
      const zohoCorrectionId = commentId.slice(ZOHO_CORRECTION_PREFIX.length);

      if (!dealId || !zohoCorrectionId) {
        return NextResponse.json(
          { success: false, error: "Zoho correction cannot be resolved" },
          { status: 400 }
        );
      }

      await zohoClient.updateRelatedRecord("Deals", dealId, "Corrections", zohoCorrectionId, {
        Status: body.status === "resolved" ? "Resolved" : "Open",
      });

      return NextResponse.json({ success: true });
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
    return NextResponse.json(
      { success: false, error: "Failed to update comment" },
      { status: 500 }
    );
  }
}

// DELETE /api/review-comments/[matterId]/[commentId] — delete a comment
export async function DELETE(request, { params }) {
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
