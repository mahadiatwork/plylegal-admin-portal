import AdminQuestionnaireBuilder from "@/components/admin/AdminQuestionnaireBuilder";
import { requireAdminSession } from "@/lib/adminSession";

export default async function AdminQuestionnairesPage() {
  await requireAdminSession("/admin/questionnaires");
  return <AdminQuestionnaireBuilder />;
}
