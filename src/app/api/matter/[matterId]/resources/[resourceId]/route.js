import { NextResponse } from "next/server";
import { db, initResult } from "@/lib/firebase-admin";
import { resolveMatterApplication } from "@/lib/matterResolver";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(error, status = 500, details = null) {
  return NextResponse.json({ success: false, error, details }, { status });
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

    await resourceRef.update({
      status: "archived",
      archivedAt: new Date(),
      updatedAt: new Date(),
      archivedBy: "admin",
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error archiving resource:", error);
    return errorResponse("Failed to archive resource", 500, error.message);
  }
}
