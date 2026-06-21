"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  Archive,
  ArrowUpRight,
  CheckCircle2,
  Download,
  ExternalLink,
  FileText,
  Layers3,
  LibraryBig,
  Link2,
  Loader2,
  PencilLine,
  Plus,
  RefreshCcw,
  Search,
  ShieldCheck,
  StickyNote,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const statusOptions = [
  { value: "draft", label: "Draft" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "archived", label: "Archived" },
];

const scopeOptions = [
  { value: "shared", label: "Shared" },
  { value: "group", label: "Group" },
  { value: "application", label: "Application" },
];

const typeOptions = [
  { value: "file", label: "File", icon: UploadCloud },
  { value: "link", label: "Link", icon: Link2 },
  { value: "note", label: "Note", icon: StickyNote },
];

const defaultFormState = {
  type: "file",
  title: "",
  description: "",
  noteText: "",
  category: "General",
  status: "draft",
  scope: "shared",
  program: "",
  audience: "",
  url: "",
};

function formatDate(value) {
  if (!value) return "Not set";

  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

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

function getStatusClasses(status) {
  if (status === "active") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (status === "inactive") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  if (status === "archived") {
    return "border-slate-200 bg-slate-100 text-slate-600";
  }

  return "border-blue-200 bg-blue-50 text-blue-700";
}

function getTypeLabel(type) {
  return typeOptions.find((option) => option.value === type)?.label || type;
}

function FormSelect({ value, onChange, children, className = "", ...props }) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={`flex h-11 w-full rounded-md border border-[#d7e4de] bg-white px-3 py-2 text-sm text-[#17372e] ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ${className}`}
      {...props}
    >
      {children}
    </select>
  );
}

function buildFormState(resource) {
  return {
    type: resource.type || "file",
    title: resource.title || "",
    description: resource.description || "",
    noteText: resource.noteText || resource.content || "",
    category: resource.category || "General",
    status: resource.status || "draft",
    scope: resource.scope || "shared",
    program: resource.program || "",
    audience: resource.audience || "",
    url: resource.url || resource.publicUrl || "",
  };
}

function resourceMatchesFilters(resource, searchQuery, statusFilter, typeFilter) {
  if (statusFilter !== "all" && resource.status !== statusFilter) {
    return false;
  }

  if (typeFilter !== "all" && resource.type !== typeFilter) {
    return false;
  }

  if (!searchQuery) {
    return true;
  }

  const lowerQuery = searchQuery.toLowerCase();
  return [
    resource.title,
    resource.description,
    resource.noteText,
    resource.fileName,
    resource.url,
    resource.category,
    resource.program,
    resource.audience,
  ]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(lowerQuery));
}

