import AdminQuestionnaireBuilder from "@/components/admin/AdminQuestionnaireBuilder";
import { requireAdminRole } from "@/lib/adminSession";
import { ADMIN_ROLES } from "@/lib/adminRoles";

export default async function AdminQuestionnairesPage() {
  await requireAdminRole(ADMIN_ROLES.SUPER_ADMIN, "/admin/questionnaires");
  return <AdminQuestionnaireBuilder />;
}
