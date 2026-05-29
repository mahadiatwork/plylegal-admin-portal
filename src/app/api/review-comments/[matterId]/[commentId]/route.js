import { NextResponse } from "next/server";
import { db } from "@/lib/firebase-admin";
import { resolveMatterApplication } from "@/lib/matterResolver";

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

    const appId = await resolveAppId(matterId);
    if (!appId) {
      return NextResponse.json({ success: false, error: "Application not found" }, { status: 404 });
    }

    const commentRef = db
      .collection("applications")
      .doc(appId)
      .collection("reviewComments")
      .doc(commentId);

    const updateData = {
      updatedAt: new Date(),
    };

    if (body.status) updateData.status = body.status;
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

    const appId = await resolveAppId(matterId);
    if (!appId) {
      return NextResponse.json({ success: false, error: "Application not found" }, { status: 404 });
    }

    await db
      .collection("applications")
      .doc(appId)
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
async function resolveAppId(matterId) {
  if (!matterId) return null;

  const resolved = await resolveMatterApplication(db, matterId);
  return resolved?.appId || null;
}
