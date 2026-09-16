"use client";

import { useEffect } from "react";

export default function AdminSessionMonitor() {
  useEffect(() => {
    let disposed = false;
    async function checkSession() {
      if (document.visibilityState === "hidden") return;
      try {
        const response = await fetch("/api/admin/session", { cache: "no-store" });
        if (response.status === 401 && !disposed) {
          window.location.replace(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
        }
      } catch {
        // A transient network failure should not sign out a valid session.
      }
    }
    checkSession();
    window.addEventListener("focus", checkSession);
    const interval = window.setInterval(checkSession, 60_000);
    return () => {
      disposed = true;
      window.removeEventListener("focus", checkSession);
      window.clearInterval(interval);
    };
  }, []);
  return null;
}
