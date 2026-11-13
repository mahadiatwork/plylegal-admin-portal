import { redirect } from "next/navigation";

export default async function SharedFolderPage({ params }) {
  const { matterId } = await params;
  redirect(`/matter/${encodeURIComponent(matterId)}/resources`);
}
