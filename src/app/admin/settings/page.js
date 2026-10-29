import AdminSettings from "@/components/admin/AdminSettings";
import { publicAdminSession, requireAdminSession } from "@/lib/adminSession";

export default async function AdminSettingsPage() {
  const session = await requireAdminSession("/admin/settings");
  return <AdminSettings initialUser={publicAdminSession(session)} />;
}
