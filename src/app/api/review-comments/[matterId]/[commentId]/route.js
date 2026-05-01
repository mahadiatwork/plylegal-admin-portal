import { NextResponse } from "next/server";
import { db } from "@/lib/firebase-admin";

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

// Helper: resolve matterId (Zoho Deal ID or Firebase doc ID) to Firebase doc ID
async function resolveAppId(matterId) {
  if (!matterId) return null;

  const directDoc = await db.collection("applications").doc(matterId).get();
  if (directDoc.exists) return matterId;

  const byZoho = await db
    .collection("applications")
    .where("zohoDealId", "==", matterId)
    .limit(1)
    .get();

  if (!byZoho.empty) return byZoho.docs[0].id;

  const byDealId = await db
    .collection("applications")
    .where("dealId", "==", matterId)
    .limit(1)
    .get();

  if (!byDealId.empty) return byDealId.docs[0].id;

  return null;
}
