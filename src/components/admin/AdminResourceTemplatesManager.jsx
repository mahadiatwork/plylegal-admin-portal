"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  Folder,
  FolderPlus,
  Link2,
  Loader2,
  PencilLine,
  Plus,
  RefreshCcw,
  Save,
  StickyNote,
  UploadCloud,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const templateStatusOptions = [
  { value: "active", label: "Active" },
  { value: "draft", label: "Draft" },
  { value: "archived", label: "Archived" },
];

const itemStatusOptions = [
  { value: "active", label: "Active" },
  { value: "hidden", label: "Hidden" },
];

const kindOptions = [
  { value: "folder", label: "Folder" },
  { value: "file", label: "File" },
  { value: "note", label: "Note" },
  { value: "link", label: "Link" },
];

const emptyForm = {
  kind: "folder",
  name: "",
  parentId: "__root__",
  order: "0",
  status: "active",
  externalUrl: "",
  noteText: "",
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

function sortItems(items) {
  return [...items].sort((a, b) => {
    const orderA = Number.isFinite(Number(a.order)) ? Number(a.order) : 0;
    const orderB = Number.isFinite(Number(b.order)) ? Number(b.order) : 0;
    if (orderA !== orderB) return orderA - orderB;
    return String(a.name || "").localeCompare(String(b.name || ""), undefined, {
      sensitivity: "base",
    });
  });
}

function buildItemTree(items) {
  const childrenByParent = new Map();

  for (const item of sortItems(items)) {
    const parentKey = item.parentId || "__root__";
    const children = childrenByParent.get(parentKey) || [];
    children.push(item);
    childrenByParent.set(parentKey, children);
  }

  function attach(parentId, depth) {
    return (childrenByParent.get(parentId) || []).map((item) => ({
      ...item,
      depth,
      children: attach(item.id, depth + 1),
    }));
  }

  return attach("__root__", 0);
}

function getDescendantIds(items, itemId) {
  const childrenByParent = new Map();

  for (const item of items) {
    const parentKey = item.parentId || "__root__";
    const children = childrenByParent.get(parentKey) || [];
    children.push(item);
    childrenByParent.set(parentKey, children);
  }

  const descendants = new Set();

  function visit(parentId) {
    for (const child of childrenByParent.get(parentId) || []) {
      descendants.add(child.id);
      visit(child.id);
    }
  }

  visit(itemId);
  return descendants;
}

function buildFolderOptions(items, editingItem) {
  const excludedIds = new Set();

  if (editingItem?.kind === "folder") {
    excludedIds.add(editingItem.id);
    for (const id of getDescendantIds(items, editingItem.id)) {
      excludedIds.add(id);
    }
  }

  const folderItems = items.filter(
    (item) => item.kind === "folder" && !excludedIds.has(item.id)
  );
  const tree = buildItemTree(folderItems);
  const options = [{ value: "__root__", label: "Top level" }];

  function flatten(nodes) {
    for (const node of nodes) {
      options.push({
        value: node.id,
        label: `${"  ".repeat(node.depth)}${node.name || "Untitled folder"}`,
      });
      flatten(node.children || []);
    }
  }

  flatten(tree);
  return options;
}

function KindIcon({ kind, className }) {
  if (kind === "folder") return <Folder className={className} />;
  if (kind === "link") return <Link2 className={className} />;
  if (kind === "note") return <StickyNote className={className} />;
  return <FileText className={className} />;
}

function getStatusClasses(status) {
  if (status === "active") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "hidden") return "border-slate-200 bg-slate-100 text-slate-600";
  if (status === "archived") return "border-slate-200 bg-slate-100 text-slate-600";
  return "border-blue-200 bg-blue-50 text-blue-700";
}

function FormSelect({ value, onChange, children, className = "", ...props }) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={`flex h-10 w-full rounded-md border border-[#cfded7] bg-white px-3 py-2 text-sm text-[#17372e] focus:outline-none focus:ring-2 focus:ring-[#8ac6ad] ${className}`}
      {...props}
    >
      {children}
    </select>
  );
}

