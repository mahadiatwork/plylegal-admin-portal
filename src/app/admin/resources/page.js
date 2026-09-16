import Link from "next/link";
import AdminResourceTemplatesManager from "@/components/admin/AdminResourceTemplatesManager";
import { requireAdminSession } from "@/lib/adminSession";

export default async function AdminResourcesPage() {
  await requireAdminSession("/admin/resources");
  return <>
    <AdminResourceTemplatesManager />
    <p className="mt-6 text-sm text-gray-600">Looking for older shared resources? <Link href="/admin/resources/legacy" className="font-medium text-[#4F726B] underline">Open the legacy library</Link>.</p>
  </>;
}
