import AdminResourcesManager from "@/components/admin/AdminResourcesManager";
import { requireAdminSession } from "@/lib/adminSession";

export default async function AdminResourcesPage() {
  await requireAdminSession("/admin/resources");
  return <AdminResourcesManager />;
}
