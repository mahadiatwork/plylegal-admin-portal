"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  BookOpen,
  CheckCircle2,
  Clock3,
  FileText,
  Folder,
  FolderPlus,
  Link2,
  Loader2,
  PackageOpen,
  Plus,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  StickyNote,
  Scale,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const ALL_VISAS = "all";
const DEFAULT_CATEGORIES = [
  { name: "Uncategorized", icon: "folder" },
  { name: "Guides", icon: "guide" },
  { name: "Policies", icon: "policy" },
  { name: "Helpful Links", icon: "link" },
];
const DEFAULT_CATEGORY_NAMES = DEFAULT_CATEGORIES.map((category) => category.name);

const categoryIconOptions = [
  { value: "folder", label: "Folder" },
  { value: "guide", label: "Guide" },
  { value: "policy", label: "Policy" },
  { value: "link", label: "Link" },
  { value: "file", label: "File" },
  { value: "note", label: "Note" },
  { value: "shield", label: "Shield" },
  { value: "scale", label: "Legal" },
];

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
  visaSlug: "",
  name: "",
  category: "Uncategorized",
  order: "0",
  status: "active",
  externalUrl: "",
  noteText: "",
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

function formatDateTime(value) {
  if (!value) return "Not yet";

  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function sortByOrderThenName(items) {
  return [...items].sort((a, b) => {
    const orderA = Number.isFinite(Number(a.order)) ? Number(a.order) : 0;
    const orderB = Number.isFinite(Number(b.order)) ? Number(b.order) : 0;
    if (orderA !== orderB) return orderA - orderB;
    return String(a.name || "").localeCompare(String(b.name || ""), undefined, {
      sensitivity: "base",
    });
  });
}

function getItemCategory(item) {
  return cleanText(item.category) || "Uncategorized";
}

function KindIcon({ kind, className }) {
  if (kind === "link") return <Link2 className={className} />;
  if (kind === "note") return <StickyNote className={className} />;
  if (kind === "folder") return <Folder className={className} />;
  return <FileText className={className} />;
}

function CategoryIcon({ icon, className }) {
  if (icon === "guide") return <BookOpen className={className} />;
  if (icon === "policy") return <ShieldCheck className={className} />;
  if (icon === "link") return <Link2 className={className} />;
  if (icon === "file") return <FileText className={className} />;
  if (icon === "note") return <StickyNote className={className} />;
  if (icon === "shield") return <ShieldCheck className={className} />;
  if (icon === "scale") return <Scale className={className} />;
  return <Folder className={className} />;
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

  return DEFAULT_CATEGORIES.filter((category) =>
    byName.has(category.name.toLowerCase())
  ).concat(
    [...byName.values()]
      .filter((category) => !DEFAULT_CATEGORY_NAMES.includes(category.name))
      .sort((a, b) => a.name.localeCompare(b.name))
  );
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
      className={`flex h-10 w-full rounded-md border border-[#cfded7] bg-white px-3 py-2 text-sm text-[#17372e] focus:outline-none focus:ring-2 focus:ring-[#8ac6ad] ${className}`}
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
  const [searchQuery, setSearchQuery] = useState("");
  const [sortMode, setSortMode] = useState("newest");
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCategorySaving, setIsCategorySaving] = useState(false);
  const [activeMutationId, setActiveMutationId] = useState(null);
  const [message, setMessage] = useState(null);
  const [successLinks, setSuccessLinks] = useState([]);
  const [error, setError] = useState(null);

  const templateBySlug = useMemo(
    () =>
      templates.reduce((index, template) => {
        index[template.visaSlug] = template;
        return index;
      }, {}),
    [templates]
  );

  const defaultVisaSlug = templates[0]?.visaSlug || "";

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

    return mergeCategoryDefinitions(
      DEFAULT_CATEGORIES,
      templateCategories,
      itemCategories
    );
  }, [activeVisa, templates, visaScopedItems]);

  const visibleCategories = useMemo(() => {
    const query = categorySearchQuery.trim().toLowerCase();
    if (!query) return categories;
    return categories.filter((category) =>
      category.name.toLowerCase().includes(query)
    );
  }, [categories, categorySearchQuery]);

  const categoryCounts = useMemo(() => {
    return visaScopedItems.reduce((counts, item) => {
      const category = getItemCategory(item);
      counts[category] = (counts[category] || 0) + 1;
      return counts;
    }, {});
  }, [visaScopedItems]);

  const activeCategoryItems = useMemo(
    () =>
      visaScopedItems.filter((item) => getItemCategory(item) === activeCategory),
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

    return [...items].sort(
      (a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0)
    );
  }, [activeCategoryItems, searchQuery, sortMode]);

  const dashboardStats = useMemo(() => {
    const lastUpdatedItem = [...resourceItems].sort(
      (a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0)
    )[0];
    const categoryNames = new Set(DEFAULT_CATEGORIES.map((category) => category.name));
    for (const template of templates) {
      for (const category of template.categories || []) {
        const normalizedCategory = normalizeCategoryMetadata(category);
        if (normalizedCategory.name) categoryNames.add(normalizedCategory.name);
      }
    }
    for (const item of resourceItems) {
      categoryNames.add(getItemCategory(item));
    }

    return {
      totalResources: resourceItems.length,
      activeCategories: categoryNames.size,
      lastUpdated: lastUpdatedItem?.updatedAt || null,
      lastUpdatedBy: lastUpdatedItem?.updatedBy || lastUpdatedItem?.createdBy || "Admin",
    };
  }, [resourceItems, templates]);

  const visaCards = useMemo(() => {
    const allCard = {
      visaSlug: ALL_VISAS,
      title: "All Resources",
      count: resourceItems.length,
    };

    return [
      allCard,
      ...templates.map((template) => ({
        visaSlug: template.visaSlug,
        title: template.title,
        count: resourceItems.filter((item) => item.visaSlug === template.visaSlug).length,
      })),
    ];
  }, [resourceItems, templates]);

  const nextOrder = useMemo(() => {
    const targetVisa = activeVisa === ALL_VISAS ? form.visaSlug : activeVisa;
    const visaItems = itemsBySlug[targetVisa] || [];
    if (!visaItems.length) return 0;
    return Math.max(...visaItems.map((item) => Number(item.order) || 0)) + 10;
  }, [activeVisa, form.visaSlug, itemsBySlug]);

  const setDefaultForm = useCallback(
    (overrides = {}) => {
      const targetVisa = activeVisa === ALL_VISAS ? defaultVisaSlug : activeVisa;
      setForm({
        ...emptyForm,
        visaSlug: targetVisa,
        category: activeCategory,
        order: String(nextOrder),
        ...overrides,
      });
      setFiles([]);
      setFileInputKey((current) => current + 1);
      setEditingItem(null);
    },
    [activeCategory, activeVisa, defaultVisaSlug, nextOrder]
  );

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
          setForm((current) => ({
            ...current,
            visaSlug: current.visaSlug || detailResults[0]?.template.visaSlug || "",
          }));
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

    const categoryMeta = { name: category, icon: newCategoryIcon };
    const targetSlugs =
      activeVisa === ALL_VISAS
        ? templates.map((template) => template.visaSlug)
        : [activeVisa];

    if (!targetSlugs.length) {
      setError("Choose a visa type before creating a category.");
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
          const nextCategories = mergeCategoryDefinitions(
            DEFAULT_CATEGORIES,
            template?.categories || [],
            [categoryMeta]
          );
          const response = await fetch(`/api/resource-templates/${visaSlug}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ categories: nextCategories }),
          });
          const data = await response.json();

          if (!response.ok || !data.success) {
            throw new Error(data.error || `Failed to create category for ${visaSlug}.`);
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
          ? "Category created for all visa templates."
          : "Category created."
      );
    } catch (categoryError) {
      setError(categoryError.message);
    } finally {
      setIsCategorySaving(false);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setSuccessLinks([]);

    const targetVisa = editingItem?.visaSlug || form.visaSlug || defaultVisaSlug;
    const targetCategory = cleanText(form.category) || activeCategory || "Uncategorized";

    if (!targetVisa || targetVisa === ALL_VISAS) {
      setError("Choose a visa type before saving.");
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
        if (editingItem.kind === "note") {
          payload.noteText = form.noteText;
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
        payload.append("noteText", form.noteText);

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

      setDefaultForm({ visaSlug: targetVisa, category: targetCategory });
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (item) => {
    const resourceName = item.name || item.fileName || "this resource";
    const confirmed = window.confirm(
      `Delete "${resourceName}" from Zoho WorkDrive and Firebase?`
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

  const activeVisaTitle =
    activeVisa === ALL_VISAS ? "All Resources" : templateBySlug[activeVisa]?.title || "Resources";

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-[#dbe7e1] bg-white p-6 shadow-sm">
        <div className="grid gap-6 xl:grid-cols-[1fr_auto] xl:items-center">
          <div className="flex min-w-0 items-center gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-[#eff7f3] text-[#4F726B]">
              <Folder className="h-8 w-8" />
            </div>
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-[#17372e]">
                Resource Management
              </h1>
              <p className="mt-1 text-sm text-[#60786f]">
                Upload, organize, and manage resources by visa type and category.
              </p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3 xl:min-w-[620px]">
            <div className="border-l border-[#dce7e2] pl-5">
              <p className="text-xs font-semibold text-[#71857d]">Total resources</p>
              <div className="mt-2 flex items-center gap-3">
                <FileText className="h-5 w-5 text-[#60786f]" />
                <div>
                  <p className="text-xl font-semibold text-[#17372e]">
                    {dashboardStats.totalResources}
                  </p>
                  <p className="text-xs text-[#71857d]">files, notes and links</p>
                </div>
              </div>
            </div>
            <div className="border-l border-[#dce7e2] pl-5">
              <p className="text-xs font-semibold text-[#71857d]">Active categories</p>
              <div className="mt-2 flex items-center gap-3">
                <FolderPlus className="h-5 w-5 text-[#60786f]" />
                <div>
                  <p className="text-xl font-semibold text-[#17372e]">
                    {dashboardStats.activeCategories}
                  </p>
                  <p className="text-xs text-[#71857d]">across all visas</p>
                </div>
              </div>
            </div>
            <div className="border-l border-[#dce7e2] pl-5">
              <p className="text-xs font-semibold text-[#71857d]">Last updated</p>
              <div className="mt-2 flex items-center gap-3">
                <Clock3 className="h-5 w-5 text-[#60786f]" />
                <div>
                  <p className="text-sm font-semibold text-[#17372e]">
                    {formatDateTime(dashboardStats.lastUpdated)}
                  </p>
                  <p className="text-xs text-[#71857d]">by {dashboardStats.lastUpdatedBy}</p>
                </div>
              </div>
            </div>
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

      <section className="grid gap-3 md:grid-cols-5">
        {visaCards.map((card) => {
          const active = activeVisa === card.visaSlug;
          return (
            <button
              key={card.visaSlug}
              type="button"
              onClick={() => {
                setActiveVisa(card.visaSlug);
                if (card.visaSlug !== ALL_VISAS) {
                  updateFormField("visaSlug", card.visaSlug);
                }
              }}
              className={`rounded-md border px-5 py-4 text-left shadow-sm transition-colors ${
                active
                  ? "border-[#4F726B] bg-[#4F726B] text-white"
                  : "border-[#dbe7e1] bg-white text-[#17372e] hover:border-[#8ac6ad]"
              }`}
            >
              <span className="block text-sm font-semibold">{card.title}</span>
              <span className={active ? "mt-1 block text-xs text-white/80" : "mt-1 block text-xs text-[#71857d]"}>
                {card.count} resources
              </span>
            </button>
          );
        })}
      </section>

      <section className="grid gap-5 xl:grid-cols-[290px_minmax(360px,0.8fr)_minmax(560px,1.4fr)]">
        <aside className="rounded-lg border border-[#dbe7e1] bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-[#17372e]">Categories</h2>
            <Button type="button" variant="outline" size="icon" className="bg-white">
              <SlidersHorizontal className="h-4 w-4" />
            </Button>
          </div>

          <div className="relative mt-4">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8aa099]" />
            <Input
              value={categorySearchQuery}
              onChange={(event) => setCategorySearchQuery(event.target.value)}
              placeholder="Search categories"
              className="h-10 border-[#d7e4de] bg-white pl-9"
            />
          </div>

          <div className="mt-4 space-y-2">
            {visibleCategories.map((category) => {
              const active = activeCategory === category.name;
              const count = categoryCounts[category.name] || 0;
              return (
                <button
                  key={category.name}
                  type="button"
                  onClick={() => {
                    setActiveCategory(category.name);
                    setForm((current) => ({ ...current, category: category.name }));
                  }}
                  className={`flex w-full items-center justify-between rounded-md px-3 py-3 text-sm font-medium transition-colors ${
                    active
                      ? "bg-[#e8f4ee] text-[#4F726B]"
                      : "bg-white text-[#38564b] hover:bg-[#f7faf8]"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <CategoryIcon icon={category.icon} className="h-4 w-4" />
                    {category.name}
                  </span>
                  <span>{count}</span>
                </button>
              );
            })}
          </div>

          <div className="mt-4">
            {showNewCategory ? (
              <div className="space-y-2 rounded-md border border-[#dbe7e1] p-3">
                <Input
                  value={newCategoryName}
                  onChange={(event) => setNewCategoryName(event.target.value)}
                  placeholder="Category name"
                  className="h-9"
                />
                <div className="space-y-2">
                  <p className="text-xs font-medium text-[#60786f]">Icon</p>
                  <div className="grid grid-cols-4 gap-2">
                    {categoryIconOptions.map((option) => {
                      const selected = newCategoryIcon === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          title={option.label}
                          onClick={() => setNewCategoryIcon(option.value)}
                          className={`flex h-9 items-center justify-center rounded-md border transition-colors ${
                            selected
                              ? "border-[#4F726B] bg-[#e8f4ee] text-[#4F726B]"
                              : "border-[#dbe7e1] bg-white text-[#60786f] hover:border-[#8ac6ad]"
                          }`}
                        >
                          <CategoryIcon icon={option.value} className="h-4 w-4" />
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    className="h-9 bg-[#4F726B] text-white hover:bg-[#4F726B]"
                    disabled={isCategorySaving}
                    onClick={handleNewCategory}
                  >
                    {isCategorySaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Add
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-9 bg-white"
                    disabled={isCategorySaving}
                    onClick={() => {
                      setShowNewCategory(false);
                      setNewCategoryName("");
                      setNewCategoryIcon("folder");
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                className="h-10 w-full border-[#d7e4de] bg-white text-[#4F726B]"
                onClick={() => setShowNewCategory(true)}
              >
                <Plus className="h-4 w-4" />
                New category
              </Button>
            )}
          </div>

          <div className="mt-6 rounded-md border border-[#dbe7e1] bg-[#f7faf8] p-4 text-center">
            <PackageOpen className="mx-auto h-8 w-8 text-[#8aa099]" />
            <p className="mt-3 text-sm font-semibold text-[#17372e]">Need another category?</p>
            <p className="mt-1 text-xs leading-5 text-[#60786f]">
              Create custom categories with icons for each visa template.
            </p>
          </div>
        </aside>

        <section className="rounded-lg border border-[#dbe7e1] bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold text-[#17372e]">{activeCategory}</h2>
            <Badge variant="outline" className="border-[#dbe7e1] bg-[#f7faf8] text-[#60786f]">
              {activeCategoryItems.length} items
            </Badge>
          </div>
          <p className="mt-1 text-sm text-[#60786f]">
            Resources assigned to {activeCategory}.
          </p>

          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            {!editingItem ? (
              <div
                onDragOver={(event) => {
                  event.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                className={`rounded-lg border border-dashed px-5 py-8 text-center transition-colors ${
                  isDragging
                    ? "border-[#4F726B] bg-[#4F726B]/5"
                    : "border-[#d7e4de] bg-[#fbfdfc]"
                }`}
              >
                <UploadCloud className="mx-auto h-9 w-9 text-[#4F726B]" />
                <p className="mt-3 text-sm font-semibold text-[#17372e]">
                  Drag and drop files here
                </p>
                <p className="my-2 text-xs text-[#71857d]">or</p>
                <label className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-md bg-[#4F726B] px-4 text-sm font-medium text-white hover:bg-[#4F726B]">
                  Choose files to upload
                  <input
                    key={fileInputKey}
                    type="file"
                    multiple
                    className="sr-only"
                    onChange={(event) => handleFiles(event.target.files)}
                  />
                </label>
                <p className="mt-4 text-xs leading-5 text-[#71857d]">
                  Maximum file size: 50 MB per file
                </p>
                {files.length ? (
                  <p className="mt-2 text-xs font-medium text-[#4F726B]">
                    {files.length} selected
                  </p>
                ) : null}
              </div>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-[#224238]">Visa type</label>
                <FormSelect
                  value={form.visaSlug}
                  onChange={(value) => updateFormField("visaSlug", value)}
                  disabled={Boolean(editingItem)}
                >
                  {templates.map((template) => (
                    <option key={template.visaSlug} value={template.visaSlug}>
                      {template.title}
                    </option>
                  ))}
                </FormSelect>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-[#224238]">Type</label>
                <FormSelect
                  value={form.kind}
                  onChange={(value) => updateFormField("kind", value)}
                  disabled={Boolean(editingItem)}
                >
                  {resourceTypeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </FormSelect>
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="resource-name" className="text-sm font-medium text-[#224238]">
                Name
              </label>
              <Input
                id="resource-name"
                value={form.name}
                onChange={(event) => updateFormField("name", event.target.value)}
                placeholder={form.kind === "file" ? "Optional for file uploads" : "Resource name"}
                className="h-10 border-[#d7e4de] bg-white"
              />
            </div>

            {form.kind === "link" ? (
              <div className="space-y-2">
                <label htmlFor="resource-link" className="text-sm font-medium text-[#224238]">
                  Link URL
                </label>
                <Input
                  id="resource-link"
                  type="url"
                  value={form.externalUrl}
                  onChange={(event) => updateFormField("externalUrl", event.target.value)}
                  placeholder="https://example.com/resource"
                  className="h-10 border-[#d7e4de] bg-white"
                />
              </div>
            ) : null}

            {form.kind === "note" ? (
              <div className="space-y-2">
                <label htmlFor="resource-note" className="text-sm font-medium text-[#224238]">
                  Note
                </label>
                <Textarea
                  id="resource-note"
                  value={form.noteText}
                  onChange={(event) => updateFormField("noteText", event.target.value)}
                  placeholder="Write the note shown in the portal"
                  rows={5}
                  className="border-[#d7e4de] bg-white"
                />
              </div>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
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
              <div className="space-y-2">
                <label htmlFor="resource-order" className="text-sm font-medium text-[#224238]">
                  Order
                </label>
                <Input
                  id="resource-order"
                  type="number"
                  value={form.order}
                  onChange={(event) => updateFormField("order", event.target.value)}
                  className="h-10 border-[#d7e4de] bg-white"
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Button
                type="submit"
                disabled={isSubmitting || isLoading}
                className="h-10 bg-[#4F726B] text-white hover:bg-[#4F726B]"
              >
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
                {editingItem ? "Save resource" : form.kind === "file" ? "Upload file" : "Add resource"}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-10 bg-white"
                onClick={() => setDefaultForm()}
              >
                {editingItem ? "Cancel edit" : "Reset"}
              </Button>
            </div>
          </form>
        </section>

        <section className="overflow-hidden rounded-lg border border-[#dbe7e1] bg-white shadow-sm">
          <div className="border-b border-[#dbe7e1] px-5 py-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-base font-semibold text-[#17372e]">
                  Resources ({tableItems.length})
                </h2>
                <p className="mt-1 text-xs text-[#71857d]">{activeVisaTitle} / {activeCategory}</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-[1fr_auto_150px] lg:min-w-[560px]">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8aa099]" />
                  <Input
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Search resources"
                    className="h-10 border-[#d7e4de] bg-white pl-9"
                  />
                </div>
                <Button type="button" variant="outline" className="h-10 bg-white">
                  <SlidersHorizontal className="h-4 w-4" />
                  Filters
                </Button>
                <FormSelect value={sortMode} onChange={setSortMode}>
                  <option value="newest">Newest first</option>
                  <option value="oldest">Oldest first</option>
                  <option value="name">Name</option>
                </FormSelect>
              </div>
            </div>
          </div>

          {isLoading ? (
            <div className="flex min-h-[420px] items-center justify-center text-[#4F726B]">
              <Loader2 className="h-7 w-7 animate-spin" />
            </div>
          ) : tableItems.length ? (
            <div className="text-sm">
              <div className="hidden border-b border-[#edf1ef] bg-[#fbfdfc] px-5 py-3 text-xs font-semibold text-[#71857d] md:grid md:grid-cols-[minmax(0,1fr)_130px_100px_64px_52px] md:items-center md:gap-4">
                <span>Name</span>
                <span>Uploaded date</span>
                <span>Type</span>
                <span className="text-right">Link</span>
                <span className="text-right">Delete</span>
              </div>
              <div className="divide-y divide-[#edf1ef]">
                {tableItems.map((item) => {
                  const isBusy = activeMutationId === item.id;
                  return (
                    <div
                      key={`${item.visaSlug}:${item.id}`}
                      className="grid gap-3 px-5 py-4 md:grid-cols-[minmax(0,1fr)_130px_100px_64px_52px] md:items-center md:gap-4"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[#dbe7e1] bg-[#f7faf8] text-[#4F726B]">
                          <KindIcon kind={item.kind} className="h-4 w-4" />
                        </div>
                        <p className="min-w-0 truncate font-semibold text-[#17372e]">
                          {item.name || item.fileName || "Untitled resource"}
                        </p>
                      </div>
                      <div className="text-sm text-[#60786f]">
                        <span className="font-medium text-[#71857d] md:hidden">
                          Uploaded:{" "}
                        </span>
                        {formatDate(item.createdAt || item.updatedAt)}
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
                      <div className="flex justify-start md:justify-end">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          title="Delete"
                          disabled={isBusy}
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
                Upload files, add notes, or add links to start building this resource category.
              </p>
            </div>
          )}
        </section>
      </section>
    </div>
  );
}