function TreeNode({ item, activeMutationId, onEdit, onStatusToggle }) {
  const isHidden = item.status === "hidden";
  const hasChildren = item.children?.length > 0;
  const url = item.externalUrl;
  const isBusy = activeMutationId === item.id;

  return (
    <div>
      <div
        className={`grid gap-3 border-b border-[#edf1ef] px-4 py-3 md:grid-cols-[1fr_auto] md:items-center ${
          isHidden ? "bg-slate-50/80" : "bg-white"
        }`}
        style={{ paddingLeft: `${16 + item.depth * 22}px` }}
      >
        <div className="flex min-w-0 items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[#d8e7e0] bg-[#f6faf8] text-[#285646]">
            <KindIcon kind={item.kind} className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-sm font-semibold text-[#17372e]">
                {item.name || "Untitled item"}
              </h3>
              <Badge variant="outline" className={getStatusClasses(item.status)}>
                {item.status || "active"}
              </Badge>
              <Badge variant="outline" className="border-[#dce6e1] bg-white text-[#60786f]">
                {item.kind}
              </Badge>
              <span className="text-xs text-[#84978f]">Order {item.order ?? 0}</span>
            </div>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[#71857d]">
              {item.fileName ? <span>{item.fileName}</span> : null}
              {item.size ? <span>{formatFileSize(item.size)}</span> : null}
              {item.mimeType ? <span>{item.mimeType}</span> : null}
              {item.noteText ? <span>{item.noteText}</span> : null}
              {hasChildren ? <span>{item.children.length} nested</span> : null}
              <span>Updated {formatDate(item.updatedAt)}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 md:justify-end">
          {url ? (
            <Button asChild variant="outline" size="sm" className="border-[#d7e6df] bg-white">
              <a href={url} target="_blank" rel="noreferrer">
                <ExternalLink className="h-4 w-4" />
                Open
              </a>
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-[#d7e6df] bg-white"
            onClick={() => onEdit(item)}
            disabled={isBusy}
          >
            <PencilLine className="h-4 w-4" />
            Edit
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-[#d7e6df] bg-white"
            onClick={() => onStatusToggle(item)}
            disabled={isBusy}
          >
            {isBusy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : isHidden ? (
              <Eye className="h-4 w-4" />
            ) : (
              <EyeOff className="h-4 w-4" />
            )}
            {isHidden ? "Show" : "Hide"}
          </Button>
        </div>
      </div>

      {item.children?.map((child) => (
        <TreeNode
          key={child.id}
          item={child}
          activeMutationId={activeMutationId}
          onEdit={onEdit}
          onStatusToggle={onStatusToggle}
        />
      ))}
    </div>
  );
}

export default function AdminResourceTemplatesManager() {
  const [templates, setTemplates] = useState([]);
  const [templateBySlug, setTemplateBySlug] = useState({});
  const [itemsBySlug, setItemsBySlug] = useState({});
  const [activeSlug, setActiveSlug] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [file, setFile] = useState(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [editingItemId, setEditingItemId] = useState(null);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(true);
  const [isLoadingItems, setIsLoadingItems] = useState(false);
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);
  const [isSubmittingItem, setIsSubmittingItem] = useState(false);
  const [activeMutationId, setActiveMutationId] = useState(null);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);

  const resetForm = useCallback((nextOrder = "0") => {
    setForm({ ...emptyForm, order: String(nextOrder) });
    setFile(null);
    setFileInputKey((current) => current + 1);
    setEditingItemId(null);
  }, []);

  const syncTemplate = useCallback((template, items = null) => {
    if (!template?.visaSlug) return;

    const itemList = items || [];
    setTemplateBySlug((current) => ({
      ...current,
      [template.visaSlug]: template,
    }));
    setTemplates((current) =>
      current.map((existing) =>
        existing.visaSlug === template.visaSlug
          ? {
              ...existing,
              ...template,
              itemCount: items ? itemList.length : existing.itemCount,
              activeItemCount: items
                ? itemList.filter((item) => item.status !== "hidden").length
                : existing.activeItemCount,
            }
          : existing
      )
    );
  }, []);

  const loadTemplateDetail = useCallback(
    async (visaSlug, options = {}) => {
      if (!visaSlug) return;

      try {
        if (!options.quiet) {
          setIsLoadingItems(true);
        }
        setError(null);

        const response = await fetch(`/api/resource-templates/${visaSlug}`);
        const data = await response.json();

        if (!response.ok || !data.success) {
          throw new Error(data.error || "Failed to load resource template.");
        }

        const sortedItems = sortItems(data.items || []);
        setItemsBySlug((current) => ({
          ...current,
          [visaSlug]: sortedItems,
        }));
        syncTemplate(data.template, sortedItems);
      } catch (loadError) {
        setError(loadError.message);
      } finally {
        setIsLoadingItems(false);
      }
    },
    [syncTemplate]
  );

  useEffect(() => {
    let isMounted = true;

    async function loadTemplates() {
      try {
        setIsLoadingTemplates(true);
        setError(null);

        const response = await fetch("/api/resource-templates");
        const data = await response.json();

        if (!response.ok || !data.success) {
          throw new Error(data.error || "Failed to load templates.");
        }

        if (isMounted) {
          const loadedTemplates = data.templates || [];
          setTemplates(loadedTemplates);
          setTemplateBySlug(
            loadedTemplates.reduce((index, template) => {
              index[template.visaSlug] = template;
              return index;
            }, {})
          );
          setActiveSlug((current) => current || loadedTemplates[0]?.visaSlug || "");
        }
      } catch (loadError) {
        if (isMounted) {
          setError(loadError.message);
        }
      } finally {
        if (isMounted) {
          setIsLoadingTemplates(false);
        }
      }
    }

    loadTemplates();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!activeSlug) return;

    let isMounted = true;

    async function loadActiveTemplate() {
      try {
        setIsLoadingItems(true);
        setError(null);

        const response = await fetch(`/api/resource-templates/${activeSlug}`);
        const data = await response.json();

        if (!response.ok || !data.success) {
          throw new Error(data.error || "Failed to load resource template.");
        }

        if (isMounted) {
          const sortedItems = sortItems(data.items || []);
          setItemsBySlug((current) => ({
            ...current,
            [activeSlug]: sortedItems,
          }));
          syncTemplate(data.template, sortedItems);
        }
      } catch (loadError) {
        if (isMounted) {
          setError(loadError.message);
        }
      } finally {
        if (isMounted) {
          setIsLoadingItems(false);
        }
      }
    }

    loadActiveTemplate();

    return () => {
      isMounted = false;
    };
  }, [activeSlug, syncTemplate]);

  const activeTemplate = templateBySlug[activeSlug] || null;
  const currentItems = useMemo(
    () => sortItems(itemsBySlug[activeSlug] || []),
    [activeSlug, itemsBySlug]
  );
  const editingItem = useMemo(
    () => currentItems.find((item) => item.id === editingItemId) || null,
    [currentItems, editingItemId]
  );
  const tree = useMemo(() => buildItemTree(currentItems), [currentItems]);
  const folderOptions = useMemo(
    () => buildFolderOptions(currentItems, editingItem),
    [currentItems, editingItem]
  );
  const nextOrder = useMemo(() => {
    if (!currentItems.length) return 0;
    return Math.max(...currentItems.map((item) => Number(item.order) || 0)) + 10;
  }, [currentItems]);
  const stats = useMemo(
    () =>
      currentItems.reduce(
        (summary, item) => {
          summary.total += 1;
          summary[item.kind] = (summary[item.kind] || 0) + 1;
          summary[item.status] = (summary[item.status] || 0) + 1;
          return summary;
        },
        { total: 0, folder: 0, file: 0, link: 0, note: 0, active: 0, hidden: 0 }
      ),
    [currentItems]
  );

  const updateFormField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleEdit = (item) => {
    setEditingItemId(item.id);
    setForm({
      kind: item.kind,
      name: item.name || "",
      parentId: item.parentId || "__root__",
      order: String(item.order ?? 0),
      status: item.status || "active",
      externalUrl: item.externalUrl || "",
      noteText: item.noteText || item.content || "",
    });
    setFile(null);
    setFileInputKey((current) => current + 1);
    setError(null);
    setMessage(`Editing "${item.name || "item"}".`);
  };

  const handleTemplateStatusChange = async (status) => {
    if (!activeSlug || !activeTemplate || status === activeTemplate.status) return;

    try {
      setIsSavingTemplate(true);
      setError(null);
      setMessage(null);

      const response = await fetch(`/api/resource-templates/${activeSlug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to update template status.");
      }

      syncTemplate(data.template, currentItems);
      setMessage("Template status updated.");
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setIsSavingTemplate(false);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError(null);
    setMessage(null);

    if (!activeSlug) {
      setError("Choose a template first.");
      return;
    }

    if (!form.name.trim() && form.kind !== "file") {
      setError("Name is required.");
      return;
    }

    if (!editingItem && form.kind === "file" && !file) {
      setError("Choose a file before saving.");
      return;
    }

    if (form.kind === "link" && !form.externalUrl.trim()) {
      setError("Add a URL before saving.");
      return;
    }

    if (form.kind === "note" && !form.noteText.trim()) {
      setError("Add note text before saving.");
      return;
    }

    try {
      setIsSubmittingItem(true);

      if (editingItem) {
        const payload = {
          name: form.name,
          parentId: form.parentId,
          order: form.order,
          status: form.status,
        };

        if (editingItem.kind === "link") {
          payload.externalUrl = form.externalUrl;
        }

        if (editingItem.kind === "note") {
          payload.noteText = form.noteText;
        }

        const response = await fetch(
          `/api/resource-templates/${activeSlug}/items/${editingItem.id}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          }
        );
        const data = await response.json();

        if (!response.ok || !data.success) {
          throw new Error(data.error || "Failed to update item.");
        }

        setMessage("Template item updated.");
      } else {
        const payload = new FormData();
        payload.append("kind", form.kind);
        payload.append("name", form.name);
        payload.append("parentId", form.parentId);
        payload.append("order", form.order);
        payload.append("status", form.status);
        payload.append("externalUrl", form.externalUrl);
        payload.append("noteText", form.noteText);

        if (file) {
          payload.append("file", file);
        }

        const response = await fetch(`/api/resource-templates/${activeSlug}/items`, {
          method: "POST",
          body: payload,
        });
        const data = await response.json();

        if (!response.ok || !data.success) {
          throw new Error(data.error || "Failed to create item.");
        }

        setMessage("Template item created.");
      }

      await loadTemplateDetail(activeSlug, { quiet: true });
      resetForm(nextOrder);
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setIsSubmittingItem(false);
    }
  };

  const handleStatusToggle = async (item) => {
    const nextStatus = item.status === "hidden" ? "active" : "hidden";

    try {
      setActiveMutationId(item.id);
      setError(null);
      setMessage(null);

      const response = await fetch(`/api/resource-templates/${activeSlug}/items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to update item status.");
      }

      await loadTemplateDetail(activeSlug, { quiet: true });
      setMessage(nextStatus === "active" ? "Template item shown." : "Template item hidden.");
    } catch (mutationError) {
      setError(mutationError.message);
    } finally {
      setActiveMutationId(null);
    }
  };

  const currentKind = kindOptions.find((option) => option.value === form.kind);

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-[#dbe7e1] bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#70877e]">
              Resource Templates
            </p>
            <h1 className="mt-2 text-2xl font-semibold text-[#17372e]">
              Visa resource templates
            </h1>
          </div>

          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {templates.map((template) => {
              const active = template.visaSlug === activeSlug;
              return (
                <button
                  key={template.visaSlug}
                  type="button"
                  onClick={() => setActiveSlug(template.visaSlug)}
                  className={`rounded-md border px-4 py-3 text-left transition-colors ${
                    active
                      ? "border-[#285646] bg-[#285646] text-white"
                      : "border-[#d8e4de] bg-white text-[#38564b] hover:border-[#8ac6ad]"
                  }`}
                >
                  <span className="block text-sm font-semibold">{template.title}</span>
                  <span className={active ? "text-xs text-white/75" : "text-xs text-[#71857d]"}>
                    {template.activeItemCount || 0}/{template.itemCount || 0} active
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {(error || message) && (
        <div
          className={`flex items-start gap-3 rounded-md border px-4 py-3 text-sm shadow-sm ${
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

      <section className="grid gap-6 xl:grid-cols-[360px_1fr]">
        <aside className="space-y-4 xl:sticky xl:top-6 xl:self-start">
          <div className="rounded-lg border border-[#dbe7e1] bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#70877e]">
                  {editingItem ? "Edit item" : "Create item"}
                </p>
                <h2 className="mt-2 text-lg font-semibold text-[#17372e]">
                  {activeTemplate?.title || "Template item"}
                </h2>
              </div>
              {editingItem ? (
                <Button type="button" variant="ghost" size="sm" onClick={() => resetForm(nextOrder)}>
                  <RefreshCcw className="h-4 w-4" />
                  Reset
                </Button>
              ) : null}
            </div>

            <form onSubmit={handleSubmit} className="mt-5 space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-[#224238]">Type</label>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {kindOptions.map((option) => {
                    const active = form.kind === option.value;

                    return (
                      <button
                        key={option.value}
                        type="button"
                        disabled={Boolean(editingItem)}
                        onClick={() => {
                          updateFormField("kind", option.value);
                          if (option.value !== "file") {
                            setFile(null);
                            setFileInputKey((current) => current + 1);
                          }
                        }}
                        className={`flex h-10 items-center justify-center gap-2 rounded-md border text-sm font-medium ${
                          active
                            ? "border-[#285646] bg-[#285646] text-white"
                            : "border-[#d8e4de] bg-white text-[#466055] hover:border-[#8ac6ad]"
                          } disabled:cursor-not-allowed disabled:opacity-70`}
                      >
                        <KindIcon kind={option.value} className="h-4 w-4" />
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {form.kind === "file" && !editingItem ? (
                <label
                  htmlFor="template-file"
                  className="flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-md border border-dashed border-[#cfe0d8] bg-[#f6faf8] px-4 py-5 text-center hover:border-[#8ac6ad]"
                >
                  <UploadCloud className="mb-2 h-7 w-7 text-[#285646]" />
                  <span className="text-sm font-semibold text-[#17372e]">
                    {file?.name || "Choose file"}
                  </span>
                  <span className="mt-1 text-xs text-[#71857d]">
                    {file ? formatFileSize(file.size) : "Maximum 50 MB"}
                  </span>
                  <input
                    key={fileInputKey}
                    id="template-file"
                    type="file"
                    className="sr-only"
                    onChange={(event) => setFile(event.target.files?.[0] || null)}
                  />
                </label>
              ) : null}

              {form.kind === "link" ? (
                <div className="space-y-2">
                  <label htmlFor="template-external-url" className="text-sm font-medium text-[#224238]">
                    URL
                  </label>
                  <Input
                    id="template-external-url"
                    type="url"
                    value={form.externalUrl}
                    onChange={(event) => updateFormField("externalUrl", event.target.value)}
                    placeholder="https://example.com/resource"
                    className="h-10 border-[#cfded7] bg-white"
                  />
                </div>
              ) : null}

              {form.kind === "note" ? (
                <div className="space-y-2">
                  <label htmlFor="template-note-text" className="text-sm font-medium text-[#224238]">
                    Note
                  </label>
                  <Textarea
                    id="template-note-text"
                    value={form.noteText}
                    onChange={(event) => updateFormField("noteText", event.target.value)}
                    placeholder="Write the note shown in the portal"
                    rows={5}
                    className="border-[#cfded7] bg-white"
                  />
                </div>
              ) : null}

              <div className="space-y-2">
                <label htmlFor="template-item-name" className="text-sm font-medium text-[#224238]">
                  Name
                </label>
                <Input
                  id="template-item-name"
                  value={form.name}
                  onChange={(event) => updateFormField("name", event.target.value)}
                  placeholder={currentKind ? `${currentKind.label} name` : "Item name"}
                  className="h-10 border-[#cfded7] bg-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-[#224238]">Parent</label>
                  <FormSelect
                    value={form.parentId}
                    onChange={(value) => updateFormField("parentId", value)}
                  >
                    {folderOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </FormSelect>
                </div>

                <div className="space-y-2">
                  <label htmlFor="template-order" className="text-sm font-medium text-[#224238]">
                    Order
                  </label>
                  <Input
                    id="template-order"
                    type="number"
                    value={form.order}
                    onChange={(event) => updateFormField("order", event.target.value)}
                    className="h-10 border-[#cfded7] bg-white"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-[#224238]">Visibility</label>
                <FormSelect
                  value={form.status}
                  onChange={(value) => updateFormField("status", value)}
                >
                  {itemStatusOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </FormSelect>
              </div>

              <Button
                type="submit"
                disabled={isSubmittingItem || !activeSlug}
                className="h-10 w-full bg-[#285646] text-white hover:bg-[#1f4236]"
              >
                {isSubmittingItem ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : editingItem ? (
                  <Save className="h-4 w-4" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                {editingItem ? "Save item" : "Create item"}
              </Button>
            </form>
          </div>

          <div className="rounded-lg border border-[#dbe7e1] bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#70877e]">
              Template Status
            </p>
            <div className="mt-3 flex items-center gap-3">
              <FormSelect
                value={activeTemplate?.status || "active"}
                onChange={handleTemplateStatusChange}
                disabled={isSavingTemplate || !activeTemplate}
              >
                {templateStatusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </FormSelect>
              {isSavingTemplate ? (
                <Loader2 className="h-4 w-4 animate-spin text-[#285646]" />
              ) : null}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-md border border-[#e2ebe6] bg-[#f8fbf9] px-3 py-2">
                <span className="block text-xs text-[#71857d]">Folders</span>
                <span className="font-semibold text-[#17372e]">{stats.folder}</span>
              </div>
              <div className="rounded-md border border-[#e2ebe6] bg-[#f8fbf9] px-3 py-2">
                <span className="block text-xs text-[#71857d]">Files</span>
                <span className="font-semibold text-[#17372e]">{stats.file}</span>
              </div>
              <div className="rounded-md border border-[#e2ebe6] bg-[#f8fbf9] px-3 py-2">
                <span className="block text-xs text-[#71857d]">Links</span>
                <span className="font-semibold text-[#17372e]">{stats.link}</span>
              </div>
              <div className="rounded-md border border-[#e2ebe6] bg-[#f8fbf9] px-3 py-2">
                <span className="block text-xs text-[#71857d]">Notes</span>
                <span className="font-semibold text-[#17372e]">{stats.note}</span>
              </div>
              <div className="rounded-md border border-[#e2ebe6] bg-[#f8fbf9] px-3 py-2">
                <span className="block text-xs text-[#71857d]">Hidden</span>
                <span className="font-semibold text-[#17372e]">{stats.hidden}</span>
              </div>
            </div>
          </div>
        </aside>

        <section className="overflow-hidden rounded-lg border border-[#dbe7e1] bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-[#dbe7e1] px-5 py-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#70877e]">
                Template Tree
              </p>
              <h2 className="mt-1 text-lg font-semibold text-[#17372e]">
                {activeTemplate?.title || "Resource template"}
              </h2>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className={getStatusClasses(activeTemplate?.status)}>
                {activeTemplate?.status || "active"}
              </Badge>
              <Badge variant="outline" className="border-[#dce6e1] bg-white text-[#60786f]">
                {stats.active}/{stats.total} visible
              </Badge>
            </div>
          </div>

          {isLoadingTemplates || isLoadingItems ? (
            <div className="flex min-h-[420px] items-center justify-center text-[#285646]">
              <Loader2 className="h-7 w-7 animate-spin" />
            </div>
          ) : tree.length ? (
            <div>
              {tree.map((item) => (
                <TreeNode
                  key={item.id}
                  item={item}
                  activeMutationId={activeMutationId}
                  onEdit={handleEdit}
                  onStatusToggle={handleStatusToggle}
                />
              ))}
            </div>
          ) : (
            <div className="flex min-h-[420px] flex-col items-center justify-center px-6 text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-md border border-[#dbe7e1] bg-[#f6faf8] text-[#285646]">
                <FolderPlus className="h-6 w-6" />
              </div>
              <h3 className="text-sm font-semibold text-[#17372e]">No template items</h3>
              <p className="mt-1 max-w-sm text-sm text-[#60786f]">
                Create a folder, file, note, or link for this visa template.
              </p>
            </div>
          )}
        </section>
      </section>
    </div>
  );
}
