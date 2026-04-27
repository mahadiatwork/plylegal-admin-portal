import { redirect } from "next/navigation";

export default async function MatterOverviewPage({ params }) {
  const { matterId } = await params;
  redirect(`/matter/${matterId}/questionnaire`);
}
