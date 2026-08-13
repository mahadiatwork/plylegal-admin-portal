"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  AlertCircle,
  Archive,
  CheckCircle2,
  Download,
  Code2,
  Eye,
  ExternalLink,
  FileText,
  FolderPlus,
  Library,
  Link2,
  Loader2,
  Search,
  StickyNote,
  UploadCloud,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import AdminResourceTemplatesManager from "@/components/admin/AdminResourceTemplatesManager";
import { getWorkDrivePreviewUrl } from "@/lib/workDrivePreviewUrl.mjs";

const RESOURCE_TABS = [
  {
    id: "shared",
    label: "All Matters",
    subtitle: "Reusable resources",
    icon: Library,
  },
  {
    id: "individual",
    label: "Only This Matter",
    subtitle: "Matter-specific resources",
    icon: FileText,
  },
];

const addResourceActions = [
  { id: "file", label: "File", icon: UploadCloud, enabled: true },
  { id: "note", label: "Note", icon: StickyNote, enabled: true },
  { id: "embed", label: "Embed", icon: Code2, enabled: false },
  { id: "link", label: "Link", icon: Link2, enabled: true },
  { id: "library", label: "Library", icon: Library, enabled: false },
  { id: "folder", label: "Folder", icon: FolderPlus, enabled: false },
];

