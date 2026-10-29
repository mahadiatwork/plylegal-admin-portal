import { publicAdminSession, requireAdminSession } from "@/lib/adminSession";
import { AdminSessionProvider } from "@/components/admin/AdminSessionContext";

export default async function ProtectedMatterLayout({ children }) {
  const session = await requireAdminSession("/");
  return <AdminSessionProvider user={publicAdminSession(session)}>{children}</AdminSessionProvider>;
}
