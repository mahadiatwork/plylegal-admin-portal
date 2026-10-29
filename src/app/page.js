import AdminDashboard from "@/components/admin/AdminDashboard";
import { publicAdminSession, requireAdminSession } from "@/lib/adminSession";

export default async function Home() {
  const session = await requireAdminSession("/");
  return <AdminDashboard user={publicAdminSession(session)} />;
}
