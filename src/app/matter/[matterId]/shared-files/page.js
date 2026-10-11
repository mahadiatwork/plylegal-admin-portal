"use client";

import { useParams } from "next/navigation";
import { MatterResourcesManager } from "../resources/page";

export default function SharedFilesPage() {
  const params = useParams();
  const matterId = params.matterId;

  return (
    <MatterResourcesManager
      key={matterId}
      matterId={matterId}
      resourceSource="sharedFiles"
      pageTitle="Shared Files"
    />
  );
}
