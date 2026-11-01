import { redirect } from "next/navigation";
import { requireAdminSession } from "@/lib/adminSession";
import { canAccessQuestionnaireBuilder } from "@/lib/adminRoles";

export default async function Home() {
  const session = await requireAdminSession("/");
  redirect(canAccessQuestionnaireBuilder(session.role) ? "/admin/questionnaires" : "/admin/resources");
}
