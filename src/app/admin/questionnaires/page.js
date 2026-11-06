import AdminQuestionnaireBuilder from "@/components/admin/AdminQuestionnaireBuilder";
import { requireAdminRole } from "@/lib/adminSession";
import { ADMIN_ROLES } from "@/lib/adminRoles";

export default async function AdminQuestionnairesPage({ searchParams }) {
  await requireAdminRole(ADMIN_ROLES.SUPER_ADMIN, "/admin/questionnaires");
  const query = await searchParams;
  const requestedLayout = Array.isArray(query?.layout) ? query.layout[0] : query?.layout;

  return <AdminQuestionnaireBuilder initialLayout={requestedLayout} />;
}
