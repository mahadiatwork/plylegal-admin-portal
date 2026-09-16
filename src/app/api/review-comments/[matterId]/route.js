import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import { db } from "@/lib/firebase-admin";
import { resolveMatterApplication } from "@/lib/matterResolver";
import zohoClient from "@/lib/zohoClient";
import {
  DOCUMENT_REVIEW_SOURCE,
  ZOHO_CORRECTION_FIELDS,
  ZOHO_CORRECTION_RELATED_LIST,
  cleanText,
  hydrateZohoCorrectionRecord,
  serializeZohoCorrection,
} from "@/lib/zohoCorrections";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getDealId(application, matterId) {
  return (
    cleanText(application?.zohoId) ||
    cleanText(application?.zohoDealId) ||
    cleanText(application?.dealId) ||
    (application?.id !== matterId ? cleanText(matterId) : "")
  );
}

async function getZohoCorrections(resolved, matterId) {
  const dealId = getDealId(resolved?.application, matterId);
  if (!dealId) return [];

  const corrections = await zohoClient.getRelatedRecords(
    "Deals",
    dealId,
    ZOHO_CORRECTION_RELATED_LIST,
    ZOHO_CORRECTION_FIELDS
  );
  const hydratedCorrections = await Promise.all(
    corrections
      .filter((record) => record?.id)
      .map((record) => hydrateZohoCorrectionRecord(zohoClient, record))
  );

  return hydratedCorrections.map(serializeZohoCorrection);
}

// GET /api/review-comments/[matterId] — list all comments for a matter
export async function GET(request, { params }) {
  if (!(await getAdminSession())) {
    return NextResponse.json(
      { success: false, error: "Admin session is required" },
      { status: 401 }
    );
  }

  try {
    const { matterId } = await params;
    const sourceFilter = cleanText(new URL(request.url).searchParams.get("source"));

    const resolved = await resolveMatter(matterId);
    if (!resolved?.appId) {
      return NextResponse.json({ success: false, error: "Application not found" }, { status: 404 });
    }

    const snapshot = await db
      .collection("applications")
      .doc(resolved.appId)
      .collection("reviewComments")
      .orderBy("createdAt", "asc")
      .get();

    let comments = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate?.()?.toISOString() || null,
      updatedAt: doc.data().updatedAt?.toDate?.()?.toISOString() || null,
    }));

    if (sourceFilter) {
      comments = comments.filter((comment) => comment.source === sourceFilter);
    }

    if (sourceFilter === DOCUMENT_REVIEW_SOURCE) {
      comments = [...comments, ...(await getZohoCorrections(resolved, matterId))];
    }

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
  if (!(await getAdminSession())) {
    return NextResponse.json(
      { success: false, error: "Admin session is required" },
      { status: 401 }
    );
  }

  try {
    const { matterId } = await params;
    const body = await request.json();

    const {
      path,
      label,
      body: commentBody,
      severity = "suggestion",
      source = "questionnaire",
      documentUrl = "",
    } = body;

    if (!path || !commentBody) {
      return NextResponse.json(
        { success: false, error: "path and body are required" },
        { status: 400 }
      );
    }

    const resolved = await resolveMatter(matterId);
    if (!resolved?.appId) {
      return NextResponse.json({ success: false, error: "Application not found" }, { status: 404 });
    }

    // Derive sectionKey from path (first segment before any dot or bracket)
    const sectionKey = path.split(/[\.\[]/, 1)[0];

    const commentData = {
      path,
      label: label || "",
      body: commentBody,
      severity,
      source,
      documentUrl,
      status: "open",
      sectionKey,
      authorId: source === DOCUMENT_REVIEW_SOURCE ? "client" : "admin", // TODO: use actual user ID from auth
      authorName: source === DOCUMENT_REVIEW_SOURCE ? "Client" : "Admin", // TODO: use actual user name from auth
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const docRef = await db
      .collection("applications")
      .doc(resolved.appId)
      .collection("reviewComments")
      .add(commentData);

    if (source !== DOCUMENT_REVIEW_SOURCE) {
      // Create a notification for the applicant portal.
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
async function resolveMatter(matterId) {
  if (!matterId) return null;
  return resolveMatterApplication(db, matterId);
}