function formatFileSize(bytes) {
  if (!bytes) return "";
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size.toFixed(size >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function resourceMatches(resource, query) {
  if (!query.trim()) return true;
  const lowerQuery = query.toLowerCase();
  return [
    resource.title,
    resource.description,
    resource.noteText,
    resource.content,
    resource.fileName,
    resource.url,
    resource.publicUrl,
  ]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(lowerQuery));
}

function ResourceIcon({ type }) {
  const isFile = type === "file";
  const isNote = type === "note";
  const Icon = isFile ? FileText : isNote ? StickyNote : Link2;
  return (
    <div
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border ${
        isFile
          ? "border-emerald-100 bg-emerald-50 text-[#4F726B]"
          : isNote
            ? "border-amber-100 bg-amber-50 text-amber-700"
            : "border-blue-100 bg-blue-50 text-blue-700"
      }`}
    >
      <Icon className="h-5 w-5" />
    </div>
  );
}

function ResourceRow({ resource, archiveId, onArchive, tabId }) {
  const url = resource.publicUrl || resource.url;
  const previewUrl =
    resource.type === "file"
      ? getWorkDrivePreviewUrl(resource.workDriveShareUrl) ||
        getWorkDrivePreviewUrl(resource.publicUrl) ||
        getWorkDrivePreviewUrl(resource.url) ||
        getWorkDrivePreviewUrl(resource.downloadUrl)
      : "";
  const downloadUrl = resource.downloadUrl || url;
  const isArchiving = archiveId === `${tabId}:${resource.id}`;

  return (
    <div className="flex flex-col gap-4 border-b border-gray-100 px-5 py-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 gap-3">
        <ResourceIcon type={resource.type} />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-sm font-semibold text-gray-900">
              {resource.title || resource.fileName || "Untitled resource"}
            </h3>
            <span className="rounded-md border border-gray-200 bg-gray-50 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-gray-500">
              {resource.type}
            </span>
            <span className="rounded-md border border-[#d9e7e0] bg-[#f5faf7] px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-[#4d6f62]">
              {tabId === "shared" ? "All matters" : "This matter"}
            </span>
          </div>
          {resource.description && (
            <p className="mt-1 line-clamp-2 text-sm text-gray-500">
              {resource.description}
            </p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-400">
            {resource.fileName && <span>{resource.fileName}</span>}
            {resource.fileSize ? <span>{formatFileSize(resource.fileSize)}</span> : null}
            {resource.createdAt && <span>{formatDate(resource.createdAt)}</span>}
          </div>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {previewUrl ? (
          <Button asChild variant="outline" size="sm" className="h-8 px-3">
            <a href={previewUrl} target="_blank" rel="noreferrer">
              <Eye className="h-3.5 w-3.5" />
              Preview
            </a>
          </Button>
        ) : null}
        {resource.type === "file" && downloadUrl ? (
          <Button asChild variant="outline" size="sm" className="h-8 px-3">
            <a href={downloadUrl} target="_blank" rel="noreferrer">
              <Download className="h-3.5 w-3.5" />
              Download
            </a>
          </Button>
        ) : url ? (
          <Button asChild variant="outline" size="sm" className="h-8 px-3">
            <a href={url} target="_blank" rel="noreferrer">
              <ExternalLink className="h-3.5 w-3.5" />
              Open
            </a>
          </Button>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 px-3 text-gray-500 hover:text-red-600"
          disabled={isArchiving}
          onClick={() => onArchive(resource)}
        >
          {isArchiving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Archive className="h-3.5 w-3.5" />
          )}
          Archive
        </Button>
      </div>
    </div>
  );
}

export default function ResourcesPage() {
  const params = useParams();
  const matterId = params.matterId;

  const [activeTab, setActiveTab] = useState("shared");
  const [individualResources, setIndividualResources] = useState([]);
  const [isIndividualLoading, setIsIndividualLoading] = useState(true);
  const [mode, setMode] = useState("file");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [archiveId, setArchiveId] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [individualError, setIndividualError] = useState(null);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function fetchIndividualResources() {
      try {
        setIsIndividualLoading(true);
        setIndividualError(null);
        const response = await fetch(`/api/matter/${matterId}/resources`);
        const data = await response.json();

        if (!response.ok || !data.success) {
          throw new Error(data.error || "Failed to load resources for this matter");
        }

        if (isMounted) {
          setIndividualResources(data.resources || []);
        }
      } catch (fetchError) {
        if (isMounted) {
          setIndividualError(fetchError.message);
        }
      } finally {
        if (isMounted) {
          setIsIndividualLoading(false);
        }
      }
    }

    if (matterId) {
      fetchIndividualResources();
    }

    return () => {
      isMounted = false;
    };
  }, [matterId]);

  const filteredResources = useMemo(
    () => individualResources.filter((resource) => resourceMatches(resource, searchQuery)),
    [individualResources, searchQuery]
  );

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setUrl("");
    setFile(null);
    setFileInputKey((key) => key + 1);
  };

  const handleFileSelect = (selectedFile) => {
    if (!selectedFile) return;
    setFile(selectedFile);
    if (!title.trim()) {
      setTitle(selectedFile.name);
    }
  };

  const handleDrop = (event) => {
    event.preventDefault();
    setIsDragging(false);
    handleFileSelect(event.dataTransfer.files?.[0]);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError(null);
    setSuccessMessage("");

    if (mode === "file" && !file) {
      setError("Choose a file before uploading.");
      return;
    }

    if (mode === "link" && !url.trim()) {
      setError("Add a URL before saving.");
      return;
    }

    if (mode === "note" && !description.trim()) {
      setError("Add note text before saving.");
      return;
    }

    const formData = new FormData();
    formData.append("type", mode);
    formData.append("title", title.trim());
    formData.append("description", description.trim());
    formData.append("noteText", description.trim());

    if (mode === "file") {
      formData.append("file", file);
    } else if (mode === "link") {
      formData.append("url", url.trim());
    }

    try {
      setIsSubmitting(true);
      const response = await fetch(`/api/matter/${matterId}/resources`, {
        method: "POST",
        body: formData,
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        const details = data.details ? ` ${data.details}` : "";
        throw new Error(`${data.error || "Failed to save resource"}${details}`);
      }

      setIndividualResources((current) => [data.resource, ...current]);

      setSuccessMessage(
        mode === "file"
          ? "File resource uploaded."
          : mode === "note"
            ? "Note resource saved."
            : "Link resource saved."
      );
      resetForm();
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleArchive = async (resource) => {
    const confirmed = window.confirm(`Archive "${resource.title || resource.fileName}"?`);
    if (!confirmed) return;

    const currentArchiveId = `individual:${resource.id}`;

    try {
      setArchiveId(currentArchiveId);
      setError(null);

      const response = await fetch(`/api/matter/${matterId}/resources/${resource.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "archived" }),
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to archive resource");
      }

      setIndividualResources((current) => current.filter((item) => item.id !== resource.id));
      setSuccessMessage("Resource archived.");
    } catch (archiveError) {
      setError(archiveError.message);
    } finally {
      setArchiveId(null);
    }
  };

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">
          Resources
        </h1>

        {activeTab === "individual" ? (
          <div className="relative w-full">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8ac6ad]" />
            <Input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search resources for this matter"
              className="h-10 bg-white pl-9"
            />
          </div>
        ) : null}
      </section>

      <section className="rounded-lg border border-gray-200 bg-white px-5 py-4 shadow-sm">
        <p className="text-sm font-semibold text-gray-800">
          {"\uD83D\uDC4B"} Welcome to your secure client portal.
        </p>
        <p className="mt-1 text-sm font-medium text-gray-600">
          We&apos;re thrilled to have you onboard. Inside this portal, you&apos;ll find all the essential resources and latest updates to streamline our collaboration.
        </p>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-2 shadow-sm">
        <div className="grid gap-2 sm:grid-cols-2">
          {RESOURCE_TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            const count = tab.id === "shared" ? "Templates" : individualResources.length;

            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setActiveTab(tab.id);
                  setError(null);
                  setSuccessMessage("");
                }}
                className={`flex items-center justify-between rounded-lg border px-4 py-3 text-left transition-colors ${
                  isActive
                    ? "border-[#4F726B] bg-[#4F726B] text-white"
                    : "border-gray-200 bg-white text-gray-700 hover:border-[#8ac6ad]"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-9 w-9 items-center justify-center rounded-md ${
                      isActive ? "bg-white/15" : "bg-[#edf5f1] text-[#4F726B]"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{tab.label}</p>
                    <p className={`text-xs ${isActive ? "text-white/75" : "text-gray-500"}`}>
                      {tab.subtitle}
                    </p>
                  </div>
                </div>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                    isActive ? "bg-white/15 text-white" : "bg-gray-100 text-gray-600"
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {activeTab === "shared" ? (
        <AdminResourceTemplatesManager />
      ) : (
        <>
          <section className="rounded-lg border border-[#dfe5ef] bg-[#f7f9fc] px-5 py-4 shadow-sm">
            <p className="text-sm font-semibold text-gray-900">
              These resources stay attached only to this matter.
            </p>
            <p className="mt-1 text-sm text-gray-600">
              Use this area when a file, note, or link should only belong to this specific matter.
            </p>
          </section>

          {(error || successMessage || individualError) && (
            <div
              className={`flex items-start gap-2 rounded-lg border px-4 py-3 text-sm ${
                error || individualError
                  ? "border-red-200 bg-red-50 text-red-700"
                  : "border-emerald-200 bg-emerald-50 text-emerald-700"
              }`}
            >
              {error || individualError ? (
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              ) : (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              )}
              <span>{error || individualError || successMessage}</span>
            </div>
          )}

          <section className="space-y-2">
            <p className="text-sm font-medium text-gray-400">Add new</p>
            <div className="flex flex-wrap gap-3">
              {addResourceActions.map((item) => {
                const Icon = item.icon;
                const active = mode === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    disabled={!item.enabled}
                    title={item.enabled ? `Add ${item.label.toLowerCase()}` : `${item.label} resources are not available yet`}
                    onClick={() => {
                      if (!item.enabled) return;
                      setMode(item.id);
                      setError(null);
                      setSuccessMessage("");
                    }}
                    className={`inline-flex h-9 items-center justify-center gap-2 rounded-md border px-4 text-sm font-medium shadow-xs transition-colors ${
                      active
                        ? "border-[#08071f] bg-[#08071f] text-white"
                        : item.enabled
                          ? "border-gray-200 bg-white text-gray-600 hover:border-[#8ac6ad] hover:text-[#4F726B]"
                          : "cursor-not-allowed border-gray-200 bg-white text-gray-300 opacity-70"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </button>
                );
              })}
            </div>
          </section>

          <div className="grid gap-6 lg:grid-cols-[minmax(320px,420px)_1fr]">
        <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "file" ? (
              <label
                htmlFor="resource-file"
                onDragOver={(event) => {
                  event.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                className={`flex min-h-40 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed px-5 py-6 text-center transition-colors ${
                  isDragging
                    ? "border-[#4F726B] bg-[#4F726B]/5"
                    : "border-gray-300 bg-gray-50 hover:border-[#8ac6ad] hover:bg-emerald-50/30"
                }`}
              >
                <UploadCloud className="mb-3 h-8 w-8 text-[#4F726B]" />
                <span className="text-sm font-semibold text-gray-900">
                  {file ? file.name : "Choose or drop a file"}
                </span>
                <span className="mt-1 text-xs text-gray-500">
                  {file ? formatFileSize(file.size) : "Maximum upload size: 50 MB"}
                </span>
                <input
                  key={fileInputKey}
                  id="resource-file"
                  type="file"
                  className="sr-only"
                  onChange={(event) => handleFileSelect(event.target.files?.[0])}
                />
              </label>
            ) : mode === "link" ? (
              <div className="space-y-2">
                <label htmlFor="resource-url" className="text-sm font-medium text-gray-700">
                  URL
                </label>
                <Input
                  id="resource-url"
                  type="url"
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  placeholder="https://example.com/resource"
                  className="h-10 bg-white"
                />
              </div>
            ) : (
              <div className="flex min-h-40 flex-col items-center justify-center rounded-lg border border-amber-100 bg-amber-50/60 px-5 py-6 text-center">
                <StickyNote className="mb-3 h-8 w-8 text-amber-700" />
                <span className="text-sm font-semibold text-gray-900">
                  Write a client note
                </span>
                <span className="mt-1 text-xs text-gray-500">
                  Notes appear in this matter&apos;s resources list.
                </span>
              </div>
            )}

            <div className="space-y-2">
              <label htmlFor="resource-title" className="text-sm font-medium text-gray-700">
                Title
              </label>
              <Input
                id="resource-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder={mode === "note" ? "Note title" : "Resource title"}
                className="h-10 bg-white"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="resource-description" className="text-sm font-medium text-gray-700">
                {mode === "note" ? "Note" : "Description"}
              </label>
              <Textarea
                id="resource-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder={
                  mode === "note"
                    ? "Write the note for this matter"
                    : "Optional note"
                }
                rows={mode === "note" ? 5 : 3}
                className="bg-white"
              />
            </div>

            {isSubmitting && (
              <div className="h-1 overflow-hidden rounded-full bg-gray-100">
                <div className="h-full w-1/2 animate-pulse rounded-full bg-[#4F726B]" />
              </div>
            )}

            <Button
              type="submit"
              disabled={isSubmitting}
              className="h-10 w-full bg-[#4F726B] text-white hover:bg-[#4F726B]"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {mode === "file" ? "Uploading" : "Saving"}
                </>
              ) : mode === "file" ? (
                "Upload resource"
              ) : mode === "note" ? (
                "Save note"
              ) : (
                "Save link"
              )}
            </Button>
          </form>
        </section>

        <section className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
          <div className="flex flex-col gap-2 border-b border-gray-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-semibold text-gray-900">
                Resources for this matter
              </h2>
              <p className="text-sm text-gray-500">
                {filteredResources.length} active {filteredResources.length === 1 ? "resource" : "resources"}
              </p>
            </div>
          </div>

          {isIndividualLoading ? (
            <div className="flex items-center justify-center p-12 text-[#4F726B]">
              <Loader2 className="h-7 w-7 animate-spin" />
            </div>
          ) : filteredResources.length > 0 ? (
            <div>
              {filteredResources.map((resource) => (
                <ResourceRow
                  key={resource.id}
                  resource={resource}
                  archiveId={archiveId}
                  onArchive={handleArchive}
                  tabId="individual"
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-lg border border-gray-200 bg-gray-50">
                <FileText className="h-6 w-6 text-gray-400" />
              </div>
              <h3 className="text-sm font-semibold text-gray-900">
                No resources found
              </h3>
              <p className="mt-1 max-w-sm text-sm text-gray-500">
                {searchQuery
                  ? "Try a different search term."
                  : "Add the first resource for this matter."}
              </p>
            </div>
          )}
        </section>
      </div>
        </>
      )}
    </div>
  );
}
