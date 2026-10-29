import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  clearAdminSessionCookie,
  getAdminSession,
  isAdminLoginConfigured,
  publicAdminSession,
  sanitizeNextPath,
  setAdminSessionCookie,
} from "@/lib/adminSession";
import { AdminIdentityError, authenticateAdminIdentity } from "@/lib/adminIdentity";
import { clearLoginAttempts, consumeLoginAttempt, isSameOriginRequest, loginAttemptKey } from "@/lib/adminLoginProtection";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(body, status = 200, headers = {}) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

export async function GET() {
  const session = await getAdminSession();
  return session
    ? json({ success: true, user: publicAdminSession(session) })
    : json({ success: false, error: "Please sign in to continue." }, 401);
}

export async function POST(request) {
  if (!isSameOriginRequest(request)) return json({ success: false, error: "Invalid request origin." }, 403);
  if (!isAdminLoginConfigured()) {
    return json({ success: false, error: "Admin sign-in has not been configured. Please contact the portal administrator." }, 503);
  }
  const attemptKey = loginAttemptKey(request);
  const retryAfter = consumeLoginAttempt(attemptKey);
  if (retryAfter) {
    return json({ success: false, error: "Too many sign-in attempts. Please try again in a few minutes." }, 429, { "Retry-After": String(retryAfter) });
  }
  try {
    const body = await request.json().catch(() => null);
    const nextPath = sanitizeNextPath(body?.next);
    if (typeof body?.email !== "string" || typeof body?.password !== "string" ||
      !body.email.trim() || !body.password || body.email.length > 254 || body.password.length > 1024) {
      return json({ success: false, error: "Enter your email and password." }, 400);
    }
    const identity = await authenticateAdminIdentity(body.email, body.password);

    const cookieStore = await cookies();
    setAdminSessionCookie(cookieStore, identity);
    clearLoginAttempts(attemptKey);
    return json({
      success: true,
      nextPath: identity.mustChangePassword ? "/admin/settings" : nextPath,
      user: identity,
    });
  } catch (error) {
    if (error instanceof AdminIdentityError) {
      const configurationError = error.status === 503;
      return json({
        success: false,
        error: configurationError ? error.message : "The email or password is incorrect.",
      }, error.status);
    }
    console.error("Error creating admin session:", error);
    return json({ success: false, error: "Unable to sign in. Please try again." }, 500);
  }
}

export async function DELETE(request) {
  if (!isSameOriginRequest(request)) return json({ success: false, error: "Invalid request origin." }, 403);
  try {
    const cookieStore = await cookies();
    clearAdminSessionCookie(cookieStore);
    return json({ success: true });
  } catch (error) {
    console.error("Error clearing admin session:", error);
    return json({ success: false, error: "Unable to sign out. Please try again." }, 500);
  }
}
