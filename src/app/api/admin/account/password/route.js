import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { AdminIdentityError, changeOwnPortalPassword } from "@/lib/adminIdentity";
import { getAdminSession, publicAdminSession, setAdminSessionCookie } from "@/lib/adminSession";
import { isSameOriginRequest } from "@/lib/adminLoginProtection";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(body, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(request) {
  try {
    if (!isSameOriginRequest(request)) return json({ success: false, error: "Invalid request origin." }, 403);
    const session = await getAdminSession();
    if (!session) return json({ success: false, error: "Admin session is required." }, 401);
    const body = await request.json().catch(() => null);
    if (!body || typeof body.currentPassword !== "string" || typeof body.newPassword !== "string" ||
      body.currentPassword.length > 1024 || body.newPassword.length > 128) {
      return json({ success: false, error: "Enter your current and new password." }, 400);
    }
    const identity = await changeOwnPortalPassword(session, body.currentPassword, body.newPassword);
    setAdminSessionCookie(await cookies(), identity);
    return json({ success: true, user: publicAdminSession({ ...identity, sub: identity.uid }) });
  } catch (error) {
    if (error instanceof AdminIdentityError) return json({ success: false, error: error.message }, error.status);
    console.error("Error changing admin portal password:", error);
    return json({ success: false, error: "Unable to change the password." }, 500);
  }
}
