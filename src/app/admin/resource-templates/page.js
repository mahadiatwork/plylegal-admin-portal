import AdminResourceTemplatesManager from "@/components/admin/AdminResourceTemplatesManager";
import { requireAdminSession } from "@/lib/adminSession";

export default async function AdminResourceTemplatesPage() {
  await requireAdminSession("/admin/resource-templates");
  return <AdminResourceTemplatesManager />;
}
