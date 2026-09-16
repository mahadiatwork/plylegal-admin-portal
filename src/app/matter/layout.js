import { requireAdminSession } from "@/lib/adminSession";

export default async function ProtectedMatterLayout({ children }) {
  await requireAdminSession("/");
  return children;
}
