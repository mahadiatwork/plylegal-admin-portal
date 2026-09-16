const attempts = new Map();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 8;

export function isSameOriginRequest(request) {
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    // Next may normalize request.url to its listening hostname (e.g. localhost)
    // while the browser uses 127.0.0.1 or a custom deployment domain.
    const target = new URL(request.url);
    const host = request.headers.get("host");
    if (host) target.host = host;
    return new URL(origin).origin === target.origin;
  } catch {
    return false;
  }
}

// Local throttling supplements the hosting provider's network rate limits.
export function consumeLoginAttempt(key, now = Date.now()) {
  for (const [entryKey, entry] of attempts) {
    if (entry.until <= now) attempts.delete(entryKey);
  }
  const entry = attempts.get(key) || { count: 0, until: now + WINDOW_MS };
  if (entry.count >= MAX_ATTEMPTS) return Math.ceil((entry.until - now) / 1000);
  if (!attempts.has(key) && attempts.size >= 10000) return 60;
  entry.count += 1;
  attempts.set(key, entry);
  return 0;
}

export function clearLoginAttempts(key) {
  attempts.delete(key);
}

export function loginAttemptKey(request) {
  // Vercel overwrites this header; arbitrary client-supplied X-Forwarded-For is not trusted.
  return process.env.VERCEL
    ? request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() || "unknown"
    : "local";
}
