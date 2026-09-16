import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  ADMIN_SESSION_COOKIE,
  DEFAULT_ADMIN_PATH,
  createAdminSessionToken,
  getAdminSessionCookieOptions,
  sanitizeNextPath,
  verifyAdminKey,
  verifyAdminSessionToken,
} from "./adminSessionCore";

export {
  ADMIN_SESSION_COOKIE,
  createAdminSessionToken,
  getAdminSessionCookieOptions,
  sanitizeNextPath,
  verifyAdminKey,
  verifyAdminSessionToken,
};

export function setAdminSessionCookie(cookieStore) {
  const token = createAdminSessionToken();
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
