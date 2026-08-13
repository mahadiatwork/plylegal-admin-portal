import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import { db, initResult } from "@/lib/firebase-admin";
import { resolveMatterApplication } from "@/lib/matterResolver";
import {
  getWorkDriveDirectDownloadUrl,
  isWorkDrivePublicFileUrl,
} from "@/lib/workDrivePreviewUrl.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(error, status = 500, details = null) {
  return NextResponse.json({ success: false, error, details }, { status });
}

function getUpstreamSignal(request) {
  return AbortSignal.any([request.signal, AbortSignal.timeout(30_000)]);
}

export async function GET(request, { params }) {
  try {
    if (!(await getAdminSession())) {
      return errorResponse("Admin session is required", 401);
    }

    if (!db) {
      return errorResponse(
        "Database not initialized",
        500,
        initResult?.error || "Unknown error"
      );
    }

    const { matterId, resourceId } = await params;
    const resolved = await resolveMatterApplication(db, matterId);
    if (!resolved) return errorResponse("Matter not found", 404);

    const resourceSnapshot = await db
      .collection("applications")
      .doc(resolved.appId)
      .collection("resources")
      .doc(resourceId)
      .get();

    if (!resourceSnapshot.exists) return errorResponse("Resource not found", 404);

    const resource = resourceSnapshot.data() || {};
    if (
      resource.type !== "file" ||
      resource.source !== "documentReview" ||
      resource.status === "archived"
    ) {
      return errorResponse("Resource not found", 404);
    }

    const directDownloadUrl = getWorkDriveDirectDownloadUrl(
      resource.downloadUrl ||
      resource.workDriveShareUrl ||
      resource.publicUrl ||
      resource.externalUrl ||
      resource.url
    );

    if (!directDownloadUrl) {
      return errorResponse("A WorkDrive preview is not available for this file", 502);
    }

    const range = request.headers.get("range");
    const rangeMatch = range?.match(/^bytes=(\d*)-(\d*)$/);
    const rangeStart = rangeMatch?.[1] ? Number(rangeMatch[1]) : null;
    const rangeEnd = rangeMatch?.[2] ? Number(rangeMatch[2]) : null;
    if (
      range &&
      (!rangeMatch ||
        (rangeStart === null && rangeEnd === null) ||
        (rangeStart !== null && rangeEnd !== null && rangeStart > rangeEnd))
    ) {
      return new Response(null, {
        status: 416,
        headers: resource.fileSize
          ? { "Content-Range": `bytes */${resource.fileSize}` }
          : {},
      });
    }

    const redirectResponse = await fetch(directDownloadUrl, {
      cache: "no-store",
      redirect: "manual",
      signal: getUpstreamSignal(request),
    });
    if (![301, 302, 303, 307, 308].includes(redirectResponse.status)) {
      await redirectResponse.body?.cancel();
      return errorResponse("WorkDrive did not return a preview file", 502);
    }

    const fileUrl = new URL(
      redirectResponse.headers.get("location") || "",
      directDownloadUrl
    );
    await redirectResponse.body?.cancel();

    if (!isWorkDrivePublicFileUrl(fileUrl.toString())) {
      return errorResponse("WorkDrive returned an invalid file URL", 502);
    }

    const upstream = await fetch(fileUrl, {
      cache: "no-store",
      headers: range ? { Range: range } : {},
      redirect: "error",
      signal: getUpstreamSignal(request),
    });

    if (upstream.status === 416) {
      const contentRange = upstream.headers.get("content-range");
      await upstream.body?.cancel();
      return new Response(null, {
        status: 416,
        headers: contentRange ? { "Content-Range": contentRange } : {},
      });
    }

    const contentType = upstream.headers.get("content-type")?.toLowerCase() || "";
    if (
      ![200, 206].includes(upstream.status) ||
      !upstream.body ||
      !contentType.startsWith("application/pdf")
    ) {
      await upstream.body?.cancel();
      return errorResponse("WorkDrive could not load the preview file", 502);
    }

    const headers = new Headers({
      "Cache-Control": "private, no-store",
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(
        resource.fileName || "preview"
      ).replaceAll("'", "%27")}`,
      "Content-Type": "application/pdf",
      "X-Content-Type-Options": "nosniff",
    });

    for (const name of ["accept-ranges", "content-length", "content-range", "etag", "last-modified"]) {
      const value = upstream.headers.get(name);
      if (value) headers.set(name, value);
    }

    return new Response(upstream.body, { status: upstream.status, headers });
  } catch (error) {
    console.error("Error resolving resource preview:", error);
    return errorResponse("Failed to load file preview", 500, error.message);
  }
}
