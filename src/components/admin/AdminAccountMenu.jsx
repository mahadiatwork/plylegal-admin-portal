"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, Loader2, LogOut, Settings } from "lucide-react";
import { adminRoleLabel } from "@/lib/adminRoles";

function initials(name, email) {
  const source = (name || email || "Staff").trim();
  const parts = source.split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? `${parts[0][0]}${parts.at(-1)[0]}` : source.slice(0, 2)).toUpperCase();
}

export default function AdminAccountMenu({ user }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [error, setError] = useState("");
  const menuRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return undefined;
    function closeMenu(event) {
      if (event.key === "Escape") setIsOpen(false);
      if (event.type === "mousedown" && !menuRef.current?.contains(event.target)) setIsOpen(false);
    }
    document.addEventListener("mousedown", closeMenu);
    document.addEventListener("keydown", closeMenu);
    return () => {
      document.removeEventListener("mousedown", closeMenu);
      document.removeEventListener("keydown", closeMenu);
    };
  }, [isOpen]);

  async function handleLogout() {
    try {
      setIsLoggingOut(true);
      setError("");
      const response = await fetch("/api/admin/session", { method: "DELETE" });
      if (!response.ok) throw new Error();
      window.location.replace("/login");
    } catch {
      setError("Unable to sign out. Please try again.");
      setIsLoggingOut(false);
    }
  }

  if (!user) return null;

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
        className="flex max-w-[18rem] items-center gap-3 rounded-xl border border-gray-200 bg-white px-2.5 py-2 text-left shadow-sm transition hover:border-[#a8c2b8] hover:bg-[#f7faf8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4F726B] focus-visible:ring-offset-2"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#e8f3ee] text-xs font-bold text-[#31564a]">
          {initials(user.name, user.email)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-[#17372e]">{user.name || "Staff member"}</span>
          <span className="block truncate text-xs font-medium text-gray-500">{user.email || "Deployment-managed account"}</span>
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-gray-500 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {isOpen ? (
        <div role="menu" className="absolute right-0 z-50 mt-2 w-72 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl">
          <div className="border-b border-gray-100 px-4 py-2.5">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#60786f]">{adminRoleLabel(user.role)}</p>
          </div>
          <div className="p-1.5">
            <Link
              role="menuitem"
              href="/admin/settings"
              onClick={() => setIsOpen(false)}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-[#294c41] hover:bg-[#edf7f2] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4F726B]"
            >
              <Settings className="h-4 w-4" />
              Settings
            </Link>
            <button
              role="menuitem"
              type="button"
              disabled={isLoggingOut}
              onClick={handleLogout}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-[#294c41] hover:bg-[#edf7f2] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4F726B] disabled:opacity-60"
            >
              {isLoggingOut ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
              {isLoggingOut ? "Signing out…" : "Log out"}
            </button>
          </div>
          {error ? <p role="alert" className="border-t border-red-100 bg-red-50 px-4 py-2 text-xs text-red-700">{error}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
