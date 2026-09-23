"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  FileText,
  Folder,
  GripVertical,
  Link2,
  Loader2,
  PackageOpen,
  PencilLine,
  Plus,
  Search,
  StickyNote,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  plainTextToRichTextHtml,
  RichTextEditor,
} from "@/components/ui/rich-text";
import MatterTabLoadingState from "@/components/matter/MatterTabLoadingState";
import ResourceFoldersSidebar, { categoryIconOptions } from "@/components/admin/ResourceFoldersSidebar";

const ALL_VISAS = "all";
const MAX_FILE_SIZE = 50 * 1024 * 1024;
const DEFAULT_CATEGORIES = [
  { name: "Uncategorized", icon: "folder" },
  { name: "Guides", icon: "guide" },
  { name: "Policies", icon: "policy" },
  { name: "Helpful Links", icon: "link" },
];
const DEFAULT_CATEGORY_NAMES = DEFAULT_CATEGORIES.map((category) => category.name);

const resourceTypeOptions = [
  { value: "file", label: "File" },
  { value: "note", label: "Note" },
  { value: "link", label: "Link" },
];

const itemStatusOptions = [
  { value: "active", label: "Active" },
  { value: "hidden", label: "Hidden" },
];

const emptyForm = {
  kind: "file",
  name: "",
  category: "Uncategorized",
  order: "0",
  status: "active",
  externalUrl: "",
  description: "",
  noteText: "",
  noteHtml: "",
};

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function formatDate(value) {
  if (!value) return "Not set";

  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function sortByOrderThenName(items) {
  return [...items].sort((a, b) => {
    const parsedOrderA = Number(a.order);
    const parsedOrderB = Number(b.order);
    const orderA = a.order !== null && a.order !== undefined && a.order !== "" && Number.isFinite(parsedOrderA)
      ? parsedOrderA
      : Number.MAX_SAFE_INTEGER;
    const orderB = b.order !== null && b.order !== undefined && b.order !== "" && Number.isFinite(parsedOrderB)
      ? parsedOrderB
      : Number.MAX_SAFE_INTEGER;
    if (orderA !== orderB) return orderA - orderB;
    return String(a.name || "").localeCompare(String(b.name || ""), undefined, {
      sensitivity: "base",
    });
  });
}

function getItemCategory(item) {
  return cleanText(item.category) || "Uncategorized";
}

function categoryKey(value) {
  return cleanText(value).toLowerCase();
}

function resourceItemKey(item) {
  return `${item.visaSlug}:${item.id}`;
}

function KindIcon({ kind, className }) {
  if (kind === "link") return <Link2 className={className} />;
  if (kind === "note") return <StickyNote className={className} />;
  if (kind === "folder") return <Folder className={className} />;
  return <FileText className={className} />;
}

function normalizeCategoryMetadata(value) {
  if (typeof value === "string") {
    return { name: cleanText(value), icon: "folder" };
  }

  return {
    name: cleanText(value?.name),
    icon: categoryIconOptions.some((option) => option.value === value?.icon)
      ? value.icon
      : "folder",
    ...(value?.order !== undefined && value?.order !== null && String(value.order).trim() !== "" && Number.isFinite(Number(value.order))
      ? { order: Number(value.order) }
      : {}),
  };
}

function mergeCategoryDefinitions(...groups) {
  const byName = new Map();

  for (const group of groups) {
    for (const value of group || []) {
      const category = normalizeCategoryMetadata(value);
      if (!category.name) continue;
      byName.set(category.name.toLowerCase(), category);
    }
  }

  return [...byName.values()].sort((a, b) => {
    const savedOrderA = Number.isFinite(a.order) ? a.order : Number.MAX_SAFE_INTEGER;
    const savedOrderB = Number.isFinite(b.order) ? b.order : Number.MAX_SAFE_INTEGER;
    if (savedOrderA !== savedOrderB) return savedOrderA - savedOrderB;
    const orderA = DEFAULT_CATEGORY_NAMES.findIndex((name) => name.toLowerCase() === a.name.toLowerCase());
    const orderB = DEFAULT_CATEGORY_NAMES.findIndex((name) => name.toLowerCase() === b.name.toLowerCase());
    return (orderA < 0 ? Infinity : orderA) - (orderB < 0 ? Infinity : orderB)
      || a.name.localeCompare(b.name);
  });
}

function getKindBadgeClasses(kind) {
  if (kind === "link") return "border-blue-100 bg-blue-50 text-blue-700";
  if (kind === "note") return "border-amber-100 bg-amber-50 text-amber-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function getResourceSearchText(item) {
  return [
    item.name,
    item.fileName,
    item.externalUrl,
    item.description,
    item.noteText,
    item.category,
    item.templateTitle,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function FormSelect({ value, onChange, children, className = "", ...props }) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={`flex h-10 w-full cursor-pointer rounded-md border border-[#cfded7] bg-white px-3 py-2 text-sm text-[#17372e] focus:outline-none focus:ring-2 focus:ring-[#8ac6ad] disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
      {...props}
    >
      {children}
    </select>
  );
}

export default function AdminResourceTemplatesManager() {
  const [templates, setTemplates] = useState([]);
  const [itemsBySlug, setItemsBySlug] = useState({});
  const [activeVisa, setActiveVisa] = useState(ALL_VISAS);
  const [activeCategory, setActiveCategory] = useState("Uncategorized");
  const [categorySearchQuery, setCategorySearchQuery] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryIcon, setNewCategoryIcon] = useState("folder");
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [files, setFiles] = useState([]);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [editingItem, setEditingItem] = useState(null);
  const [showResourceForm, setShowResourceForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortMode, setSortMode] = useState("order");
  const [isDragging, setIsDragging] = useState(false);
  const [draggedItemId, setDraggedItemId] = useState(null);
  const [dragOverItemId, setDragOverItemId] = useState(null);
  const [isReordering, setIsReordering] = useState(false);
  const reorderPending = useRef(false);
  const reorderFocusTarget = useRef(null);
  const [isReorderingFolders, setIsReorderingFolders] = useState(false);
  const [folderOrderOverride, setFolderOrderOverride] = useState(null);
  const folderReorderPending = useRef(false);
  const folderReorderFocusTarget = useRef(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCategorySaving, setIsCategorySaving] = useState(false);
  const [deletingCategory, setDeletingCategory] = useState(null);
  const [renamingCategory, setRenamingCategory] = useState(null);
  const [activeMutationId, setActiveMutationId] = useState(null);
  const [message, setMessage] = useState(null);
  const [successLinks, setSuccessLinks] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isReordering || !reorderFocusTarget.current) return;
    const handle = reorderFocusTarget.current;
    reorderFocusTarget.current = null;
    // Disabling a focused handle during a save can move focus to the body.
    // Restore it after the save so consecutive keyboard moves keep working.
    if (handle.isConnected && document.activeElement === document.body) handle.focus();
  }, [isReordering]);

  useEffect(() => {
    if (isReorderingFolders || !folderReorderFocusTarget.current) return;
    const handle = folderReorderFocusTarget.current;
    folderReorderFocusTarget.current = null;
    if (handle.isConnected && document.activeElement === document.body) handle.focus();
  }, [isReorderingFolders]);

  const templateBySlug = useMemo(
    () =>
      templates.reduce((index, template) => {
        index[template.visaSlug] = template;
        return index;
      }, {}),
    [templates]
  );

  const allItems = useMemo(() => {
    return Object.entries(itemsBySlug).flatMap(([visaSlug, items]) =>
      (items || []).map((item) => ({
        ...item,
        visaSlug,
        templateTitle: templateBySlug[visaSlug]?.title || visaSlug,
      }))
    );
  }, [itemsBySlug, templateBySlug]);

  const resourceItems = useMemo(
    () => allItems.filter((item) => item.kind !== "folder"),
    [allItems]
  );

  const visaScopedItems = useMemo(() => {
    if (activeVisa === ALL_VISAS) return resourceItems;
    return resourceItems.filter((item) => item.visaSlug === activeVisa);
  }, [activeVisa, resourceItems]);

  const categories = useMemo(() => {
    const sourceTemplates =
      activeVisa === ALL_VISAS
        ? templates
        : templates.filter((template) => template.visaSlug === activeVisa);
    const templateCategories = sourceTemplates.flatMap((template) =>
      Array.isArray(template.categories) ? template.categories : []
    );
    const itemCategories = visaScopedItems.map((item) => ({
      name: getItemCategory(item),
      icon: "folder",
    }));

    const merged = mergeCategoryDefinitions(
      [DEFAULT_CATEGORIES[0]],
      itemCategories,
      templateCategories
    );
    if (!folderOrderOverride) return merged;
    const positions = new Map(folderOrderOverride.map((name, index) => [categoryKey(name), index]));
    return merged.sort((a, b) => (positions.get(categoryKey(a.name)) ?? Infinity) -
      (positions.get(categoryKey(b.name)) ?? Infinity));
  }, [activeVisa, templates, visaScopedItems, folderOrderOverride]);

  const visibleCategories = useMemo(() => {
    const query = categorySearchQuery.trim().toLowerCase();
    if (!query) return categories;
    return categories.filter((category) =>
      category.name.toLowerCase().includes(query)
    );
  }, [categories, categorySearchQuery]);

  const categoryCounts = useMemo(() => {
    return visaScopedItems.reduce((counts, item) => {
      const category = categoryKey(getItemCategory(item));
      counts[category] = (counts[category] || 0) + 1;
      return counts;
    }, {});
  }, [visaScopedItems]);

  const activeCategoryItems = useMemo(
    () =>
      visaScopedItems.filter(
        (item) => categoryKey(getItemCategory(item)) === categoryKey(activeCategory)
      ),
    [activeCategory, visaScopedItems]
  );

  const tableItems = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    let items = activeCategoryItems;

    if (query) {
      items = items.filter((item) => getResourceSearchText(item).includes(query));
    }

    if (sortMode === "name") {
      return [...items].sort((a, b) =>
        String(a.name || "").localeCompare(String(b.name || ""), undefined, {
          sensitivity: "base",
        })
      );
    }

    if (sortMode === "oldest") {
      return [...items].sort(
        (a, b) => new Date(a.updatedAt || 0) - new Date(b.updatedAt || 0)
      );
    }

    if (sortMode === "newest") {
      return [...items].sort(
        (a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0)
      );
    }

    if (sortMode === "order") {
      const orderedItems = sortByOrderThenName(items);
      if (activeVisa !== ALL_VISAS) return orderedItems;
      // Each visa has its own saved order. Keep its resources together when
      // displaying multiple visas so a drag has the same result in both views.
      return orderedItems.sort((a, b) =>
        a.templateTitle.localeCompare(b.templateTitle) || a.visaSlug.localeCompare(b.visaSlug)
      );
    }

    return [...items].sort(
      (a, b) => String(a.name || "").localeCompare(String(b.name || ""))
    );
  }, [activeCategoryItems, activeVisa, searchQuery, sortMode]);

  const nextOrder = useMemo(() => {
    const visaItems = itemsBySlug[activeVisa] || [];
    if (!visaItems.length) return 0;
    return Math.max(...visaItems.map((item) => Number(item.order) || 0)) + 10;
  }, [activeVisa, itemsBySlug]);

  const setDefaultForm = useCallback(
    (overrides = {}) => {
      setForm({
        ...emptyForm,
        category: activeCategory,
        order: String(nextOrder),
        ...overrides,
      });
      setFiles([]);
      setFileInputKey((current) => current + 1);
      setEditingItem(null);
      setShowResourceForm(false);
    },
    [activeCategory, nextOrder]
  );

  const handleVisaScopeChange = (visaSlug) => {
    setDraggedItemId(null);
    setDragOverItemId(null);
    setError(null);
    setActiveVisa(visaSlug);
    setActiveCategory("Uncategorized");
    setSearchQuery("");
    setEditingItem(null);
    setShowResourceForm(false);
    setForm((current) => ({
      ...current,
      category: "Uncategorized",
    }));
  };

  const handleAddResource = () => {
    if (activeVisa === ALL_VISAS) {
      setError("Select a specific Visa scope above before adding a resource.");
      setMessage(null);
      return;
    }
    setDefaultForm({
      category: activeCategory,
    });
    setError(null);
    setMessage(null);
    setSuccessLinks([]);
    setShowResourceForm(true);
  };

  const handleEdit = (item) => {
    const noteText = item.noteText || item.content || "";
    setEditingItem(item);
    setForm({
      kind: item.kind,
      name: item.name || item.fileName || "",
      category: getItemCategory(item),
      order: String(Number.isFinite(Number(item.order)) ? Number(item.order) : 0),
      status: item.status || "active",
      externalUrl: item.externalUrl || "",
      description: item.description || "",
      noteText,
      noteHtml: item.noteHtml || plainTextToRichTextHtml(noteText),
    });
    setFiles([]);
    setFileInputKey((current) => current + 1);
    setError(null);
    setMessage(null);
    setSuccessLinks([]);
    setShowResourceForm(true);
  };

  const loadTemplateDetail = useCallback(async (visaSlug) => {
    const response = await fetch(`/api/resource-templates/${visaSlug}`);
    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || "Failed to load resource template.");
    }

    setItemsBySlug((current) => ({
      ...current,
      [visaSlug]: sortByOrderThenName(data.items || []),
    }));
    setTemplates((current) =>
      current.map((template) =>
        template.visaSlug === visaSlug ? { ...template, ...data.template } : template
      )
    );
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadTemplates() {
      try {
        setIsLoading(true);
        setError(null);

        const response = await fetch("/api/resource-templates");
        const data = await response.json();

        if (!response.ok || !data.success) {
          throw new Error(data.error || "Failed to load resource templates.");
        }

        const loadedTemplates = data.templates || [];
        const detailResults = await Promise.all(
          loadedTemplates.map(async (template) => {
            const detailResponse = await fetch(`/api/resource-templates/${template.visaSlug}`);
            const detailData = await detailResponse.json();

            if (!detailResponse.ok || !detailData.success) {
              throw new Error(detailData.error || `Failed to load ${template.title}.`);
            }

            return {
              template: { ...template, ...detailData.template },
              items: sortByOrderThenName(detailData.items || []),
            };
          })
        );

        if (isMounted) {
          setTemplates(detailResults.map((result) => result.template));
          setItemsBySlug(
            detailResults.reduce((index, result) => {
              index[result.template.visaSlug] = result.items;
              return index;
            }, {})
          );
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

    loadTemplates();

    return () => {
      isMounted = false;
    };
  }, []);

  const updateFormField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleFiles = (selectedFiles) => {
    const nextFiles = Array.from(selectedFiles || []);
    const invalidFile = nextFiles.find((file) => file.size === 0 || file.size > MAX_FILE_SIZE);
    if (invalidFile) {
      setError(invalidFile.size === 0
        ? `"${invalidFile.name}" is empty. Choose a file with content.`
        : `"${invalidFile.name}" exceeds the 50 MB limit.`);
      setFiles([]);
      setFileInputKey((current) => current + 1);
      return;
    }
    setError(null);
    setFiles(nextFiles);
    if (nextFiles.length === 1 && !form.name.trim()) {
      updateFormField("name", nextFiles[0].name);
    }
  };

  const handleDrop = (event) => {
    event.preventDefault();
    setIsDragging(false);
    handleFiles(event.dataTransfer.files);
  };

  const handleNewCategory = async () => {
    const category = cleanText(newCategoryName);
    if (!category) return;

    if (categories.some((item) => categoryKey(item.name) === categoryKey(category))) {
      setError("A folder with this name already exists.");
      return;
    }

    const categoryMeta = { name: category, icon: newCategoryIcon };
    const displayedOrder = new Map(categories.map((item, index) => [categoryKey(item.name), (index + 1) * 10]));
    const targetSlugs =
      activeVisa === ALL_VISAS
        ? templates.map((template) => template.visaSlug)
        : [activeVisa];

    if (!targetSlugs.length) {
      setError("Choose a visa type before creating a folder.");
      return;
    }

    try {
      setIsCategorySaving(true);
      setError(null);
      setMessage(null);
      setSuccessLinks([]);

      const updatedTemplates = await Promise.all(
        targetSlugs.map(async (visaSlug) => {
          const template = templateBySlug[visaSlug];
          const existingCategories = mergeCategoryDefinitions(
            [DEFAULT_CATEGORIES[0]],
            (itemsBySlug[visaSlug] || []).filter((item) => item.kind !== "folder").map((item) => ({ name: getItemCategory(item), icon: "folder" })),
            template?.categories || [],
          );
          const nextCategories = [...existingCategories, categoryMeta].map((entry) => ({
            ...entry,
            order: displayedOrder.get(categoryKey(entry.name)) ?? (categories.length + 1) * 10,
          }));
          const response = await fetch(`/api/resource-templates/${visaSlug}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ categories: nextCategories }),
          });
          const data = await response.json();

          if (!response.ok || !data.success) {
            throw new Error(data.error || `Failed to create folder for ${visaSlug}.`);
          }

          return data.template;
        })
      );

      setTemplates((current) =>
        current.map((template) => {
          const updatedTemplate = updatedTemplates.find(
            (item) => item.visaSlug === template.visaSlug
          );
          return updatedTemplate ? { ...template, ...updatedTemplate } : template;
        })
      );
      setActiveCategory(category);
      setNewCategoryName("");
      setNewCategoryIcon("folder");
      setShowNewCategory(false);
      setForm((current) => ({ ...current, category }));
      setMessage(
        activeVisa === ALL_VISAS
          ? "Folder created for all visa templates."
          : "Folder created."
      );
    } catch (categoryError) {
      setError(categoryError.message);
    } finally {
      setIsCategorySaving(false);
    }
  };

  const handleRenameCategory = async (category) => {
    if (category.name.toLowerCase() === "uncategorized") return;
    const nextName = window.prompt("Rename folder", category.name);
    if (nextName === null) return;

    const replacementName = cleanText(nextName);
    if (!replacementName || replacementName === category.name) return;

    const scope = activeVisa === ALL_VISAS
      ? "all visa templates"
      : templateBySlug[activeVisa]?.title || activeVisa;

    try {
      setRenamingCategory(category.name);
      setError(null);
      setMessage(null);
      setSuccessLinks([]);
      const response = await fetch(`/api/resource-templates/${activeVisa}/categories`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: category.name, nextName: replacementName }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to rename category.");
      }

      const changesBySlug = new Map(data.changes.map((change) => [change.visaSlug, change]));
      setTemplates((current) => current.map((template) => {
        const change = changesBySlug.get(template.visaSlug);
        return change ? { ...template, categories: change.categories, updatedAt: data.updatedAt } : template;
      }));
      setItemsBySlug((current) => {
        const updated = { ...current };
        for (const change of data.changes) {
          const renamedIds = new Set(change.renamedItemIds);
          updated[change.visaSlug] = (current[change.visaSlug] || []).map((item) =>
            renamedIds.has(item.id)
              ? { ...item, category: replacementName, updatedAt: data.updatedAt, updatedBy: data.updatedBy }
              : item
          );
        }
        return updated;
      });
      setActiveCategory((current) =>
        current.toLowerCase() === category.name.toLowerCase() ? replacementName : current
      );
      setForm((current) =>
        current.category.toLowerCase() === category.name.toLowerCase()
          ? { ...current, category: replacementName }
          : current
      );
      setMessage(
        `Folder renamed in ${scope}. ${data.renamedResourceCount} resource${data.renamedResourceCount === 1 ? "" : "s"} updated.`
      );
    } catch (categoryError) {
      setError(categoryError.message);
    } finally {
      setRenamingCategory(null);
    }
  };

  const handleDeleteCategory = async (category) => {
    if (category.name.toLowerCase() === "uncategorized") return;
    const scope = activeVisa === ALL_VISAS
      ? "all visa templates"
      : templateBySlug[activeVisa]?.title || activeVisa;
    if (!window.confirm(
      `Delete the "${category.name}" category from ${scope}? Existing resources will be moved to Uncategorized. Files, notes, and links will be kept.`
    )) return;

    try {
      setDeletingCategory(category.name);
      setError(null);
      setMessage(null);
      setSuccessLinks([]);
      const response = await fetch(`/api/resource-templates/${activeVisa}/categories`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: category.name }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to delete category.");
      }

      const changesBySlug = new Map(data.changes.map((change) => [change.visaSlug, change]));
      setTemplates((current) => current.map((template) => {
        const change = changesBySlug.get(template.visaSlug);
        return change ? { ...template, categories: change.categories, updatedAt: data.updatedAt } : template;
      }));
      setItemsBySlug((current) => {
        const updated = { ...current };
        for (const change of data.changes) {
          const movedIds = new Set(change.movedItemIds);
          const movedItemsById = new Map(
            (change.movedItems || []).map((item) => [item.id, item])
          );
          updated[change.visaSlug] = (current[change.visaSlug] || []).map((item) =>
            movedIds.has(item.id)
              ? {
                  ...item,
                  category: "Uncategorized",
                  ...(movedItemsById.get(item.id)?.order !== undefined
                    ? { order: movedItemsById.get(item.id).order }
                    : {}),
                  updatedAt: data.updatedAt,
                  updatedBy: data.updatedBy,
                }
              : item
          );
        }
        return updated;
      });
      setActiveCategory((current) => current.toLowerCase() === category.name.toLowerCase() ? "Uncategorized" : current);
      setForm((current) => current.category.toLowerCase() === category.name.toLowerCase()
        ? { ...current, category: "Uncategorized" }
        : current);
      setMessage(`Category deleted from ${scope}. ${data.movedResourceCount} resource${data.movedResourceCount === 1 ? "" : "s"} moved to Uncategorized.`);
    } catch (categoryError) {
      setError(categoryError.message);
    } finally {
      setDeletingCategory(null);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (deletingCategory || renamingCategory || isReordering) return;
    setError(null);
    setMessage(null);
    setSuccessLinks([]);

    const targetVisa = editingItem?.visaSlug || activeVisa;
    const targetCategory = cleanText(form.category) || activeCategory || "Uncategorized";

    if (!targetVisa || targetVisa === ALL_VISAS) {
      setError("Select a specific Visa scope before saving.");
      return;
    }

    if (!form.name.trim() && form.kind !== "file") {
      setError("Name is required.");
      return;
    }

    if (!editingItem && form.kind === "file" && !files.length) {
      setError("Choose at least one file before uploading.");
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
      setIsSubmitting(true);

      if (editingItem) {
        const payload = {
          name: form.name,
          category: targetCategory,
          order: form.order,
          status: form.status,
        };

        if (editingItem.kind === "link") {
          payload.externalUrl = form.externalUrl;
        }
        if (editingItem.kind === "file" || editingItem.kind === "link") {
          payload.description = form.description;
        }
        if (editingItem.kind === "note") {
          payload.noteText = form.noteText;
          payload.noteHtml = form.noteHtml;
        }

        const response = await fetch(
          `/api/resource-templates/${editingItem.visaSlug}/items/${editingItem.id}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          }
        );
        const data = await response.json();

        if (!response.ok || !data.success) {
          throw new Error(data.error || "Failed to update resource.");
        }

        await loadTemplateDetail(editingItem.visaSlug);
        setMessage("Resource updated.");
      } else if (form.kind === "file") {
        const uploadedLinks = [];

        for (const [index, selectedFile] of files.entries()) {
          const payload = new FormData();
          payload.append("kind", "file");
          payload.append(
            "name",
            files.length === 1 ? form.name || selectedFile.name : selectedFile.name
          );
          payload.append("category", targetCategory);
          payload.append("parentId", "__root__");
          payload.append("order", String(Number(form.order || 0) + index));
          payload.append("status", form.status);
          payload.append("description", form.description);
          payload.append("file", selectedFile);

          const response = await fetch(`/api/resource-templates/${targetVisa}/items`, {
            method: "POST",
            body: payload,
          });
          const data = await response.json();

          if (!response.ok || !data.success) {
            throw new Error(data.error || `Failed to upload ${selectedFile.name}.`);
          }

          if (data.item?.externalUrl) {
            uploadedLinks.push({
              name: data.item.name || selectedFile.name,
              url: data.item.externalUrl,
            });
          }
        }

        await loadTemplateDetail(targetVisa);
        setSuccessLinks(uploadedLinks);
        setMessage(
          files.length === 1
            ? "File uploaded and external link saved in Firebase."
            : "Files uploaded and external links saved in Firebase."
        );
      } else {
        const payload = new FormData();
        payload.append("kind", form.kind);
        payload.append("name", form.name);
        payload.append("category", targetCategory);
        payload.append("parentId", "__root__");
        payload.append("order", form.order);
        payload.append("status", form.status);
        payload.append("externalUrl", form.externalUrl);
        if (form.kind === "link") {
          payload.append("description", form.description);
        }
        payload.append("noteText", form.noteText);
        payload.append("noteHtml", form.noteHtml);

        const response = await fetch(`/api/resource-templates/${targetVisa}/items`, {
          method: "POST",
          body: payload,
        });
        const data = await response.json();

        if (!response.ok || !data.success) {
          throw new Error(data.error || "Failed to save resource.");
        }

        await loadTemplateDetail(targetVisa);
        setMessage(form.kind === "note" ? "Note saved." : "Link saved.");
      }

      setDefaultForm({ category: targetCategory });
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (item) => {
    const resourceName = item.name || item.fileName || "this resource";
    const confirmed = window.confirm(
      item.deletionPending
        ? `Retry deletion of "${resourceName}" from Zoho WorkDrive and Firebase?`
        : `Delete "${resourceName}" from Zoho WorkDrive and Firebase?`
    );
    if (!confirmed) return;

    try {
      setActiveMutationId(item.id);
      setError(null);
      setMessage(null);
      setSuccessLinks([]);

      const response = await fetch(`/api/resource-templates/${item.visaSlug}/items/${item.id}`, {
        method: "DELETE",
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        await loadTemplateDetail(item.visaSlug);
        throw new Error(data.error || "Failed to delete resource.");
      }

      await loadTemplateDetail(item.visaSlug);
      setMessage("Resource deleted from Zoho and Firebase.");
    } catch (mutationError) {
      setError(mutationError.message);
    } finally {
      setActiveMutationId(null);
    }
  };

  const categoryMutationActive = isCategorySaving || Boolean(deletingCategory || renamingCategory);
  const canReorderFolders = categories.length > 1 && !categorySearchQuery.trim() &&
    !isLoading && !isSubmitting && !isReordering && !isReorderingFolders &&
    !activeMutationId && !categoryMutationActive && !showResourceForm;

  const saveFolderOrder = async (sourceName, targetName, focusTarget) => {
    if (!canReorderFolders || folderReorderPending.current || sourceName === targetName) return;
    const sourceIndex = categories.findIndex((category) => categoryKey(category.name) === categoryKey(sourceName));
    const targetIndex = categories.findIndex((category) => categoryKey(category.name) === categoryKey(targetName));
    if (sourceIndex < 0 || targetIndex < 0) return;
    const reordered = [...categories];
    const [moved] = reordered.splice(sourceIndex, 1);
    reordered.splice(targetIndex, 0, moved);
    const names = reordered.map((category) => category.name);

    try {
      folderReorderPending.current = true;
      folderReorderFocusTarget.current = focusTarget || null;
      setIsReorderingFolders(true);
      setFolderOrderOverride(names);
      setError(null);
      setMessage(null);
      const response = await fetch(`/api/resource-templates/${activeVisa}/categories`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ names }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || "Failed to reorder folders.");
      const changes = new Map(data.changes.map((change) => [change.visaSlug, change.categories]));
      setTemplates((current) => current.map((template) => changes.has(template.visaSlug)
        ? { ...template, categories: changes.get(template.visaSlug), updatedAt: data.updatedAt, updatedBy: data.updatedBy }
        : template));
      setMessage("Folder order saved.");
    } catch (reorderError) {
      setError(reorderError.message);
    } finally {
      setFolderOrderOverride(null);
      folderReorderPending.current = false;
      setIsReorderingFolders(false);
    }
  };
  const visaResourceCounts = tableItems.reduce((counts, item) => {
    counts[item.visaSlug] = (counts[item.visaSlug] || 0) + 1;
    return counts;
  }, {});
  const hasMultipleVisas = Object.keys(visaResourceCounts).length > 1;
  const canReorder =
    sortMode === "order" &&
    !searchQuery.trim() &&
    tableItems.length > 1 &&
    !showResourceForm &&
    !isLoading &&
    !isSubmitting &&
    !isReordering &&
    !activeMutationId &&
    !categoryMutationActive &&
    !tableItems.some((item) => item.deletionPending === true);

  const saveResourceOrder = async (sourceItem, targetItem) => {
    if (!canReorder || reorderPending.current || (
      sourceItem.id === targetItem.id && sourceItem.visaSlug === targetItem.visaSlug
    )) return;
    if (sourceItem.visaSlug !== targetItem.visaSlug) {
      setError("Drag resources within the same visa type.");
      return;
    }

    const visaSlug = sourceItem.visaSlug;
    const folderItems = tableItems.filter((item) => item.visaSlug === visaSlug);
    const sourceIndex = folderItems.findIndex((item) => item.id === sourceItem.id);
    const targetIndex = folderItems.findIndex((item) => item.id === targetItem.id);
    if (sourceIndex < 0 || targetIndex < 0) return;

    const reorderedItems = [...folderItems];
    const [movedItem] = reorderedItems.splice(sourceIndex, 1);
    reorderedItems.splice(targetIndex, 0, movedItem);
    const previousItems = itemsBySlug[visaSlug];
    const optimisticOrder = new Map(reorderedItems.map((item, index) => [item.id, (index + 1) * 10]));

    try {
      reorderPending.current = true;
      setIsReordering(true);
      setError(null);
      setMessage(null);
      setSuccessLinks([]);
      setItemsBySlug((current) => ({
        ...current,
        [visaSlug]: (current[visaSlug] || []).map((item) =>
          optimisticOrder.has(item.id) ? { ...item, order: optimisticOrder.get(item.id) } : item
        ),
      }));
      const response = await fetch(`/api/resource-templates/${visaSlug}/items/order`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: activeCategory,
          itemIds: reorderedItems.map((item) => item.id),
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to reorder resources.");
      }

      const orderById = new Map(data.items.map((item) => [item.id, item.order]));
      setItemsBySlug((current) => ({
        ...current,
        [visaSlug]: (current[visaSlug] || []).map((item) =>
          orderById.has(item.id)
            ? {
                ...item,
                order: orderById.get(item.id),
                updatedAt: data.updatedAt,
                updatedBy: data.updatedBy,
              }
            : item
        ),
      }));
      setTemplates((current) => current.map((template) =>
        template.visaSlug === visaSlug
          ? { ...template, updatedAt: data.updatedAt, updatedBy: data.updatedBy }
          : template
      ));
      setMessage("Resource order saved.");
    } catch (reorderError) {
      setItemsBySlug((current) => ({ ...current, [visaSlug]: previousItems }));
      setError(reorderError.message);
    } finally {
      reorderPending.current = false;
      setIsReordering(false);
    }
  };

  const handleReorderDrop = async (event, targetItem) => {
    event.preventDefault();
    const sourceKey = draggedItemId || event.dataTransfer.getData("text/plain");
    setDraggedItemId(null);
    setDragOverItemId(null);
    const sourceItem = tableItems.find((item) => resourceItemKey(item) === sourceKey);
    if (sourceItem) await saveResourceOrder(sourceItem, targetItem);
  };

  const handleReorderKeyDown = async (event, item) => {
    if (!canReorder || !["ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    const folderItems = tableItems.filter((resource) => resource.visaSlug === item.visaSlug);
    const index = folderItems.findIndex((resource) => resource.id === item.id);
    const targetItem = folderItems[index + (event.key === "ArrowUp" ? -1 : 1)];
    if (targetItem) {
      reorderFocusTarget.current = event.currentTarget;
      await saveResourceOrder(item, targetItem);
    }
  };

  const activeVisaTitle =
    activeVisa === ALL_VISAS ? "All Resources" : templateBySlug[activeVisa]?.title || "Resources";

  const reorderGuidance =
    isReordering
      ? "Saving resource order..."
      : searchQuery.trim()
        ? "Clear the search to reorder every resource in this folder."
        : sortMode !== "order"
          ? "Choose Custom order to drag resources."
          : tableItems.length > 1
            ? hasMultipleVisas
              ? "Drag resources within the same visa type, or focus a handle and use the Up and Down arrow keys. Changes save automatically."
              : "Drag the handles to reorder resources, or focus a handle and use the Up and Down arrow keys. Changes save automatically."
            : null;

  if (isLoading) {
    return <MatterTabLoadingState label="Loading resources data…" />;
  }

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-[#dbe7e1] bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight text-[#17372e]">Resource Centre</h1>
              <Badge variant="outline" className="border-[#dbe7e1] bg-[#f7faf8] text-[#60786f]">
                {visaScopedItems.length} resources
              </Badge>
            </div>
            <p className="mt-1 text-sm text-[#60786f]">
              Add, edit and organise client resources by visa type and folder.
            </p>
          </div>
          <div className="w-full lg:w-72">
            <label htmlFor="resource-visa-scope" className="mb-1.5 block text-xs font-semibold text-[#60786f]">
              Visa scope
            </label>
            <FormSelect
              id="resource-visa-scope"
              aria-label="Visa scope"
              value={activeVisa}
              onChange={handleVisaScopeChange}
              disabled={isLoading || categoryMutationActive || isReordering}
            >
              <option value={ALL_VISAS}>All visa types</option>
              {templates.map((template) => (
                <option key={template.visaSlug} value={template.visaSlug}>
                  {template.title}
                </option>
              ))}
            </FormSelect>
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
          <div className="min-w-0">
            <p>{error || message}</p>
            {!error && successLinks.length ? (
              <div className="mt-2 flex max-w-full flex-wrap gap-2">
                {successLinks.map((link) => (
                  <a
                    key={`${link.name}:${link.url}`}
                    href={link.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-8 max-w-full items-center gap-2 rounded-md border border-emerald-200 bg-white px-3 text-xs font-semibold text-[#4F726B] shadow-sm hover:border-[#8ac6ad]"
                  >
                    <Link2 className="h-3.5 w-3.5" />
                    <span className="truncate">Open {link.name}</span>
                  </a>
                ))}
              </div>
            ) : null}
          </div>
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
            setDraggedItemId(null);
            setDragOverItemId(null);
            setActiveCategory(category.name);
            setForm((current) => ({ ...current, category: category.name }));
            setEditingItem(null);
            setShowResourceForm(false);
          }}
          showNewCategory={showNewCategory}
          newCategoryName={newCategoryName}
          newCategoryIcon={newCategoryIcon}
          onNewCategoryNameChange={setNewCategoryName}
          onNewCategoryIconChange={setNewCategoryIcon}
          onToggleNewCategory={() => setShowNewCategory((current) => !current)}
          onCancelNewCategory={() => {
            setShowNewCategory(false);
            setNewCategoryName("");
            setNewCategoryIcon("folder");
          }}
          onNewCategory={handleNewCategory}
          isLoading={isLoading}
          isCategorySaving={isCategorySaving}
          categoryMutationActive={categoryMutationActive}
          isSubmitting={isSubmitting}
          activeMutationId={activeMutationId}
          isReordering={isReordering}
          renamingCategory={renamingCategory}
          deletingCategory={deletingCategory}
          onRenameCategory={handleRenameCategory}
          onDeleteCategory={handleDeleteCategory}
          canReorderFolders={canReorderFolders}
          isReorderingFolders={isReorderingFolders}
          onReorderFolder={saveFolderOrder}
        />

        <div className="min-w-0 space-y-5">
          {showResourceForm ? (
            <section className="rounded-lg border border-[#dbe7e1] bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-[#17372e]">
                    {editingItem ? "Edit resource" : "Add resource"}
                  </h2>
                  <p className="mt-1 text-sm text-[#60786f]">
                    {editingItem ? templateBySlug[editingItem.visaSlug]?.title || editingItem.visaSlug : activeVisaTitle} / {form.category || activeCategory}
                  </p>
                </div>
                <Button type="button" variant="ghost" size="sm" onClick={() => setDefaultForm()}>
                  Cancel
                </Button>
              </div>

              <form onSubmit={handleSubmit} className="mt-5 space-y-4">
                {!editingItem && form.kind === "file" ? (
                  <label
                    onDragOver={(event) => {
                      event.preventDefault();
                      setIsDragging(true);
                    }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={handleDrop}
                    className={`block cursor-pointer rounded-lg border border-dashed px-5 py-6 text-center transition-colors focus-within:ring-2 focus-within:ring-[#4F726B] ${
                      isDragging
                        ? "border-[#4F726B] bg-[#4F726B]/5"
                        : "border-[#d7e4de] bg-[#fbfdfc] hover:border-[#4F726B] hover:bg-[#f0f8f4]"
                    }`}
                  >
                    <UploadCloud className="mx-auto h-8 w-8 text-[#4F726B]" />
                    <span className="mt-2 block text-sm font-semibold text-[#17372e]">Drop files here or choose files</span>
                    <span className="mt-3 inline-flex h-9 items-center justify-center rounded-md bg-[#4F726B] px-4 text-sm font-medium text-white">
                      Choose files
                    </span>
                    <input
                      key={fileInputKey}
                      type="file"
                      multiple
                      aria-label="Choose resource files"
                      className="sr-only"
                      onChange={(event) => handleFiles(event.target.files)}
                    />
                    <span className="mt-3 block text-xs text-[#71857d]">Maximum file size: 50 MB per file.</span>
                    {files.length ? <span className="mt-1 block text-xs font-medium text-[#4F726B]">{files.length} selected</span> : null}
                  </label>
                ) : null}

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-[#224238]">Type</label>
                    <FormSelect
                      value={form.kind}
                      onChange={(value) => {
                        updateFormField("kind", value);
                        setFiles([]);
                        setFileInputKey((current) => current + 1);
                      }}
                      disabled={Boolean(editingItem)}
                    >
                      {resourceTypeOptions.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </FormSelect>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label htmlFor="resource-name" className="text-sm font-medium text-[#224238]">Name</label>
                    <Input
                      id="resource-name"
                      value={form.name}
                      onChange={(event) => updateFormField("name", event.target.value)}
                      placeholder={form.kind === "file" ? "Optional for file uploads" : "Resource name"}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-[#224238]">Visibility</label>
                    <FormSelect value={form.status} onChange={(value) => updateFormField("status", value)}>
                      {itemStatusOptions.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </FormSelect>
                  </div>
                </div>

                {form.kind === "link" ? (
                  <div className="space-y-2">
                    <label htmlFor="resource-link" className="text-sm font-medium text-[#224238]">Link URL</label>
                    <Input
                      id="resource-link"
                      type="url"
                      value={form.externalUrl}
                      onChange={(event) => updateFormField("externalUrl", event.target.value)}
                      placeholder="https://example.com/resource"
                    />
                  </div>
                ) : null}

                {form.kind === "file" || form.kind === "link" ? (
                  <div className="space-y-2">
                    <label htmlFor="resource-description" className="text-sm font-medium text-[#224238]">Description</label>
                    <Textarea
                      id="resource-description"
                      value={form.description}
                      onChange={(event) => updateFormField("description", event.target.value)}
                      placeholder="Optional note shown with this resource (for example, Use Code 33)."
                      rows={3}
                      className="border-[#d7e4de] bg-white"
                    />
                  </div>
                ) : null}

                {form.kind === "note" ? (
                  <div className="space-y-2">
                    <label id="resource-note-label" htmlFor="resource-note" className="text-sm font-medium text-[#224238]">Note</label>
                    <RichTextEditor
                      key={editingItem ? `${editingItem.visaSlug}:${editingItem.id}` : "new-note"}
                      id="resource-note"
                      ariaLabelledBy="resource-note-label"
                      value={form.noteHtml}
                      fallbackText={form.noteText}
                      onChange={(noteHtml, noteText) =>
                        setForm((current) => ({ ...current, noteHtml, noteText }))
                      }
                      placeholder="Write the note shown in the portal"
                    />
                  </div>
                ) : null}

                <div className="flex flex-wrap justify-end gap-3">
                  <Button type="button" variant="outline" onClick={() => setDefaultForm()} disabled={isSubmitting}>
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={isSubmitting || isLoading || categoryMutationActive || isReordering}
                    className="bg-[#4F726B] text-white hover:bg-[#3c5b54]"
                  >
                    {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
                    {editingItem ? "Save changes" : form.kind === "file" ? "Upload" : "Add resource"}
                  </Button>
                </div>
              </form>
            </section>
          ) : null}

          <section className="overflow-hidden rounded-lg border border-[#dbe7e1] bg-white shadow-sm">
          <div className="border-b border-[#dbe7e1] px-5 py-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-semibold text-[#17372e]">{activeCategory}</h2>
                  <Badge variant="outline" className="border-[#dbe7e1] bg-[#f7faf8] text-[#60786f]">{tableItems.length}</Badge>
                </div>
                <p className="mt-1 text-xs text-[#71857d]">{activeVisaTitle} / {activeCategory}</p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button
                  type="button"
                  onClick={handleAddResource}
                  disabled={isLoading || categoryMutationActive || isReordering || showResourceForm}
                  className="bg-[#4F726B] text-white hover:bg-[#3c5b54]"
                >
                  <Plus className="h-4 w-4" />
                  Add resource
                </Button>
              </div>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_170px]">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8aa099]" />
                  <Input
                    aria-label="Search resources"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Search resources"
                    disabled={isReordering}
                    className="h-10 border-[#d7e4de] bg-white pl-9"
                  />
                </div>
                <FormSelect aria-label="Resource sort order" value={sortMode} onChange={setSortMode} disabled={isReordering}>
                  <option value="order">Custom order</option>
                  <option value="newest">Newest first</option>
                  <option value="oldest">Oldest first</option>
                  <option value="name">Name</option>
                </FormSelect>
            </div>
            {reorderGuidance ? <p id="template-resource-reorder-guidance" role="status" className="mt-2 text-xs text-[#71857d]">{reorderGuidance}</p> : null}
          </div>

          {tableItems.length ? (
            <div className="text-sm">
              <div className="hidden border-b border-[#edf1ef] bg-[#fbfdfc] px-5 py-3 text-xs font-semibold text-[#71857d] md:grid md:grid-cols-[minmax(0,1fr)_120px_90px_56px_96px] md:items-center md:gap-4">
                <span>Name</span>
                <span>Updated</span>
                <span>Type</span>
                <span className="text-right">Link</span>
                <span className="text-right">Actions</span>
              </div>
              <div className="divide-y divide-[#edf1ef]">
                {tableItems.map((item) => {
                  const isBusy = activeMutationId === item.id;
                  const itemKey = resourceItemKey(item);
                  const canReorderItem = canReorder && visaResourceCounts[item.visaSlug] > 1;
                  return (
                    <div
                      key={itemKey}
                      onDragOver={(event) => {
                        const sourceItem = tableItems.find((resource) => resourceItemKey(resource) === draggedItemId);
                        if (!canReorderItem || !sourceItem || sourceItem.visaSlug !== item.visaSlug || draggedItemId === itemKey) return;
                        event.preventDefault();
                        event.dataTransfer.dropEffect = "move";
                        setDragOverItemId(itemKey);
                      }}
                      onDragLeave={() => setDragOverItemId((current) => current === itemKey ? null : current)}
                      onDrop={(event) => handleReorderDrop(event, item)}
                      className={`grid gap-3 px-5 py-4 transition-colors md:grid-cols-[minmax(0,1fr)_120px_90px_56px_96px] md:items-center md:gap-4 ${
                        dragOverItemId === itemKey ? "bg-[#edf7f2]" : "bg-white"
                      } ${draggedItemId === itemKey ? "opacity-50" : ""}`}
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <button
                          type="button"
                          draggable={canReorderItem}
                          disabled={!canReorderItem}
                          aria-label={`Reorder ${item.name || item.fileName || "resource"}`}
                          aria-describedby="template-resource-reorder-guidance"
                          title="Drag to reorder, or use the Up and Down arrow keys"
                          onKeyDown={(event) => handleReorderKeyDown(event, item)}
                          onDragStart={(event) => {
                            if (!canReorderItem) return;
                            event.dataTransfer.effectAllowed = "move";
                            event.dataTransfer.setData("text/plain", itemKey);
                            setDraggedItemId(itemKey);
                          }}
                          onDragEnd={() => {
                            setDraggedItemId(null);
                            setDragOverItemId(null);
                          }}
                          className="flex h-8 w-7 shrink-0 cursor-grab items-center justify-center rounded text-[#8aa099] hover:bg-[#edf7f2] focus-visible:outline-2 focus-visible:outline-[#4F726B] active:cursor-grabbing disabled:cursor-not-allowed disabled:text-[#c7d3ce]"
                        >
                          <GripVertical className="h-4 w-4" />
                        </button>
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[#dbe7e1] bg-[#f7faf8] text-[#4F726B]">
                          <KindIcon kind={item.kind} className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-[#17372e]">
                            {item.name || item.fileName || "Untitled resource"}
                          </p>
                          {activeVisa === ALL_VISAS && hasMultipleVisas ? (
                            <p className="mt-1 truncate text-xs text-[#71857d]">{item.templateTitle}</p>
                          ) : null}
                        </div>
                        {item.deletionPending ? (
                          <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
                            Deletion pending
                          </Badge>
                        ) : null}
                      </div>
                      <div className="text-sm text-[#60786f]">
                        <span className="font-medium text-[#71857d] md:hidden">Updated: </span>
                        {formatDate(item.updatedAt || item.createdAt)}
                      </div>
                      <div>
                        <Badge variant="outline" className={getKindBadgeClasses(item.kind)}>
                          {item.kind}
                        </Badge>
                      </div>
                      <div className="flex justify-start md:justify-end">
                        {item.externalUrl ? (
                          <Button
                            asChild
                            type="button"
                            variant="ghost"
                            size="icon"
                            title="Open external link"
                            className="text-[#4F726B] hover:bg-[#e8f4ee] hover:text-[#17372e]"
                          >
                            <a
                              href={item.externalUrl}
                              target="_blank"
                              rel="noreferrer"
                              aria-label={`Open external link for ${item.name || item.fileName || "resource"}`}
                            >
                              <Link2 className="h-4 w-4" />
                            </a>
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            title="No external link"
                            disabled
                            className="text-[#9fb4ac]"
                          >
                            <Link2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                      <div className="flex justify-start gap-1 md:justify-end">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          title="Edit"
                          disabled={isBusy || item.deletionPending || categoryMutationActive || isReordering}
                          onClick={() => handleEdit(item)}
                          className="text-[#4F726B] hover:bg-[#e8f4ee] hover:text-[#17372e]"
                        >
                          <PencilLine className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          title={item.deletionPending ? "Retry deletion" : "Delete"}
                          disabled={isBusy || categoryMutationActive || isReordering}
                          onClick={() => handleDelete(item)}
                          className="text-red-600 hover:bg-red-50 hover:text-red-700"
                        >
                          {isBusy ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="flex min-h-[420px] flex-col items-center justify-center px-6 text-center">
              <PackageOpen className="h-16 w-16 text-[#9fb4ac]" />
              <h3 className="mt-4 text-lg font-semibold text-[#17372e]">No resources yet</h3>
              <p className="mt-2 max-w-sm text-sm text-[#60786f]">
                Add a file, note or link to this folder.
              </p>
              <Button
                type="button"
                onClick={handleAddResource}
                className="mt-4 bg-[#4F726B] text-white hover:bg-[#3c5b54]"
              >
                <Plus className="h-4 w-4" />
                Add resource
              </Button>
            </div>
          )}
          </section>
        </div>
      </section>
    </div>
  );
}
