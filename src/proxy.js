import { NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE, sanitizeNextPath, verifyAdminSessionToken } from "./lib/adminSessionCore.js";
import { isSameOriginRequest } from "./lib/adminLoginProtection.js";

export function proxy(request) {
  const { pathname, search } = request.nextUrl;
  if (pathname === "/api/admin/session") return NextResponse.next();

  const session = verifyAdminSessionToken(request.cookies.get(ADMIN_SESSION_COOKIE)?.value);
  if (!session) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ success: false, error: "Admin session is required" }, {
        status: 401, headers: { "Cache-Control": "no-store" },
      });
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", sanitizeNextPath(`${pathname}${search}`));
    return NextResponse.redirect(loginUrl);
  }

  if (!["GET", "HEAD", "OPTIONS"].includes(request.method) && !isSameOriginRequest(request)) {
    return NextResponse.json({ success: false, error: "Invalid request origin." }, { status: 403 });
  }
  const response = NextResponse.next();
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = {
  matcher: ["/", "/admin/:path*", "/matter/:path*", "/api/:path*"],
};
