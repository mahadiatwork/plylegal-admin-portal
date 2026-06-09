import { redirect } from "next/navigation";
import AdminLoginForm from "@/components/admin/AdminLoginForm";
import { getAdminSession, sanitizeNextPath } from "@/lib/adminSession";

export default async function LoginPage({ searchParams }) {
  const session = await getAdminSession();
  const resolvedSearchParams = await searchParams;
  const nextPath = sanitizeNextPath(
    Array.isArray(resolvedSearchParams?.next)
      ? resolvedSearchParams.next[0]
      : resolvedSearchParams?.next
  );

  if (session) {
    redirect(nextPath);
  }

  return <AdminLoginForm nextPath={nextPath} />;
}
