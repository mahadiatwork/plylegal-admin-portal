"use client";

import { useState } from "react";
import {
  BookOpen,
  FileText,
  Folder,
  GripVertical,
  Link2,
  Loader2,
  PencilLine,
  Plus,
  Scale,
  Search,
  ShieldCheck,
  StickyNote,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const categoryIconOptions = [
  { value: "folder", label: "Folder" },
  { value: "guide", label: "Guide" },
  { value: "policy", label: "Policy" },
  { value: "link", label: "Link" },
  { value: "file", label: "File" },
  { value: "note", label: "Note" },
  { value: "shield", label: "Shield" },
  { value: "scale", label: "Legal" },
];

export function CategoryIcon({ icon, className }) {
  if (icon === "guide") return <BookOpen className={className} />;
  if (icon === "policy") return <ShieldCheck className={className} />;
  if (icon === "link") return <Link2 className={className} />;
  if (icon === "file") return <FileText className={className} />;
  if (icon === "note") return <StickyNote className={className} />;
  if (icon === "shield") return <ShieldCheck className={className} />;
  if (icon === "scale") return <Scale className={className} />;
  return <Folder className={className} />;
}

function categoryKey(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export default function ResourceFoldersSidebar({
  categories = [],
  categoryCounts = {},
  activeCategory = "Uncategorized",
  categorySearchQuery = "",
  onCategorySearchChange,
  onSelectCategory,
  showNewCategory = false,
  newCategoryName = "",
  newCategoryIcon = "folder",
  onNewCategoryNameChange,
  onNewCategoryIconChange,
  onToggleNewCategory,
  onCancelNewCategory,
  onNewCategory,
  isLoading = false,
  isCategorySaving = false,
  categoryMutationActive = false,
  isSubmitting = false,
  activeMutationId = null,
  isReordering = false,
  renamingCategory = null,
  deletingCategory = null,
  onRenameCategory,
  onDeleteCategory,
  canReorderFolders = false,
  isReorderingFolders = false,
  onReorderFolder,
}) {
  const [draggedFolder, setDraggedFolder] = useState(null);
  const [dragOverFolder, setDragOverFolder] = useState(null);
  const folderMutationDisabled = isLoading
    || isCategorySaving
    || categoryMutationActive
    || isSubmitting
    || Boolean(activeMutationId)
    || isReordering
    || isReorderingFolders;
  const reorderEnabled = canReorderFolders && !folderMutationDisabled && categories.length > 1;

  const reorderWithKeyboard = (event, category, index) => {
    if (!reorderEnabled || !["ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    const target = categories[index + (event.key === "ArrowUp" ? -1 : 1)];
    if (target) return onReorderFolder(category.name, target.name, event.currentTarget);
  };

  return (
    <aside className="rounded-lg border border-[#dbe7e1] bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-[#17372e]">Folders</h2>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9 bg-white text-[#4F726B]"
          disabled={isLoading || categoryMutationActive || isReorderingFolders}
          aria-expanded={showNewCategory}
          onClick={onToggleNewCategory}
        >
          <Plus className="h-4 w-4" />
          New
        </Button>
      </div>

      <div className="relative mt-4">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8aa099]" />
        <Input
          value={categorySearchQuery}
          onChange={(event) => onCategorySearchChange(event.target.value)}
          placeholder="Search folders"
          aria-label="Search folders"
          className="h-10 border-[#d7e4de] bg-white pl-9"
        />
      </div>

      {categories.length > 1 ? (
        <p id="folder-reorder-guidance" className="mt-3 text-xs text-[#71857d]" role="status">
          {isReorderingFolders ? "Saving folder order..." : reorderEnabled
            ? "Drag a folder handle, or focus it and use the Up and Down arrow keys. Changes save automatically."
            : categorySearchQuery.trim()
              ? "Clear the folder search to reorder folders."
              : "Folder reordering is available when editing is finished."}
        </p>
      ) : null}
      <div className="mt-4 space-y-2">
        {categories.map((category, index) => {
          const active = categoryKey(activeCategory) === categoryKey(category.name);
          const count = categoryCounts[categoryKey(category.name)] || 0;
          return (
            <div
              key={category.name}
              className={`flex w-full items-center rounded-md text-sm font-medium transition-colors ${
                active
                  ? "bg-[#e8f4ee] text-[#4F726B]"
                  : "bg-white text-[#38564b] hover:bg-[#f7faf8]"
              } ${dragOverFolder === category.name ? "ring-2 ring-[#8ac6ad]" : ""}`}
              onDragOver={(event) => {
                if (!reorderEnabled || !draggedFolder || draggedFolder === category.name) return;
                event.preventDefault();
                setDragOverFolder(category.name);
              }}
              onDragLeave={() => setDragOverFolder(null)}
              onDrop={(event) => {
                if (!reorderEnabled || !draggedFolder) return;
                event.preventDefault();
                setDragOverFolder(null);
                const source = draggedFolder;
                setDraggedFolder(null);
                if (source !== category.name) return onReorderFolder(source, category.name);
              }}
            >
              <button
                type="button"
                className="ml-1 flex h-9 w-6 shrink-0 cursor-grab items-center justify-center rounded text-[#71857d] focus:outline-none focus:ring-2 focus:ring-[#8ac6ad] disabled:cursor-not-allowed disabled:opacity-40"
                aria-label={`Move folder ${category.name}`}
                aria-describedby="folder-reorder-guidance"
                title="Drag to reorder, or use the Up and Down arrow keys"
                disabled={!reorderEnabled}
                draggable={reorderEnabled}
                onDragStart={(event) => {
                  if (!reorderEnabled) return;
                  setDraggedFolder(category.name);
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/plain", category.name);
                }}
                onDragEnd={() => { setDraggedFolder(null); setDragOverFolder(null); }}
                onKeyDown={(event) => reorderWithKeyboard(event, category, index)}
              >
                <GripVertical className="h-4 w-4" />
              </button>
              <button
                type="button"
                disabled={categoryMutationActive || isReordering || isReorderingFolders}
                aria-pressed={active}
                onClick={() => onSelectCategory(category)}
                className="flex min-w-0 flex-1 items-center justify-between gap-2 px-3 py-3 text-left"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <CategoryIcon icon={category.icon} className="h-4 w-4 shrink-0" />
                  <span className="truncate">{category.name}</span>
                </span>
                <span>{count}</span>
              </button>
              {category.name.toLowerCase() !== "uncategorized" ? (
                <span className="mr-1 flex shrink-0 items-center">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    title={`Rename ${category.name}`}
                    aria-label={`Rename ${category.name}`}
                    disabled={folderMutationDisabled}
                    onClick={() => onRenameCategory(category)}
                    className="h-8 w-8 text-[#60786f] hover:bg-[#edf5f1] hover:text-[#17372e]"
                  >
                    {renamingCategory === category.name ? <Loader2 className="h-4 w-4 animate-spin" /> : <PencilLine className="h-4 w-4" />}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    title={`Delete ${category.name}`}
                    aria-label={`Delete ${category.name}`}
                    disabled={folderMutationDisabled}
                    onClick={() => onDeleteCategory(category)}
                    className="h-8 w-8 text-red-600 hover:bg-red-50 hover:text-red-700"
                  >
                    {deletingCategory === category.name ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  </Button>
                </span>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="mt-4">
        {showNewCategory ? (
          <div className="space-y-2 rounded-md border border-[#dbe7e1] p-3">
            <Input
              value={newCategoryName}
              onChange={(event) => onNewCategoryNameChange(event.target.value)}
              placeholder="Folder name"
              aria-label="Folder name"
              className="h-9"
            />
            <div className="space-y-2">
              <p className="text-xs font-medium text-[#60786f]">Icon</p>
              <div className="grid grid-cols-4 gap-2" role="group" aria-label="Folder icon">
                {categoryIconOptions.map((option) => {
                  const selected = newCategoryIcon === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      title={option.label}
                      aria-label={`${option.label} icon`}
                      aria-pressed={selected}
                      onClick={() => onNewCategoryIconChange(option.value)}
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
                disabled={isCategorySaving || categoryMutationActive}
                onClick={onNewCategory}
              >
                {isCategorySaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Add
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-9 bg-white"
                disabled={isCategorySaving || categoryMutationActive}
                onClick={onCancelNewCategory}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
