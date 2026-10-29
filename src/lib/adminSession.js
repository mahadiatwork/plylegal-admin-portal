import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  ADMIN_SESSION_COOKIE,
  DEFAULT_ADMIN_PATH,
  createAdminSessionToken,
  getAdminSessionCookieOptions,
  sanitizeNextPath,
  isAdminLoginConfigured,
  verifyAdminSessionToken,
} from "./adminSessionCore";
import { isAdminRole } from "./adminRoles";

export {
  ADMIN_SESSION_COOKIE,
  createAdminSessionToken,
  getAdminSessionCookieOptions,
  sanitizeNextPath,
  isAdminLoginConfigured,
  verifyAdminSessionToken,
};

export function setAdminSessionCookie(cookieStore, identity) {
  const token = createAdminSessionToken(identity);
  cookieStore.set(ADMIN_SESSION_COOKIE, token, getAdminSessionCookieOptions());
  return token;
}

export function clearAdminSessionCookie(cookieStore) {
  cookieStore.set(ADMIN_SESSION_COOKIE, "", {
    ...getAdminSessionCookieOptions(),
    maxAge: 0,
  });
}

export async function getAdminSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifyAdminSessionToken(token);
}

export async function requireAdminSession(nextPath = DEFAULT_ADMIN_PATH) {
  const session = await getAdminSession();
  if (!session) {
    redirect(`/login?next=${encodeURIComponent(sanitizeNextPath(nextPath))}`);
  }
  return session;
}

export async function requireAdminRole(allowedRoles, nextPath = DEFAULT_ADMIN_PATH) {
  const session = await requireAdminSession(nextPath);
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
  if (!roles.every(isAdminRole) || !roles.includes(session.role)) {
    redirect("/");
  }
  return session;
}

export function publicAdminSession(session) {
  if (!session) return null;
  return {
    uid: session.sub,
    name: session.name,
    email: session.email,
    role: session.role,
    provider: session.provider,
    mustChangePassword: session.mustChangePassword,
  };
}
