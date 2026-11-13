import AdminQuestionnaireBuilder from "@/components/admin/AdminQuestionnaireBuilder";
import { requireAdminRole } from "@/lib/adminSession";
import { ADMIN_ROLES } from "@/lib/adminRoles";

export default async function MatterQuestionnaireBuilderPage({ params, searchParams }) {
  const { matterId } = await params;
  await requireAdminRole(ADMIN_ROLES.SUPER_ADMIN, `/matter/${matterId}/questionnaire-builder`);
  const query = await searchParams;
  const requestedLayout = Array.isArray(query?.layout) ? query.layout[0] : query?.layout;

  return <AdminQuestionnaireBuilder embeddedInMatter initialLayout={requestedLayout} />;
}
