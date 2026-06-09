import Link from "next/link";
import { ArrowLeft, LibraryBig } from "lucide-react";
import AdminLogoutButton from "@/components/admin/AdminLogoutButton";

export default function AdminLayout({ children }) {
  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,_#f4f8f6_0%,_#eef2f7_100%)]">
      <header className="border-b border-white/70 bg-white/75 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-4">
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-sm font-medium text-[#587267] transition-colors hover:text-[#17372e]"
            >
              <ArrowLeft className="h-4 w-4" />
              Portal home
            </Link>
            <div className="hidden h-6 w-px bg-[#dce6e1] sm:block" />
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#285646] text-white shadow-sm">
                <LibraryBig className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#70877e]">
                  Admin Workspace
                </p>
                <p className="truncate text-sm font-semibold text-[#17372e]">
                  Shared Resource Management
                </p>
              </div>
            </div>
          </div>

          <AdminLogoutButton />
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
}
