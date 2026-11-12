"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ExternalLink, Folder, RefreshCw } from "lucide-react";
import MatterTabLoadingState from "@/components/matter/MatterTabLoadingState";

export default function SharedFolderPage() {
  const { matterId } = useParams();
  const [folderUrl, setFolderUrl] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setIsLoading(true);
    setFolderUrl(null);
    setError("");
    async function loadFolder() {
      try {
        const response = await fetch(`/api/matter/${encodeURIComponent(matterId)}/shared-folder`, {
          cache: "no-store", signal: controller.signal,
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.success) throw new Error(data.error || "Unable to load the shared folder.");
        if (!controller.signal.aborted) setFolderUrl(data.folderUrl || null);
      } catch (loadError) {
        if (!controller.signal.aborted) setError(loadError.message);
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    }
    loadFolder();
    return () => controller.abort();
  }, [matterId, reloadKey]);

  if (isLoading) return <MatterTabLoadingState label="Loading shared folder…" />;

  return (
    <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-200 px-6 py-5">
        <div className="flex items-center gap-3">
          <Folder className="h-6 w-6 text-[#4F726B]" />
          <h1 className="text-xl font-semibold text-gray-900">Shared Folder</h1>
        </div>
        {folderUrl ? (
          <a href={folderUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-[#284d41] hover:bg-[#e8f3ee]">
            Open in WorkDrive <ExternalLink className="h-4 w-4" />
          </a>
        ) : null}
      </div>
      {error ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-4 p-6 text-sm text-red-700">
          <p>{error}</p>
          <button type="button" onClick={() => setReloadKey((key) => key + 1)} className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-4 py-2 font-medium hover:bg-red-50">
            <RefreshCw className="h-4 w-4" /> Try again
          </button>
        </div>
      ) : folderUrl ? (
        <iframe
          key={folderUrl}
          src={folderUrl}
          title="Matter shared WorkDrive folder"
          className="h-[76vh] min-h-[560px] w-full border-0 bg-white"
          referrerPolicy="strict-origin-when-cross-origin"
          sandbox="allow-downloads allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts"
          allow="fullscreen"
        />
      ) : (
        <div className="px-6 py-16 text-center">
          <Folder className="mx-auto h-12 w-12 text-gray-300" />
          <h2 className="mt-4 text-lg font-semibold text-gray-900">No shared folder linked yet</h2>
          <p className="mt-2 text-sm text-gray-500">Add the shared folder link to this matter in Zoho to display it here.</p>
        </div>
      )}
    </section>
  );
}
