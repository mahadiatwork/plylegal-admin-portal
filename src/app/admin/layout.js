import Link from "next/link";
import Image from "next/image";
import AdminNavigation from "@/components/admin/AdminNavigation";
import { publicAdminSession, requireAdminSession } from "@/lib/adminSession";

export default async function AdminLayout({ children }) {
  const session = await requireAdminSession("/");
  const user = publicAdminSession(session);
  return <div className="min-h-screen bg-[#E4E9FF]">
    <header className="border-b border-gray-100 bg-white">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-5 sm:px-6 lg:px-8">
        <Link href="/" aria-label="Ply Legal admin dashboard"><Image src="/Ply_Logo_black.png" alt="Ply Legal" width={156} height={52} className="h-auto w-36" /></Link>
        <AdminNavigation user={user} />
      </div>
    </header>
    <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">{children}</main>
  </div>;
}