function ResourceRow({
  resource,
  isBusy,
  onEdit,
  onArchive,
  onDelete,
  onQuickStatusChange,
}) {
  const openUrl = resource.publicUrl || resource.url;
  const quickActionLabel =
    resource.status === "active"
      ? "Deactivate"
      : resource.status === "archived"
        ? "Restore draft"
        : "Publish";

  return (
    <article className="rounded-3xl border border-white/75 bg-white/85 p-5 shadow-sm backdrop-blur">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[#dcebe4] bg-[#eff7f3] text-[#4F726B]">
            {resource.type === "file" ? (
              <FileText className="h-5 w-5" />
            ) : resource.type === "note" ? (
              <StickyNote className="h-5 w-5" />
            ) : (
              <Link2 className="h-5 w-5" />
            )}
          </div>

          <div className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-lg font-semibold text-[#17372e]">
                {resource.title || resource.fileName || "Untitled resource"}
              </h3>
              <Badge variant="outline" className={getStatusClasses(resource.status)}>
                {resource.status || "draft"}
              </Badge>
              <Badge variant="outline" className="border-[#d6e3dd] bg-[#f5f8f6] text-[#4f6d61]">
                {getTypeLabel(resource.type)}
              </Badge>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-sm text-[#5b7368]">
              <span className="rounded-full bg-[#edf3f0] px-3 py-1 font-medium">
                {resource.category || "General"}
              </span>
              <span>{resource.scope || "shared"} scope</span>
              {resource.program ? <span>Program: {resource.program}</span> : null}
              {resource.audience ? <span>Audience: {resource.audience}</span> : null}
            </div>

            {resource.description ? (
              <p className="max-w-3xl text-sm leading-6 text-[#51695f]">{resource.description}</p>
            ) : null}

            {resource.noteText ? (
              <div className="rounded-2xl border border-[#e4ece8] bg-[#f8fbf9] px-4 py-3 text-sm leading-6 text-[#486257]">
                {resource.noteText}
              </div>
            ) : null}

            <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs uppercase tracking-[0.14em] text-[#7a9188]">
              {resource.fileName ? <span>{resource.fileName}</span> : null}
              {resource.fileSize ? <span>{formatFileSize(resource.fileSize)}</span> : null}
              <span>Updated {formatDate(resource.updatedAt)}</span>
              <span>Created {formatDate(resource.createdAt)}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 lg:max-w-xs lg:justify-end">
          {openUrl ? (
            <Button asChild variant="outline" size="sm" className="border-[#d7e6df] bg-white/90">
              <a href={openUrl} target="_blank" rel="noreferrer">
                {resource.type === "file" ? (
                  <Download className="h-4 w-4" />
                ) : (
                  <ExternalLink className="h-4 w-4" />
                )}
                Open
              </a>
            </Button>
          ) : null}

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-[#d7e6df] bg-white/90"
            disabled={isBusy}
            onClick={() => onEdit(resource)}
          >
            <PencilLine className="h-4 w-4" />
            Edit
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-[#d7e6df] bg-white/90"
            disabled={isBusy}
            onClick={() => onQuickStatusChange(resource)}
          >
            {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
            {quickActionLabel}
          </Button>

          {resource.status !== "archived" ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="border-[#eadfdb] bg-white/90 text-[#8a5644]"
              disabled={isBusy}
              onClick={() => onArchive(resource)}
            >
              {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Archive className="h-4 w-4" />}
              Archive
            </Button>
          ) : null}

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-red-200 bg-white/90 text-red-600"
            disabled={isBusy}
            onClick={() => onDelete(resource)}
          >
            {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            Delete
          </Button>
        </div>
      </div>
    </article>
  );
}

export default function AdminResourcesManager() {
  const [resources, setResources] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [activeMutationId, setActiveMutationId] = useState(null);
  const [editingResourceId, setEditingResourceId] = useState(null);
  const [form, setForm] = useState(defaultFormState);
  const [file, setFile] = useState(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);

  const deferredSearchQuery = useDeferredValue(searchQuery.trim());
  const editingResource = useMemo(
    () => resources.find((resource) => resource.id === editingResourceId) || null,
    [editingResourceId, resources]
  );

  useEffect(() => {
    let isMounted = true;

    async function loadResources() {
      try {
        setIsLoading(true);
        setError(null);

        const response = await fetch("/api/resources");
        const data = await response.json();

        if (!response.ok || !data.success) {
          throw new Error(data.error || "Failed to load shared resources.");
        }

        if (isMounted) {
          setResources(data.resources || []);
        }
      } catch (loadError) {
        if (isMounted) {
          setError(loadError.message);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadResources();

    return () => {
      isMounted = false;
    };
  }, []);

  const filteredResources = useMemo(
    () =>
      resources.filter((resource) =>
        resourceMatchesFilters(resource, deferredSearchQuery, statusFilter, typeFilter)
      ),
    [deferredSearchQuery, resources, statusFilter, typeFilter]
  );

  const stats = useMemo(() => {
    return resources.reduce(
      (summary, resource) => {
        summary.total += 1;
        summary[resource.status] = (summary[resource.status] || 0) + 1;
        return summary;
      },
      { total: 0, draft: 0, active: 0, inactive: 0, archived: 0 }
    );
  }, [resources]);

  const updateFormField = (field, value) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const resetForm = () => {
    setForm(defaultFormState);
    setFile(null);
    setFileInputKey((current) => current + 1);
    setEditingResourceId(null);
  };

  const handleEdit = (resource) => {
    setEditingResourceId(resource.id);
    setForm(buildFormState(resource));
    setFile(null);
    setFileInputKey((current) => current + 1);
    setError(null);
    setMessage(`Editing "${resource.title || resource.fileName || "resource"}".`);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError(null);
    setMessage(null);

    const isEditing = Boolean(editingResource);
    const isFileType = form.type === "file";
    const isLinkType = form.type === "link";
    const isNoteType = form.type === "note";

    if (!isEditing && isFileType && !file) {
      setError("Choose a file before creating the resource.");
      return;
    }

    if (isLinkType && !form.url.trim()) {
      setError("Add a valid link before saving.");
      return;
    }

    if (isNoteType && !form.noteText.trim()) {
      setError("Add the note text before saving.");
      return;
    }

    try {
      setIsSaving(true);

      if (isEditing) {
        const response = await fetch(`/api/resources/${editingResource.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: form.title,
            description: form.description,
            noteText: form.noteText,
            category: form.category,
            status: form.status,
            scope: form.scope,
            program: form.program,
            audience: form.audience,
            url: form.url,
          }),
        });
        const data = await response.json();

        if (!response.ok || !data.success) {
          throw new Error(data.error || "Failed to update the resource.");
        }

        setResources((current) =>
          current.map((resource) => (resource.id === data.resource.id ? data.resource : resource))
        );
        setMessage("Shared resource updated.");
      } else {
        const payload = new FormData();
        payload.append("type", form.type);
        payload.append("title", form.title);
        payload.append("description", form.description);
        payload.append("noteText", form.noteText);
        payload.append("category", form.category);
        payload.append("status", form.status);
        payload.append("scope", form.scope);
        payload.append("program", form.program);
        payload.append("audience", form.audience);
        payload.append("url", form.url);

        if (file) {
          payload.append("file", file);
        }

        const response = await fetch("/api/resources", {
          method: "POST",
          body: payload,
        });
        const data = await response.json();

        if (!response.ok || !data.success) {
          throw new Error(data.error || "Failed to create the resource.");
        }

        setResources((current) => [data.resource, ...current]);
        setMessage(
          data.resource.status === "active"
            ? "Shared resource published."
            : "Shared resource saved."
        );
      }

      resetForm();
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setIsSaving(false);
    }
  };

  const mutateResource = async (resourceId, requestInit, successMessage, transform) => {
    try {
      setActiveMutationId(resourceId);
      setError(null);
      setMessage(null);

      const response = await fetch(`/api/resources/${resourceId}`, requestInit);
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Resource update failed.");
      }

      setResources((current) => transform(current, data.resource));
      setMessage(successMessage);
    } catch (mutationError) {
      setError(mutationError.message);
    } finally {
      setActiveMutationId(null);
    }
  };

  const handleQuickStatusChange = async (resource) => {
    const nextStatus =
      resource.status === "active"
        ? "inactive"
        : resource.status === "archived"
          ? "draft"
          : "active";

    await mutateResource(
      resource.id,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      },
      nextStatus === "active"
        ? "Shared resource published."
        : nextStatus === "inactive"
          ? "Shared resource marked inactive."
          : "Shared resource restored to draft.",
      (current, updatedResource) =>
        current.map((item) => (item.id === updatedResource.id ? updatedResource : item))
    );
  };

  const handleArchive = async (resource) => {
    const confirmed = window.confirm(`Archive "${resource.title || resource.fileName || "this resource"}"?`);
    if (!confirmed) return;

    await mutateResource(
      resource.id,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "archived" }),
      },
      "Shared resource archived.",
      (current, updatedResource) =>
        current.map((item) => (item.id === updatedResource.id ? updatedResource : item))
    );
  };

  const handleDelete = async (resource) => {
    const confirmed = window.confirm(
      `Delete "${resource.title || resource.fileName || "this resource"}"? This removes it from the shared library.`
    );
    if (!confirmed) return;

    try {
      setActiveMutationId(resource.id);
      setError(null);
      setMessage(null);

      const response = await fetch(`/api/resources/${resource.id}`, {
        method: "DELETE",
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to delete the resource.");
      }

      setResources((current) => current.filter((item) => item.id !== resource.id));

      if (editingResourceId === resource.id) {
        resetForm();
      }

      setMessage("Shared resource deleted.");
    } catch (deleteError) {
      setError(deleteError.message);
    } finally {
      setActiveMutationId(null);
    }
  };

  const currentType = typeOptions.find((option) => option.value === form.type);

  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden rounded-[32px] border border-white/70 bg-[#4F726B] px-6 py-7 text-white shadow-xl sm:px-8">
        <div className="pointer-events-none absolute right-[-8%] top-[-18%] h-52 w-52 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute bottom-[-22%] left-[-6%] h-56 w-56 rounded-full bg-[#8ac6ad]/25 blur-3xl" />

        <div className="relative flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-white/90">
              <LibraryBig className="h-4 w-4" />
              Shared Resource Library
            </div>
            <div className="space-y-3">
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                Publish once, reuse everywhere.
              </h1>
              <p className="max-w-2xl text-sm leading-7 text-white/80 sm:text-base">
                Manage shared documents, links, and notes from one admin workspace. Drafts stay hidden until you activate them, and targeting fields are ready for later audience-based filtering in the client portal.
              </p>
            </div>
            <div className="flex flex-wrap gap-3 text-sm text-white/80">
              <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2">
                <ShieldCheck className="h-4 w-4" />
                Admin-gated publishing
              </div>
              <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2">
                <Layers3 className="h-4 w-4" />
                Top-level Firestore collection
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-3xl border border-white/15 bg-white/10 px-5 py-4 backdrop-blur">
              <p className="text-xs uppercase tracking-[0.18em] text-white/65">Total</p>
              <p className="mt-2 text-3xl font-semibold">{stats.total}</p>
            </div>
            <div className="rounded-3xl border border-white/15 bg-white/10 px-5 py-4 backdrop-blur">
              <p className="text-xs uppercase tracking-[0.18em] text-white/65">Active</p>
              <p className="mt-2 text-3xl font-semibold">{stats.active}</p>
            </div>
            <div className="rounded-3xl border border-white/15 bg-white/10 px-5 py-4 backdrop-blur">
              <p className="text-xs uppercase tracking-[0.18em] text-white/65">Drafts</p>
              <p className="mt-2 text-3xl font-semibold">{stats.draft}</p>
            </div>
            <div className="rounded-3xl border border-white/15 bg-white/10 px-5 py-4 backdrop-blur">
              <p className="text-xs uppercase tracking-[0.18em] text-white/65">Archived</p>
              <p className="mt-2 text-3xl font-semibold">{stats.archived}</p>
            </div>
          </div>
        </div>
      </section>

      {(error || message) && (
        <div
          className={`flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm shadow-sm ${
            error
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-700"
          }`}
        >
          {error ? (
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          <span>{error || message}</span>
        </div>
      )}

      <section className="grid gap-6 xl:grid-cols-[minmax(360px,430px)_1fr]">
        <aside className="space-y-6 xl:sticky xl:top-6 xl:self-start">
          <div className="rounded-[28px] border border-white/75 bg-white/85 p-6 shadow-sm backdrop-blur">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#70877e]">
                  {editingResource ? "Edit resource" : "Create resource"}
                </p>
                <h2 className="mt-2 text-2xl font-semibold text-[#17372e]">
                  {editingResource ? "Update the shared entry" : "Add something everyone can use"}
                </h2>
              </div>
              {editingResource ? (
                <Button type="button" variant="ghost" size="sm" onClick={resetForm}>
                  Reset
                </Button>
              ) : null}
            </div>

            <form onSubmit={handleSubmit} className="mt-6 space-y-5">
              <div className="space-y-3">
                <label className="text-sm font-medium text-[#224238]">Resource type</label>
                <div className="grid gap-2 sm:grid-cols-3">
                  {typeOptions.map((option) => {
                    const Icon = option.icon;
                    const active = form.type === option.value;

                    return (
                      <button
                        key={option.value}
                        type="button"
                        className={`flex items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-medium transition-colors ${
                          active
                            ? "border-[#4F726B] bg-[#4F726B] text-white"
                            : "border-[#d8e4de] bg-white text-[#466055] hover:border-[#8ac6ad] hover:text-[#4F726B]"
                        }`}
                        onClick={() => {
                          updateFormField("type", option.value);
                          if (option.value !== "file") {
                            setFile(null);
                            setFileInputKey((current) => current + 1);
                          }
                        }}
                        disabled={Boolean(editingResource)}
                      >
                        <Icon className="h-4 w-4" />
                        {option.label}
                      </button>
                    );
                  })}
                </div>
                {editingResource ? (
                  <p className="text-xs text-[#71857d]">
                    Type changes are disabled while editing an existing resource.
                  </p>
                ) : null}
              </div>

              {form.type === "file" ? (
                <div className="space-y-2">
                  <label
                    htmlFor="shared-resource-file"
                    className="flex min-h-40 cursor-pointer flex-col items-center justify-center rounded-[24px] border border-dashed border-[#cfe0d8] bg-[#f6faf8] px-5 py-6 text-center transition-colors hover:border-[#8ac6ad] hover:bg-[#f0f8f4]"
                  >
                    <UploadCloud className="mb-3 h-8 w-8 text-[#4F726B]" />
                    <span className="text-sm font-semibold text-[#17372e]">
                      {file?.name || editingResource?.fileName || "Choose a shared file"}
                    </span>
                    <span className="mt-1 text-xs text-[#6d847a]">
                      {file
                        ? formatFileSize(file.size)
                        : editingResource
                          ? "Create a new resource if the file itself needs to change."
                          : "Up to 50 MB. Requires a shared WorkDrive folder configuration."}
                    </span>
                    <input
                      key={fileInputKey}
                      id="shared-resource-file"
                      type="file"
                      className="sr-only"
                      onChange={(event) => setFile(event.target.files?.[0] || null)}
                      disabled={Boolean(editingResource)}
                    />
                  </label>
                </div>
              ) : null}

              {form.type === "link" ? (
                <div className="space-y-2">
                  <label htmlFor="resource-url" className="text-sm font-medium text-[#224238]">
                    Link URL
                  </label>
                  <Input
                    id="resource-url"
                    type="url"
                    value={form.url}
                    onChange={(event) => updateFormField("url", event.target.value)}
                    placeholder="https://example.com/resource"
                    className="h-11 border-[#d7e4de] bg-white"
                  />
                </div>
              ) : null}

              <div className="space-y-2">
                <label htmlFor="resource-title" className="text-sm font-medium text-[#224238]">
                  Title
                </label>
                <Input
                  id="resource-title"
                  value={form.title}
                  onChange={(event) => updateFormField("title", event.target.value)}
                  placeholder={currentType ? `${currentType.label} title` : "Resource title"}
                  className="h-11 border-[#d7e4de] bg-white"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label htmlFor="resource-category" className="text-sm font-medium text-[#224238]">
                    Category
                  </label>
                  <Input
                    id="resource-category"
                    value={form.category}
                    onChange={(event) => updateFormField("category", event.target.value)}
                    placeholder="General"
                    className="h-11 border-[#d7e4de] bg-white"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-[#224238]">Publish status</label>
                  <FormSelect value={form.status} onChange={(value) => updateFormField("status", value)}>
                    <option value="" disabled>
                      Choose status
                    </option>
                    {statusOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </FormSelect>
                </div>
              </div>

              <div className="space-y-2">
                <label htmlFor="resource-description" className="text-sm font-medium text-[#224238]">
                  Description
                </label>
                <Textarea
                  id="resource-description"
                  value={form.description}
                  onChange={(event) => updateFormField("description", event.target.value)}
                  placeholder="Context for admins or a short summary shown with the resource."
                  rows={3}
                  className="border-[#d7e4de] bg-white"
                />
              </div>

              {form.type === "note" ? (
                <div className="space-y-2">
                  <label htmlFor="resource-note" className="text-sm font-medium text-[#224238]">
                    Note text
                  </label>
                  <Textarea
                    id="resource-note"
                    value={form.noteText}
                    onChange={(event) => updateFormField("noteText", event.target.value)}
                    placeholder="Write the full shared note that should appear in the portal."
                    rows={5}
                    className="border-[#d7e4de] bg-white"
                  />
                </div>
              ) : null}

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-[#224238]">Scope</label>
                  <FormSelect value={form.scope} onChange={(value) => updateFormField("scope", value)}>
                    <option value="" disabled>
                      Choose scope
                    </option>
                    {scopeOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </FormSelect>
                </div>

                <div className="space-y-2">
                  <label htmlFor="resource-program" className="text-sm font-medium text-[#224238]">
                    Program
                  </label>
                  <Input
                    id="resource-program"
                    value={form.program}
                    onChange={(event) => updateFormField("program", event.target.value)}
                    placeholder="Optional"
                    className="h-11 border-[#d7e4de] bg-white"
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="resource-audience" className="text-sm font-medium text-[#224238]">
                    Audience
                  </label>
                  <Input
                    id="resource-audience"
                    value={form.audience}
                    onChange={(event) => updateFormField("audience", event.target.value)}
                    placeholder="Optional"
                    className="h-11 border-[#d7e4de] bg-white"
                  />
                </div>
              </div>

              <div className="rounded-2xl border border-[#dce9e3] bg-[#f7faf8] px-4 py-3 text-sm text-[#60786f]">
                Draft resources stay hidden until you switch them to <span className="font-semibold text-[#4F726B]">Active</span>.
                Targeting fields are stored now so the client portal can filter them later.
              </div>

              <Button
                type="submit"
                disabled={isSaving}
                className="h-12 w-full rounded-2xl bg-[#4F726B] text-white hover:bg-[#4F726B]"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {editingResource ? "Saving changes" : "Creating resource"}
                  </>
                ) : editingResource ? (
                  <>
                    <PencilLine className="h-4 w-4" />
                    Update resource
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4" />
                    Create resource
                  </>
                )}
              </Button>
            </form>
          </div>

          <div className="rounded-[28px] border border-white/75 bg-white/80 p-5 shadow-sm backdrop-blur">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#70877e]">Rollout note</p>
            <p className="mt-3 text-sm leading-6 text-[#4d665c]">
              Legacy matter-specific resources can stay in place during migration. Use the shared library for all new uploads going forward, then migrate old entries into the top-level collection.
            </p>
            <Button asChild variant="outline" className="mt-4 w-full justify-center border-[#d8e4de] bg-white/90">
              <Link href="/">
                Back to portal home
                <ArrowUpRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </aside>

        <section className="space-y-5">
          <div className="rounded-[28px] border border-white/75 bg-white/85 p-5 shadow-sm backdrop-blur">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#70877e]">
                  Library inventory
                </p>
                <h2 className="mt-2 text-2xl font-semibold text-[#17372e]">
                  {filteredResources.length} resources in view
                </h2>
              </div>

              <div className="grid gap-3 sm:grid-cols-3 lg:min-w-[540px]">
                <div className="relative sm:col-span-3 lg:col-span-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7e978d]" />
                  <Input
                    type="search"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Search title, category, audience..."
                    className="h-11 border-[#d7e4de] bg-white pl-10"
                  />
                </div>

                <FormSelect value={statusFilter} onChange={setStatusFilter}>
                  <option value="all">All statuses</option>
                  {statusOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </FormSelect>

                <FormSelect value={typeFilter} onChange={setTypeFilter}>
                  <option value="all">All types</option>
                  {typeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </FormSelect>
              </div>
            </div>
          </div>

          {isLoading ? (
            <div className="flex min-h-[420px] items-center justify-center rounded-[28px] border border-white/75 bg-white/85 shadow-sm backdrop-blur">
              <div className="text-center text-[#4F726B]">
                <Loader2 className="mx-auto h-8 w-8 animate-spin" />
                <p className="mt-4 text-sm text-[#567066]">Loading shared resources...</p>
              </div>
            </div>
          ) : filteredResources.length ? (
            <div className="space-y-4">
              {filteredResources.map((resource) => (
                <ResourceRow
                  key={resource.id}
                  resource={resource}
                  isBusy={activeMutationId === resource.id}
                  onEdit={handleEdit}
                  onArchive={handleArchive}
                  onDelete={handleDelete}
                  onQuickStatusChange={handleQuickStatusChange}
                />
              ))}
            </div>
          ) : (
            <div className="flex min-h-[420px] flex-col items-center justify-center rounded-[28px] border border-dashed border-[#d5e2dc] bg-white/80 px-6 text-center shadow-sm backdrop-blur">
              <div className="flex h-16 w-16 items-center justify-center rounded-3xl border border-[#dbe7e1] bg-[#f6faf8] text-[#4F726B]">
                <LibraryBig className="h-7 w-7" />
              </div>
              <h3 className="mt-5 text-xl font-semibold text-[#17372e]">No shared resources match these filters</h3>
              <p className="mt-2 max-w-md text-sm leading-6 text-[#587267]">
                {resources.length
                  ? "Try a broader search or switch the status and type filters."
                  : "Create the first shared resource to start publishing links, files, and notes across the portal."}
              </p>
            </div>
          )}
        </section>
      </section>
    </div>
  );
}
