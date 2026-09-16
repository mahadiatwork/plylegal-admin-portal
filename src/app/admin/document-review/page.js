import AdminDocumentReviewManager from "@/components/admin/AdminDocumentReviewManager";
import { requireAdminSession } from "@/lib/adminSession";

export default async function AdminDocumentReviewPage() {
  await requireAdminSession("/admin/document-review");

  return <AdminDocumentReviewManager />;
}
