import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  clearAdminSessionCookie,
  getAdminSession,
  isAdminLoginConfigured,
  sanitizeNextPath,
  setAdminSessionCookie,
  verifyAdminCredentials,
} from "@/lib/adminSession";
import { clearLoginAttempts, consumeLoginAttempt, isSameOriginRequest, loginAttemptKey } from "@/lib/adminLoginProtection";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(body, status = 200, headers = {}) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

export async function GET() {
  const session = await getAdminSession();
  return session
    ? json({ success: true, username: session.sub })
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
    if (typeof body?.username !== "string" || typeof body?.password !== "string" ||
      !body.username.trim() || !body.password || body.username.length > 200 || body.password.length > 1024) {
      return json({ success: false, error: "Enter your username and password." }, 400);
    }
    if (!verifyAdminCredentials(body.username, body.password)) {
      return json({ success: false, error: "The username or password is incorrect." }, 401);
    }

    const cookieStore = await cookies();
    setAdminSessionCookie(cookieStore);
    clearLoginAttempts(attemptKey);
    return json({ success: true, nextPath });
  } catch (error) {
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
