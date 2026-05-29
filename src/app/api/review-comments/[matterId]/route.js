import { NextResponse } from "next/server";
import { db } from "@/lib/firebase-admin";
import { resolveMatterApplication } from "@/lib/matterResolver";

// GET /api/review-comments/[matterId] — list all comments for a matter
export async function GET(request, { params }) {
  try {
    const { matterId } = await params;

    const appId = await resolveAppId(matterId);
    if (!appId) {
      return NextResponse.json({ success: false, error: "Application not found" }, { status: 404 });
    }

    const snapshot = await db
      .collection("applications")
      .doc(appId)
      .collection("reviewComments")
      .orderBy("createdAt", "asc")
      .get();

    const comments = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate?.()?.toISOString() || null,
      updatedAt: doc.data().updatedAt?.toDate?.()?.toISOString() || null,
    }));

    return NextResponse.json({ success: true, comments });
  } catch (err) {
    console.error("Error fetching review comments:", err);
    return NextResponse.json(
      { success: false, error: "Failed to fetch comments" },
      { status: 500 }
    );
  }
}

// POST /api/review-comments/[matterId] — create a new comment
export async function POST(request, { params }) {
  try {
    const { matterId } = await params;
    const body = await request.json();

    const { path, label, body: commentBody, severity = "suggestion" } = body;

    if (!path || !commentBody) {
      return NextResponse.json(
        { success: false, error: "path and body are required" },
        { status: 400 }
      );
    }

    const appId = await resolveAppId(matterId);
    if (!appId) {
      return NextResponse.json({ success: false, error: "Application not found" }, { status: 404 });
    }

    // Derive sectionKey from path (first segment before any dot or bracket)
    const sectionKey = path.split(/[\.\[]/, 1)[0];

    const commentData = {
      path,
      label: label || "",
      body: commentBody,
      severity,
      status: "open",
      sectionKey,
      authorId: "admin", // TODO: use actual admin user ID from auth
      authorName: "Admin", // TODO: use actual admin name from auth
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const docRef = await db
      .collection("applications")
      .doc(appId)
      .collection("reviewComments")
      .add(commentData);

    // Create a notification for the applicant portal
    try {
      await db.collection("notifications").add({
        applicationId: appId,
        type: "review_comment",
        title: "New reviewer note",
        body: `A reviewer added a note on "${label || path}"`,
        path,
        read: false,
        createdAt: new Date(),
      });
    } catch (notifErr) {
      console.warn("Failed to create notification:", notifErr.message);
    }

    return NextResponse.json({
      success: true,
      comment: {
        id: docRef.id,
        ...commentData,
        createdAt: commentData.createdAt.toISOString(),
        updatedAt: commentData.updatedAt.toISOString(),
      },
    });
  } catch (err) {
    console.error("Error creating review comment:", err);
    return NextResponse.json(
      { success: false, error: "Failed to create comment" },
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
