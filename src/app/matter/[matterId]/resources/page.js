"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import {
  AlertCircle,
  Archive,
  CheckCircle2,
  Download,
  Eye,
  ExternalLink,
  FileText,
  FolderPlus,
  GripVertical,
  Library,
  Link2,
  Loader2,
  PackageOpen,
  Plus,
  Search,
  StickyNote,
  UploadCloud,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import AdminResourceTemplatesManager from "@/components/admin/AdminResourceTemplatesManager";
import ResourceFoldersSidebar from "@/components/admin/ResourceFoldersSidebar";
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
  { id: "link", label: "Link", icon: Link2, enabled: true },
];

const DEFAULT_MATTER_CATEGORY = "Uncategorized";
const DOCUMENT_REVIEW_SOURCE = "documentReview";

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

function categoryKey(value) {
  return (String(value || "").trim() || DEFAULT_MATTER_CATEGORY).toLowerCase();
}

function sortMatterResourcesForDisplay(resources) {
  return [...resources].sort((left, right) => {
    const leftHasOrder =
      left.order !== null &&
      left.order !== undefined &&
      left.order !== "" &&
      Number.isFinite(Number(left.order));
    const rightHasOrder =
      right.order !== null &&
      right.order !== undefined &&
      right.order !== "" &&
      Number.isFinite(Number(right.order));
    const leftOrder = leftHasOrder ? Number(left.order) : null;
    const rightOrder = rightHasOrder ? Number(right.order) : null;

    if (leftHasOrder && rightHasOrder && leftOrder !== rightOrder)
      return leftOrder - rightOrder;
    if (leftHasOrder !== rightHasOrder) return leftHasOrder ? -1 : 1;

    const createdDiff =
      new Date(right.createdAt || 0).getTime() -
      new Date(left.createdAt || 0).getTime();
    if (createdDiff) return createdDiff;
    return String(left.title || left.fileName || "").localeCompare(
      String(right.title || right.fileName || ""),
    );
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
    resource.category,
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

function ResourceRow({
  resource,
  archiveId,
  onArchive,
  tabId,
  canReorder = false,
  isDragged = false,
  isDragOver = false,
  interactionPending = false,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  onReorderKeyDown,
}) {
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
  const isArchivePending = Boolean(archiveId) || interactionPending;
  const needsCleanup = resource.workDriveCleanupPending === true;

  return (
    <div
      className={`grid gap-3 border-b border-[#edf1ef] px-5 py-4 last:border-b-0 md:grid-cols-[minmax(0,1fr)_120px_90px_100px_100px] md:items-center md:gap-4 ${
        isDragOver ? "bg-emerald-50/70" : ""
      } ${isDragged ? "opacity-50" : ""}`}
      onDragOver={canReorder ? onDragOver : undefined}
      onDrop={canReorder ? onDrop : undefined}
    >
      <div className="flex min-w-0 gap-3">
        {onDragStart ? (
          <button
            type="button"
            draggable={canReorder}
            disabled={!canReorder}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onKeyDown={onReorderKeyDown}
            className="mt-1 flex h-8 w-7 shrink-0 cursor-grab items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-[#4F726B] focus-visible:outline-2 focus-visible:outline-[#4F726B] disabled:cursor-not-allowed disabled:opacity-30"
            aria-label={`Reorder ${resource.title || resource.fileName || "resource"}`}
            aria-describedby="matter-resource-reorder-guidance"
            title={
              canReorder
                ? "Drag to reorder within this folder, or use the Up and Down arrow keys"
                : "Reordering is unavailable"
            }
          >
            <GripVertical className="h-4 w-4" />
          </button>
        ) : null}
        <ResourceIcon type={resource.type} />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-sm font-semibold text-gray-900">
              {resource.title || resource.fileName || "Untitled resource"}
            </h3>
            {needsCleanup ? (
              <span className="rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                WorkDrive cleanup pending
              </span>
            ) : null}
          </div>
          {resource.description && (
            <p className="mt-1 line-clamp-2 text-sm text-gray-500">
              {resource.description}
            </p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-400">
            {resource.fileName && <span>{resource.fileName}</span>}
            {resource.fileSize ? (
              <span>{formatFileSize(resource.fileSize)}</span>
            ) : null}
          </div>
        </div>
      </div>

      <div className="text-sm text-[#60786f]">
        <span className="font-medium text-[#71857d] md:hidden">Updated: </span>
        {formatDate(resource.updatedAt || resource.createdAt)}
      </div>
      <div>
        <Badge
          variant="outline"
          className={
            resource.type === "link"
              ? "border-blue-100 bg-blue-50 text-blue-700"
              : resource.type === "note"
                ? "border-amber-100 bg-amber-50 text-amber-700"
                : "border-slate-200 bg-slate-50 text-slate-600"
          }
        >
          {resource.type}
        </Badge>
      </div>
      <div className="flex flex-wrap items-center gap-2 md:justify-end">
        {previewUrl ? (
          <Button asChild variant="outline" size="sm" className="h-8 px-3">
            <a href={previewUrl} target="_blank" rel="noreferrer">
              <Eye className="h-3.5 w-3.5" />
              Preview
            </a>
          </Button>
        ) : null}
        {resource.type === "file" &&
        (resource.downloadAllowed === true ||
          resource.source === DOCUMENT_REVIEW_SOURCE) &&
        downloadUrl ? (
          <Button asChild variant="outline" size="sm" className="h-8 px-3">
            <a href={downloadUrl} target="_blank" rel="noreferrer">
              <Download className="h-3.5 w-3.5" />
              Download
            </a>
          </Button>
        ) : resource.type !== "file" && url ? (
          <Button asChild variant="outline" size="sm" className="h-8 px-3">
            <a href={url} target="_blank" rel="noreferrer">
              <ExternalLink className="h-3.5 w-3.5" />
              Open
            </a>
          </Button>
        ) : null}
      </div>
      <div className="flex items-center md:justify-end">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 px-3 text-gray-500 hover:text-red-600"
          disabled={isArchivePending}
          onClick={() => onArchive(resource)}
        >
          {isArchiving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Archive className="h-3.5 w-3.5" />
          )}
          {needsCleanup ? "Retry cleanup" : "Archive"}
        </Button>
      </div>
    </div>
  );
}

export default function ResourcesPage() {
  const params = useParams();
  const matterId = params.matterId;

  return <MatterResourcesManager key={matterId} matterId={matterId} />;
}

function MatterResourcesManager({ matterId }) {
  const [activeTab, setActiveTab] = useState("shared");
  const [individualResources, setIndividualResources] = useState([]);
  const [isIndividualLoading, setIsIndividualLoading] = useState(true);
  const [mode, setMode] = useState("file");
  const [activeCategory, setActiveCategory] = useState(DEFAULT_MATTER_CATEGORY);
  const [selectedCategory, setSelectedCategory] = useState(
    DEFAULT_MATTER_CATEGORY,
  );
  const [savedCategories, setSavedCategories] = useState([]);
  const [categorySearchQuery, setCategorySearchQuery] = useState("");
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryIcon, setNewCategoryIcon] = useState("folder");
  const [isCategorySaving, setIsCategorySaving] = useState(false);
  const [renamingCategory, setRenamingCategory] = useState(null);
  const [deletingCategory, setDeletingCategory] = useState(null);
  const [showResourceForm, setShowResourceForm] = useState(false);
  const [sortMode, setSortMode] = useState("order");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [archiveId, setArchiveId] = useState(null);
  const [draggedMatterResourceId, setDraggedMatterResourceId] = useState(null);
  const [dragOverMatterResourceId, setDragOverMatterResourceId] =
    useState(null);
  const [isReorderingMatterResources, setIsReorderingMatterResources] =
    useState(false);
  const matterReorderPending = useRef(false);
  const matterReorderFocusTarget = useRef(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [individualError, setIndividualError] = useState(null);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    if (isReorderingMatterResources || !matterReorderFocusTarget.current) return;
    const handle = matterReorderFocusTarget.current;
    matterReorderFocusTarget.current = null;
    if (handle.isConnected && document.activeElement === document.body) handle.focus();
  }, [isReorderingMatterResources]);

  useEffect(() => {
    let isMounted = true;

    async function fetchIndividualResources() {
      try {
        setIsIndividualLoading(true);
        setIndividualError(null);
        const response = await fetch(`/api/matter/${matterId}/resources`);
        const data = await response.json();

        if (!response.ok || !data.success) {
          throw new Error(
            data.error || "Failed to load resources for this matter",
          );
        }

        if (isMounted) {
          setSavedCategories(data.categories || []);
          setIndividualResources(
            (data.resources || []).filter(
              (resource) =>
                resource.source !== DOCUMENT_REVIEW_SOURCE ||
                resource.workDriveCleanupPending === true,
            ),
          );
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

  const matterCategories = useMemo(() => {
    const byName = new Map([
      [
        categoryKey(DEFAULT_MATTER_CATEGORY),
        { name: DEFAULT_MATTER_CATEGORY, icon: "folder" },
      ],
    ]);
    for (const resource of individualResources) {
      const normalized = String(resource.category || "").trim();
      if (normalized)
        byName.set(categoryKey(normalized), {
          name: normalized,
          icon: "folder",
        });
    }
    for (const category of savedCategories) {
      const normalized =
        typeof category === "string"
          ? category.trim()
          : String(category.name || "").trim();
      if (normalized)
        byName.set(categoryKey(normalized), {
          name: normalized,
          icon: category.icon || "folder",
        });
    }
    return [...byName.values()].sort((a, b) => {
      if (categoryKey(a.name) === categoryKey(DEFAULT_MATTER_CATEGORY))
        return -1;
      if (categoryKey(b.name) === categoryKey(DEFAULT_MATTER_CATEGORY))
        return 1;
      return a.name.localeCompare(b.name);
    });
  }, [individualResources, savedCategories]);

  const visibleCategories = useMemo(
    () =>
      matterCategories.filter((category) =>
        category.name
          .toLowerCase()
          .includes(categorySearchQuery.trim().toLowerCase()),
      ),
    [matterCategories, categorySearchQuery],
  );

  const categoryCounts = useMemo(
    () =>
      individualResources.reduce((counts, resource) => {
        const key = categoryKey(resource.category);
        counts[key] = (counts[key] || 0) + 1;
        return counts;
      }, {}),
    [individualResources],
  );

  const activeCategoryResources = useMemo(
    () =>
      individualResources.filter(
        (resource) =>
          categoryKey(resource.category) === categoryKey(activeCategory),
      ),
    [individualResources, activeCategory],
  );

  const filteredResources = useMemo(() => {
    const resources = activeCategoryResources.filter((resource) =>
      resourceMatches(resource, searchQuery),
    );
    if (sortMode === "name") {
      return resources.sort((left, right) =>
        String(left.title || left.fileName || "").localeCompare(
          String(right.title || right.fileName || ""),
          undefined,
          { sensitivity: "base" },
        ),
      );
    }
    if (sortMode === "newest" || sortMode === "oldest") {
      const direction = sortMode === "newest" ? -1 : 1;
      return resources.sort(
        (left, right) =>
          direction *
          (new Date(left.updatedAt || left.createdAt || 0) -
            new Date(right.updatedAt || right.createdAt || 0)),
      );
    }
    return sortMatterResourcesForDisplay(resources);
  }, [activeCategoryResources, searchQuery, sortMode]);

  const categoryMutationActive =
    isCategorySaving || Boolean(renamingCategory || deletingCategory);
  const interactionPending =
    categoryMutationActive ||
    isSubmitting ||
    Boolean(archiveId) ||
    isReorderingMatterResources;
  const canReorder =
    filteredResources.length > 1 &&
    sortMode === "order" &&
    !searchQuery.trim() &&
    !interactionPending &&
    !isIndividualLoading &&
    !individualError &&
    !showResourceForm &&
    filteredResources.every(
      (resource) =>
        resource.status !== "archived" &&
        resource.source !== DOCUMENT_REVIEW_SOURCE,
    );

  const reorderGuidance = isReorderingMatterResources
    ? "Saving resource order..."
    : searchQuery.trim()
      ? "Clear the search to reorder every resource in this folder."
      : sortMode !== "order"
        ? "Choose Custom order to drag and reorder resources."
        : "Drag the handles to reorder resources, or focus a handle and use the Up and Down arrow keys. Changes save automatically.";

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

  const cancelNewCategory = () => {
    setShowNewCategory(false);
    setNewCategoryName("");
    setNewCategoryIcon("folder");
  };

  const applyCategoryMutation = (data) => {
    setSavedCategories(data.categories || []);
    const changesById = new Map(
      (data.items || []).map((item) => [item.id, item]),
    );
    setIndividualResources((current) =>
      sortMatterResourcesForDisplay(
        current.map((resource) => {
          const change = changesById.get(resource.id);
          return change
            ? {
                ...resource,
                ...change,
                updatedAt: data.updatedAt,
                updatedBy: data.updatedBy,
              }
            : resource;
        }),
      ),
    );
  };

  const mutateCategory = async (method, payload) => {
    const response = await fetch(
      `/api/matter/${matterId}/resources/categories`,
      {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    const data = await response.json();
    if (!response.ok || !data.success)
      throw new Error(data.error || "Failed to update the folder.");
    applyCategoryMutation(data);
    return data;
  };

  const handleNewCategory = async () => {
    const category = newCategoryName.trim();
    if (!category) return;

    const existing = matterCategories.find(
      (item) => categoryKey(item.name) === categoryKey(category),
    );
    if (existing) {
      setError("A folder with this name already exists.");
      return;
    }

    try {
      setIsCategorySaving(true);
      setError(null);
      setSuccessMessage("");
      await mutateCategory("POST", { name: category, icon: newCategoryIcon });
      setActiveCategory(category);
      setSelectedCategory(category);
      cancelNewCategory();
      setSuccessMessage(`Folder “${category}” created for this matter.`);
    } catch (categoryError) {
      setError(categoryError.message);
    } finally {
      setIsCategorySaving(false);
    }
  };

  const handleRenameCategory = async (category) => {
    const nextName = window.prompt("Rename folder", category.name)?.trim();
    if (!nextName || nextName === category.name) return;

    try {
      setRenamingCategory(category.name);
      setError(null);
      setSuccessMessage("");
      await mutateCategory("PATCH", { name: category.name, nextName });
      setActiveCategory((current) =>
        categoryKey(current) === categoryKey(category.name)
          ? nextName
          : current,
      );
      setSelectedCategory((current) =>
        categoryKey(current) === categoryKey(category.name)
          ? nextName
          : current,
      );
      setSuccessMessage(`Folder renamed to “${nextName}”.`);
    } catch (categoryError) {
      setError(categoryError.message);
    } finally {
      setRenamingCategory(null);
    }
  };

  const handleDeleteCategory = async (category) => {
    if (
      !window.confirm(
        `Delete the “${category.name}” folder? Existing resources will be moved to Uncategorized. Files, notes, and links will be kept.`,
      )
    )
      return;

    try {
      setDeletingCategory(category.name);
      setError(null);
      setSuccessMessage("");
      await mutateCategory("DELETE", { name: category.name });
      setActiveCategory((current) =>
        categoryKey(current) === categoryKey(category.name)
          ? DEFAULT_MATTER_CATEGORY
          : current,
      );
      setSelectedCategory((current) =>
        categoryKey(current) === categoryKey(category.name)
          ? DEFAULT_MATTER_CATEGORY
          : current,
      );
      setSuccessMessage(
        "Folder deleted. Its resources were moved to Uncategorized.",
      );
    } catch (categoryError) {
      setError(categoryError.message);
    } finally {
      setDeletingCategory(null);
    }
  };

  const handleAddResource = () => {
    resetForm();
    setSelectedCategory(activeCategory);
    setMode("file");
    setShowResourceForm(true);
    setError(null);
    setSuccessMessage("");
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
    formData.append("category", selectedCategory);
    const categoryResources = individualResources.filter(
      (resource) =>
        categoryKey(resource.category) === categoryKey(selectedCategory),
    );
    const categoryOrders = categoryResources
      .filter(
        (resource) =>
          resource.order !== null &&
          resource.order !== undefined &&
          resource.order !== "",
      )
      .map((resource) => Number(resource.order))
      .filter(Number.isFinite);
    if (
      !categoryResources.length ||
      categoryOrders.length === categoryResources.length
    ) {
      formData.append(
        "order",
        String((categoryOrders.length ? Math.max(...categoryOrders) : 0) + 10),
      );
    }

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

      setIndividualResources((current) =>
        sortMatterResourcesForDisplay([...current, data.resource]),
      );

      setSuccessMessage(
        mode === "file"
          ? "File resource uploaded."
          : mode === "note"
            ? "Note resource saved."
            : "Link resource saved.",
      );
      resetForm();
      setActiveCategory(selectedCategory);
      setShowResourceForm(false);
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleArchive = async (resource) => {
    const confirmed = window.confirm(
      resource.workDriveCleanupPending
        ? `Retry WorkDrive cleanup for "${resource.title || resource.fileName}"?`
        : `Archive "${resource.title || resource.fileName}"?`,
    );
    if (!confirmed) return;

    const currentArchiveId = `individual:${resource.id}`;

    try {
      setArchiveId(currentArchiveId);
      setError(null);

      const response = await fetch(
        `/api/matter/${matterId}/resources/${resource.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "archived" }),
        },
      );
      const data = await response.json();

      if (data.cleanupPending) {
        setIndividualResources((current) =>
          current.map((item) =>
            item.id === resource.id
              ? { ...item, status: "archived", workDriveCleanupPending: true }
              : item,
          ),
        );
        throw new Error(
          data.error ||
            "Resource is hidden from the client portal, but WorkDrive cleanup is still pending.",
        );
      }

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to archive resource");
      }

      setIndividualResources((current) =>
        current.filter((item) => item.id !== resource.id),
      );
      setSuccessMessage("Resource archived.");
    } catch (archiveError) {
      setError(archiveError.message);
    } finally {
      setArchiveId(null);
    }
  };

  const saveMatterResourceOrder = async (sourceItemId, targetItemId) => {
    if (
      !canReorder ||
      matterReorderPending.current ||
      !sourceItemId ||
      sourceItemId === targetItemId
    ) {
      return;
    }

    const sourceIndex = filteredResources.findIndex(
      (resource) => resource.id === sourceItemId,
    );
    const targetIndex = filteredResources.findIndex(
      (resource) => resource.id === targetItemId,
    );
    if (sourceIndex < 0 || targetIndex < 0) return;

    const reorderedResources = [...filteredResources];
    const [movedResource] = reorderedResources.splice(sourceIndex, 1);
    reorderedResources.splice(targetIndex, 0, movedResource);
    const previousResources = individualResources;
    const optimisticOrder = new Map(
      reorderedResources.map((resource, index) => [resource.id, (index + 1) * 10]),
    );

    try {
      matterReorderPending.current = true;
      setIsReorderingMatterResources(true);
      setError(null);
      setSuccessMessage("");
      setIndividualResources((current) => current.map((resource) =>
        optimisticOrder.has(resource.id)
          ? { ...resource, order: optimisticOrder.get(resource.id) }
          : resource,
      ));
      const response = await fetch(`/api/matter/${matterId}/resources`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: activeCategory,
          itemIds: reorderedResources.map((resource) => resource.id),
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to reorder resources.");
      }

      const orderById = new Map(
        data.items.map((item) => [item.id, item.order]),
      );
      setIndividualResources((current) =>
        sortMatterResourcesForDisplay(
          current.map((resource) =>
            orderById.has(resource.id)
              ? {
                  ...resource,
                  order: orderById.get(resource.id),
                  updatedAt: data.updatedAt,
                  updatedBy: data.updatedBy,
                }
              : resource,
          ),
        ),
      );
      setSuccessMessage("Resource order saved.");
    } catch (reorderError) {
      setIndividualResources(previousResources);
      setError(reorderError.message);
    } finally {
      matterReorderPending.current = false;
      setIsReorderingMatterResources(false);
    }
  };

  const handleMatterReorderDrop = async (event, targetItemId) => {
    event.preventDefault();
    const sourceItemId =
      draggedMatterResourceId || event.dataTransfer.getData("text/plain");
    setDraggedMatterResourceId(null);
    setDragOverMatterResourceId(null);
    await saveMatterResourceOrder(sourceItemId, targetItemId);
  };

  const handleMatterReorderKeyDown = async (event, resource) => {
    if (!canReorder || !["ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    const index = filteredResources.findIndex((item) => item.id === resource.id);
    const target = filteredResources[index + (event.key === "ArrowUp" ? -1 : 1)];
    if (target) {
      matterReorderFocusTarget.current = event.currentTarget;
      await saveMatterResourceOrder(resource.id, target.id);
    }
  };

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">
          Resources
        </h1>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white px-5 py-4 shadow-sm">
        <p className="text-sm font-medium text-gray-600">
          Manage the resources available to clients through the Client Portal.
          Add, edit and organise resources, and select whether they are
          available generally or for a specific matter.
        </p>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-2 shadow-sm">
        <div className="grid gap-2 sm:grid-cols-2">
          {RESOURCE_TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            const count =
              tab.id === "shared" ? "Templates" : individualResources.length;

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
                    <p
                      className={`text-xs ${isActive ? "text-white/75" : "text-gray-500"}`}
                    >
                      {tab.subtitle}
                    </p>
                  </div>
                </div>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                    isActive
                      ? "bg-white/15 text-white"
                      : "bg-gray-100 text-gray-600"
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
          <section className="rounded-lg border border-[#dbe7e1] bg-white px-5 py-6 shadow-sm">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-xl font-semibold tracking-tight text-[#17372e]">
                Resource Centre
              </h2>
              <Badge
                variant="outline"
                className="border-[#dbe7e1] bg-[#f7faf8] text-[#60786f]"
              >
                {individualResources.length} resources
              </Badge>
            </div>
            <p className="mt-1 text-sm text-[#60786f]">
              Add, edit and organise resources by folder. These resources stay
              attached only to this matter.
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

          <section className="grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)]">
            <ResourceFoldersSidebar
              categories={visibleCategories}
              categoryCounts={categoryCounts}
              activeCategory={activeCategory}
              categorySearchQuery={categorySearchQuery}
              onCategorySearchChange={setCategorySearchQuery}
              onSelectCategory={(category) => {
                setDraggedMatterResourceId(null);
                setDragOverMatterResourceId(null);
                setActiveCategory(category.name);
                setSelectedCategory(category.name);
                setShowResourceForm(false);
                resetForm();
              }}
              showNewCategory={showNewCategory}
              newCategoryName={newCategoryName}
              newCategoryIcon={newCategoryIcon}
              onNewCategoryNameChange={setNewCategoryName}
              onNewCategoryIconChange={setNewCategoryIcon}
              onToggleNewCategory={() =>
                setShowNewCategory((current) => !current)
              }
              onCancelNewCategory={cancelNewCategory}
              onNewCategory={handleNewCategory}
              isLoading={isIndividualLoading || Boolean(individualError)}
              isCategorySaving={isCategorySaving}
              categoryMutationActive={interactionPending}
              isSubmitting={isSubmitting}
              activeMutationId={archiveId}
              isReordering={isReorderingMatterResources}
              renamingCategory={renamingCategory}
              deletingCategory={deletingCategory}
              onRenameCategory={handleRenameCategory}
              onDeleteCategory={handleDeleteCategory}
            />

            <div className="min-w-0 space-y-5">
              {showResourceForm ? (
                <section className="rounded-lg border border-[#dbe7e1] bg-white p-5 shadow-sm">
                  <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="text-base font-semibold text-[#17372e]">
                        Add resource
                      </h2>
                      <p className="mt-1 text-xs text-[#71857d]">
                        Only This Matter / {selectedCategory}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={interactionPending}
                      onClick={() => {
                        setShowResourceForm(false);
                        resetForm();
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                  <div className="mb-4 space-y-2">
                    <p className="text-sm font-medium text-[#60786f]">
                      Resource type
                    </p>
                    <div className="flex flex-wrap gap-3">
                      {addResourceActions.map((item) => {
                        const Icon = item.icon;
                        const active = mode === item.id;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            disabled={interactionPending}
                            title={
                              item.enabled
                                ? `Add ${item.label.toLowerCase()}`
                                : `${item.label} resources are not available yet`
                            }
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
                  </div>

                  <form
                    onSubmit={handleSubmit}
                    className="grid gap-4 md:grid-cols-2"
                    aria-label="Add matter resource"
                  >
                    <fieldset
                      disabled={interactionPending}
                      className="contents"
                    >
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
                            {file
                              ? formatFileSize(file.size)
                              : "Maximum upload size: 50 MB"}
                          </span>
                          <input
                            key={fileInputKey}
                            id="resource-file"
                            type="file"
                            className="sr-only"
                            onChange={(event) =>
                              handleFileSelect(event.target.files?.[0])
                            }
                          />
                        </label>
                      ) : mode === "link" ? (
                        <div className="space-y-2">
                          <label
                            htmlFor="resource-url"
                            className="text-sm font-medium text-gray-700"
                          >
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
                        <div className="flex items-center justify-between gap-3">
                          <label
                            htmlFor="resource-category"
                            className="text-sm font-medium text-gray-700"
                          >
                            Folder
                          </label>
                          <button
                            type="button"
                            onClick={() => setShowNewCategory(true)}
                            disabled={interactionPending}
                            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#4F726B] hover:text-[#17372e]"
                          >
                            <FolderPlus className="h-3.5 w-3.5" />
                            New folder
                          </button>
                        </div>
                        <select
                          id="resource-category"
                          value={selectedCategory}
                          onChange={(event) =>
                            setSelectedCategory(event.target.value)
                          }
                          className="flex h-10 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#8ac6ad]"
                        >
                          {matterCategories.map((category) => (
                            <option key={category.name} value={category.name}>
                              {category.name}
                            </option>
                          ))}
                        </select>
                        <p className="text-xs text-gray-500">
                          The resource will appear in this folder in the client
                          portal.
                        </p>
                      </div>

                      <div className="space-y-2">
                        <label
                          htmlFor="resource-title"
                          className="text-sm font-medium text-gray-700"
                        >
                          Title
                        </label>
                        <Input
                          id="resource-title"
                          value={title}
                          onChange={(event) => setTitle(event.target.value)}
                          placeholder={
                            mode === "note" ? "Note title" : "Resource title"
                          }
                          className="h-10 bg-white"
                        />
                      </div>

                      <div className="space-y-2 md:col-span-2">
                        <label
                          htmlFor="resource-description"
                          className="text-sm font-medium text-gray-700"
                        >
                          {mode === "note" ? "Note" : "Description"}
                        </label>
                        <Textarea
                          id="resource-description"
                          value={description}
                          onChange={(event) =>
                            setDescription(event.target.value)
                          }
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
                        <div className="h-1 overflow-hidden rounded-full bg-gray-100 md:col-span-2">
                          <div className="h-full w-1/2 animate-pulse rounded-full bg-[#4F726B]" />
                        </div>
                      )}
                    </fieldset>
                    <Button
                      type="submit"
                      disabled={
                        interactionPending ||
                        isIndividualLoading ||
                        Boolean(individualError)
                      }
                      className="h-10 w-full bg-[#4F726B] text-white hover:bg-[#4F726B] md:col-span-2"
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
              ) : null}

              <section className="overflow-hidden rounded-lg border border-[#dbe7e1] bg-white shadow-sm">
                <div className="border-b border-[#dbe7e1] px-5 py-4">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-base font-semibold text-[#17372e]">
                          {activeCategory}
                        </h2>
                        <Badge
                          variant="outline"
                          className="border-[#dbe7e1] bg-[#f7faf8] text-[#60786f]"
                        >
                          {filteredResources.length}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs text-[#71857d]">
                        Only This Matter / {activeCategory}
                      </p>
                    </div>
                    <Button
                      type="button"
                      onClick={handleAddResource}
                      disabled={
                        isIndividualLoading ||
                        Boolean(individualError) ||
                        interactionPending ||
                        showResourceForm
                      }
                      className="bg-[#4F726B] text-white hover:bg-[#4F726B]"
                    >
                      <Plus className="h-4 w-4" />
                      Add resource
                    </Button>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_170px]">
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8aa099]" />
                      <Input
                        type="search"
                        aria-label="Search resources"
                        value={searchQuery}
                        onChange={(event) => setSearchQuery(event.target.value)}
                        placeholder="Search resources"
                        disabled={isReorderingMatterResources}
                        className="h-10 border-[#d7e4de] bg-white pl-9"
                      />
                    </div>
                    <select
                      value={sortMode}
                      onChange={(event) => setSortMode(event.target.value)}
                      aria-label="Resource sort order"
                      disabled={isReorderingMatterResources}
                      className="flex h-10 w-full rounded-md border border-[#cfded7] bg-white px-3 py-2 text-sm text-[#17372e] focus:outline-none focus:ring-2 focus:ring-[#8ac6ad]"
                    >
                      <option value="order">Custom order</option>
                      <option value="newest">Newest first</option>
                      <option value="oldest">Oldest first</option>
                      <option value="name">Name</option>
                    </select>
                  </div>
                  <p id="matter-resource-reorder-guidance" role="status" className="mt-2 text-xs text-[#71857d]">
                    {reorderGuidance}
                  </p>
                </div>

                {isIndividualLoading ? (
                  <div className="flex min-h-[420px] items-center justify-center p-12 text-[#4F726B]">
                    <Loader2 className="h-7 w-7 animate-spin" />
                  </div>
                ) : filteredResources.length > 0 ? (
                  <div className="text-sm">
                    <div className="hidden border-b border-[#edf1ef] bg-[#fbfdfc] px-5 py-3 text-xs font-semibold text-[#71857d] md:grid md:grid-cols-[minmax(0,1fr)_120px_90px_100px_100px] md:items-center md:gap-4">
                      <span>Name</span>
                      <span>Updated</span>
                      <span>Type</span>
                      <span className="text-right">Link</span>
                      <span className="text-right">Actions</span>
                    </div>
                    {filteredResources.map((resource) => (
                      <ResourceRow
                        key={resource.id}
                        resource={resource}
                        archiveId={archiveId}
                        onArchive={handleArchive}
                        tabId="individual"
                        canReorder={canReorder}
                        isDragged={draggedMatterResourceId === resource.id}
                        isDragOver={dragOverMatterResourceId === resource.id}
                        interactionPending={interactionPending}
                        onDragStart={(event) => {
                          if (!canReorder) return;
                          setDraggedMatterResourceId(resource.id);
                          event.dataTransfer.effectAllowed = "move";
                          event.dataTransfer.setData("text/plain", resource.id);
                        }}
                        onDragOver={(event) => {
                          event.preventDefault();
                          event.dataTransfer.dropEffect = "move";
                          if (draggedMatterResourceId !== resource.id) {
                            setDragOverMatterResourceId(resource.id);
                          }
                        }}
                        onDrop={(event) =>
                          handleMatterReorderDrop(
                            event,
                            resource.id,
                          )
                        }
                        onReorderKeyDown={(event) => handleMatterReorderKeyDown(event, resource)}
                        onDragEnd={() => {
                          setDraggedMatterResourceId(null);
                          setDragOverMatterResourceId(null);
                        }}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="flex min-h-[420px] flex-col items-center justify-center px-6 py-14 text-center">
                    <PackageOpen className="h-16 w-16 text-[#9fb4ac]" />
                    <h3 className="mt-4 text-lg font-semibold text-[#17372e]">
                      {searchQuery.trim()
                        ? "No resources found"
                        : "No resources yet"}
                    </h3>
                    <p className="mt-1 max-w-sm text-sm text-gray-500">
                      {searchQuery
                        ? "Try a different search term."
                        : "Add a file, note or link to this folder."}
                    </p>
                    <Button
                      type="button"
                      onClick={handleAddResource}
                      disabled={
                        isIndividualLoading ||
                        Boolean(individualError) ||
                        interactionPending ||
                        showResourceForm
                      }
                      className="mt-4 bg-[#4F726B] text-white hover:bg-[#4F726B]"
                    >
                      <Plus className="h-4 w-4" />
                      Add resource
                    </Button>
                  </div>
                )}
              </section>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
