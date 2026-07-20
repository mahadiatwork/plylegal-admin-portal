import { NextResponse } from "next/server";
import { db } from "@/lib/firebase-admin";
import { resolveMatterApplication } from "@/lib/matterResolver";
import zohoClient from "@/lib/zohoClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DOCUMENT_SOURCE = "documentReview";
const CORRECTIONS_RELATED_LIST = "Corrections";
const CORRECTION_FIELDS =
  "id,Name,Connected_To__s,Field_Name,Issue_description,Status,Created_Time,Modified_Time,Email,Secondary_Email,Matter";

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

function normalizeCorrectionStatus(status) {
  const value = cleanText(status).toLowerCase();
  return value === "resolved" || value === "closed" || value === "done" ? "resolved" : "open";
}

function serializeZohoCorrection(record) {
  const id = cleanText(record?.id);
  const fieldName = cleanText(record?.Field_Name);
  const name = cleanText(record?.Name);
  const body = cleanText(record?.Issue_description);

  return {
    id: `zohoCorrection:${id}`,
    zohoCorrectionId: id,
    source: DOCUMENT_SOURCE,
    origin: "zohoCorrections",
    path: fieldName || name || `Corrections.${id}`,
    label: fieldName || name || "Correction",
    body: body || name || "Correction submitted in Zoho CRM.",
    severity: "issue",
    status: normalizeCorrectionStatus(record?.Status),
    sectionKey: fieldName || "documentReview",
    authorName: cleanText(record?.Email) || cleanText(record?.Secondary_Email) || "",
    createdAt: record?.Created_Time || null,
    updatedAt: record?.Modified_Time || null,
  };
}

async function getZohoCorrections(resolved, matterId) {
  const dealId = getDealId(resolved?.application, matterId);
  if (!dealId) return [];

  const corrections = await zohoClient.getRelatedRecords(
    "Deals",
    dealId,
    CORRECTIONS_RELATED_LIST,
    CORRECTION_FIELDS
  );

  return corrections.filter((record) => record?.id).map(serializeZohoCorrection);
}

// GET /api/review-comments/[matterId] — list all comments for a matter
export async function GET(request, { params }) {
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

    if (sourceFilter === DOCUMENT_SOURCE) {
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
      authorId: source === "documentReview" ? "client" : "admin", // TODO: use actual user ID from auth
      authorName: source === "documentReview" ? "Client" : "Admin", // TODO: use actual user name from auth
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const docRef = await db
      .collection("applications")
      .doc(resolved.appId)
      .collection("reviewComments")
      .add(commentData);

    if (source !== "documentReview") {
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
