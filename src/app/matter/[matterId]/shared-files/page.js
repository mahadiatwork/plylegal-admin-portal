import { redirect } from "next/navigation";

export default async function SharedFilesPage({ params }) {
  const { matterId } = await params;

  redirect(`/matter/${encodeURIComponent(matterId)}/resources`);
}
