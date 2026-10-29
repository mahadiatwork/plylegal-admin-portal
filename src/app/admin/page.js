import { redirect } from "next/navigation";
import { requireAdminSession } from "@/lib/adminSession";
import { canAccessQuestionnaireBuilder } from "@/lib/adminRoles";

export default async function AdminIndexPage() {
  const session = await requireAdminSession("/admin");
  redirect(canAccessQuestionnaireBuilder(session.role) ? "/admin/questionnaires" : "/");
}
