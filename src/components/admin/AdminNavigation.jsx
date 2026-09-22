"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardList, LayoutDashboard } from "lucide-react";
import AdminLogoutButton from "./AdminLogoutButton";
import AdminSessionMonitor from "./AdminSessionMonitor";

const links = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/questionnaires", label: "Questionnaires", icon: ClipboardList },
];

export default function AdminNavigation() {
  const pathname = usePathname();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <AdminSessionMonitor />
      <nav aria-label="Admin navigation" className="flex flex-wrap items-center gap-1">
        {links.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === href : pathname.startsWith(href);
          return <Link key={href} href={href} aria-current={active ? "page" : undefined}
            className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4F726B] focus-visible:ring-offset-2 ${active ? "bg-[#e8f3ee] text-[#284d41] hover:bg-[#d9eee2]" : "text-gray-600 hover:bg-[#e8f3ee] hover:text-[#284d41]"}`}>
            <Icon className="h-4 w-4" /><span>{label}</span>
          </Link>;
        })}
      </nav>
      <AdminLogoutButton />
    </div>
  );
}
