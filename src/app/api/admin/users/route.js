import { NextResponse } from "next/server";
import { AdminIdentityError, createPortalUser, listPortalUsers } from "@/lib/adminIdentity";
import { getAdminSession } from "@/lib/adminSession";
import { canManageAdminUsers } from "@/lib/adminRoles";
import { isSameOriginRequest } from "@/lib/adminLoginProtection";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(body, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

async function requireSuperAdmin() {
  const session = await getAdminSession();
  if (!session) throw new AdminIdentityError("Admin session is required.", 401, "SESSION_REQUIRED");
  if (!canManageAdminUsers(session.role)) {
    throw new AdminIdentityError("Super admin access is required.", 403, "SUPER_ADMIN_REQUIRED");
  }
  return session;
}

function handleError(error, operation) {
  if (error instanceof AdminIdentityError) {
    return json({ success: false, error: error.message, code: error.code }, error.status);
  }
  console.error(`Error ${operation} admin portal users:`, error);
  return json({ success: false, error: `Unable to ${operation} users.` }, 500);
}

export async function GET() {
  try {
    await requireSuperAdmin();
    return json({ success: true, users: await listPortalUsers() });
  } catch (error) {
    return handleError(error, "load");
  }
}

export async function POST(request) {
  try {
    await requireSuperAdmin();
    if (!isSameOriginRequest(request)) {
      throw new AdminIdentityError("Invalid request origin.", 403, "INVALID_ORIGIN");
    }
    const body = await request.json().catch(() => null);
    if (!body) throw new AdminIdentityError("Request body must be valid JSON.", 400, "INVALID_JSON");
    const user = await createPortalUser(body);
    return json({ success: true, user }, 201);
  } catch (error) {
    return handleError(error, "create");
  }
}
