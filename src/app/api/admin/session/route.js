import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  clearAdminSessionCookie,
  sanitizeNextPath,
  setAdminSessionCookie,
  verifyAdminKey,
} from "@/lib/adminSession";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(error, status = 500, details = null) {
  return NextResponse.json({ success: false, error, details }, { status });
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const nextPath = sanitizeNextPath(body?.next);
    const adminKey = typeof body?.key === "string" ? body.key : "";

    if (!adminKey.trim()) {
      return errorResponse("Admin access key is required", 400);
    }

    if (!verifyAdminKey(adminKey)) {
      return errorResponse("Invalid admin access key", 401);
    }

    const cookieStore = await cookies();
    setAdminSessionCookie(cookieStore);

    return NextResponse.json({ success: true, nextPath });
  } catch (error) {
    console.error("Error creating admin session:", error);
    return errorResponse("Failed to create admin session", 500, error.message);
  }
}

export async function DELETE() {
  try {
    const cookieStore = await cookies();
    clearAdminSessionCookie(cookieStore);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error clearing admin session:", error);
    return errorResponse("Failed to clear admin session", 500, error.message);
  }
}
