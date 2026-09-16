"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ArrowRight, ClipboardList, FileSearch, LibraryBig, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import AdminNavigation from "./AdminNavigation";

const tools = [
  { href: "/admin/questionnaires", title: "Questionnaires", icon: ClipboardList,
    description: "Add and edit questionnaire templates, questions, answer options and required fields. Save drafts and publish updates for clients.", action: "Manage questionnaires" },
  { href: "/admin/resources", title: "Resource Centre", icon: LibraryBig,
    description: "Organise reusable client resources by visa type and folder. Add files, links and notes, or change their order.", action: "Manage resources" },
  { href: "/admin/document-review", title: "Document review", icon: FileSearch,
    description: "Find client documents and review requests across matters.", action: "Open document review" },
];

export default function AdminDashboard() {
  const router = useRouter();
  const [matterId, setMatterId] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  function openMatter(event) {
    event.preventDefault();
    if (!matterId.trim()) return;
    setIsLoading(true);
    router.push(`/matter/${encodeURIComponent(matterId.trim())}/questionnaire`);
  }
  return <div className="min-h-screen bg-[#E4E9FF]">
    <header className="border-b border-gray-100 bg-white">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-5">
        <Image src="/Ply_Logo_black.png" alt="Ply Legal" width={156} height={52} className="h-auto w-36" priority />
        <AdminNavigation />
      </div>
    </header>
    <main className="mx-auto max-w-7xl px-6 py-10 sm:py-14">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#4F726B]">Ply Legal admin</p>
      <h1 className="mt-3 text-3xl font-semibold text-[#17372e]">Admin dashboard</h1>
      <p className="mt-3 text-gray-600">Manage what clients see, or open an individual matter.</p>
      <div className="mt-8 grid gap-5 lg:grid-cols-3">
        {tools.map(({ href, title, icon: Icon, description, action }) => <Link key={href} href={href}
          className="group flex flex-col rounded-2xl border border-white bg-white p-7 shadow-sm transition hover:border-[#8ac6ad] hover:shadow-md">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#e8f3ee] text-[#4F726B]"><Icon className="h-6 w-6" /></span>
          <h2 className="mt-5 text-xl font-semibold text-[#17372e]">{title}</h2>
          <p className="mb-6 mt-3 flex-1 text-sm leading-6 text-gray-600">{description}</p>
          <span className="flex items-center gap-2 text-sm font-semibold text-[#4F726B]">{action}<ArrowRight className="h-4 w-4" /></span>
        </Link>)}
      </div>
      <section className="mt-8 rounded-2xl bg-white p-7 shadow-sm">
        <h2 className="text-xl font-semibold text-[#17372e]">Open a matter</h2>
        <p className="mt-2 text-sm text-gray-600">View client answers, add matter-specific resources and review documents.</p>
        <form onSubmit={openMatter} className="mt-6 max-w-3xl">
          <label htmlFor="matterId" className="text-sm font-medium text-gray-700">Application ID or Zoho Deal ID</label>
          <div className="mt-2 flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1"><Search className="absolute left-3 top-3.5 h-5 w-5 text-gray-400" />
              <Input id="matterId" required value={matterId} onChange={(event) => setMatterId(event.target.value)}
                placeholder="Enter the matter’s application or deal ID" className="h-12 pl-10" />
            </div>
            <Button type="submit" disabled={isLoading || !matterId.trim()} className="h-12 bg-[#4F726B] text-white hover:bg-[#3c5b54]">
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}Open matter
            </Button>
          </div>
        </form>
      </section>
    </main>
  </div>;
}
