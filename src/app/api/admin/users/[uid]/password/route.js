import { NextResponse } from "next/server";
import { AdminIdentityError, resetPortalUserPassword } from "@/lib/adminIdentity";
import { getAdminSession } from "@/lib/adminSession";
import { canManageAdminUsers } from "@/lib/adminRoles";
import { isSameOriginRequest } from "@/lib/adminLoginProtection";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(body, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(request, { params }) {
  try {
    const session = await getAdminSession();
    if (!session) throw new AdminIdentityError("Admin session is required.", 401, "SESSION_REQUIRED");
    if (!canManageAdminUsers(session.role)) {
      throw new AdminIdentityError("Super admin access is required.", 403, "SUPER_ADMIN_REQUIRED");
    }
    if (!isSameOriginRequest(request)) {
      throw new AdminIdentityError("Invalid request origin.", 403, "INVALID_ORIGIN");
    }
    const { uid } = await params;
    if (uid === session.sub) {
      throw new AdminIdentityError("Use Change password for your own account.", 400, "USE_ACCOUNT_PASSWORD");
    }
    const body = await request.json().catch(() => null);
    const user = await resetPortalUserPassword(uid, body?.temporaryPassword);
    return json({ success: true, user });
  } catch (error) {
    if (error instanceof AdminIdentityError) {
      return json({ success: false, error: error.message, code: error.code }, error.status);
    }
    console.error("Error resetting admin portal user password:", error);
    return json({ success: false, error: "Unable to reset the password." }, 500);
  }
}
