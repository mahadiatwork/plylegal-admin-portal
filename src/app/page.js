import AdminDashboard from "@/components/admin/AdminDashboard";
import { requireAdminSession } from "@/lib/adminSession";

export default async function Home() {
  await requireAdminSession("/");
  return <AdminDashboard />;
}
