import AdminQuestionnaireBuilder from "@/components/admin/AdminQuestionnaireBuilder";
import { requireAdminRole } from "@/lib/adminSession";
import { ADMIN_ROLES } from "@/lib/adminRoles";

export default async function MatterQuestionnaireBuilderPage({ params }) {
  const { matterId } = await params;
  await requireAdminRole(ADMIN_ROLES.SUPER_ADMIN, `/matter/${matterId}/questionnaire-builder`);
  return <AdminQuestionnaireBuilder embeddedInMatter />;
}
