import AdminResourcesManager from "@/components/admin/AdminResourcesManager";
import { requireAdminSession } from "@/lib/adminSession";

export default async function LegacyResourcesPage() {
  await requireAdminSession("/admin/resources/legacy");
  return <AdminResourcesManager />;
}
