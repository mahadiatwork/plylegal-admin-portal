"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, GripVertical, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NAVIGATION_GROUPS, SELECTABLE_GROUP_KEYS } from "@/lib/questionnaireNavigationModel";

/**
 * Drag and drop for reordering a list with the native HTML5 API (no dependency).
 * `onDrop(sourceId, targetId)` fires when `sourceId` is dropped on `targetId`.
 * Every draggable also gets keyboard-accessible move buttons (see ReorderButtons), so drag and
 * drop is never the only way to change the order.
 */
export function useDragReorder(onDrop, scope = "reorder") {
  const [dragId, setDragId] = useState("");
  const [overId, setOverId] = useState("");
  const reset = () => { setDragId(""); setOverId(""); };
  const mime = `application/x-ply-${scope}`;

  /**
   * Props for the element you grab. Use this on a handle when the row contains inputs (text in an
   * input cannot be selected inside a draggable parent); the whole row is still the drop target.
   */
  const bindSource = (id, { disabled = false } = {}) => ({
    draggable: !disabled,
    "data-dragging": dragId === id ? "true" : undefined,
    onDragStart: (event) => {
      if (disabled) return;
      event.stopPropagation?.();
      setDragId(id);
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData(mime, id);
        event.dataTransfer.setData("text/plain", id);
        const row = event.currentTarget?.closest?.("[data-drag-row]");
        if (row && event.dataTransfer.setDragImage) event.dataTransfer.setDragImage(row, 16, 16);
      }
    },
    onDragEnd: reset,
  });

  /** Props for the element something can be dropped on (the row). */
  const bindTarget = (id) => ({
    "data-drag-row": "true",
    "data-drop-target": overId === id && dragId && dragId !== id ? "true" : undefined,
    onDragOver: (event) => {
      if (!dragId || dragId === id) return;
      event.preventDefault();
      event.stopPropagation?.();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
      if (overId !== id) setOverId(id);
    },
    onDragLeave: () => { if (overId === id) setOverId(""); },
    onDrop: (event) => {
      if (!dragId || dragId === id) return;
      event.preventDefault();
      event.stopPropagation?.();
      const source = dragId;
      reset();
      onDrop(source, id);
    },
  });

  /** One element that is both grabbed and dropped on (rows with no inputs). */
  const bind = (id, options = {}) => ({ ...bindSource(id, options), ...bindTarget(id) });

  return { bind, bindSource, bindTarget, dragId, overId };
}

/** Visual cue for the draggable element (the whole row is the drag target). */
export function DragHandle({ className = "" }) {
  return <GripVertical aria-hidden="true" className={`h-3.5 w-3.5 shrink-0 cursor-grab text-[#9fb4ac] ${className}`} />;
}

/** Keyboard / pointer fallback for drag and drop: move one step earlier or later. */
export function ReorderButtons({ label, canMoveUp, canMoveDown, disabled = false, onMove, className = "" }) {
  const base = "inline-flex h-6 w-6 items-center justify-center rounded border border-transparent text-[#60786f] hover:border-[#d2dfd8] hover:bg-white focus-visible:border-[#8eb2a3] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4F726B]/30 disabled:pointer-events-none disabled:opacity-30";
  return (
    <span className={`inline-flex shrink-0 items-center gap-0.5 ${className}`}>
      <button type="button" data-testid="reorder-up" aria-label={`Move ${label} earlier`} title="Move earlier" className={base} disabled={disabled || !canMoveUp} onClick={(event) => { event?.stopPropagation?.(); onMove(-1); }}>
        <ArrowUp className="h-3.5 w-3.5" />
      </button>
      <button type="button" data-testid="reorder-down" aria-label={`Move ${label} later`} title="Move later" className={base} disabled={disabled || !canMoveDown} onClick={(event) => { event?.stopPropagation?.(); onMove(1); }}>
        <ArrowDown className="h-3.5 w-3.5" />
      </button>
    </span>
  );
}

/**
 * Which groups the questionnaire includes, and their sidebar order.
 * Excluded groups keep their sections (and all saved client answers) but are hidden from clients.
 */
export function QuestionnaireStructurePanel({
  definitionDriven,
  groups,
  disabled = false,
  onEnable,
  onToggleGroup,
  onMoveGroup,
  onReorderGroup,
}) {
  const drag = useDragReorder(onReorderGroup, "group");

  if (!definitionDriven) {
    return (
      <div data-testid="structure-panel" className="rounded-xl border border-dashed border-[#cbdad3] bg-[#fbfcfb] p-3 text-xs leading-5 text-[#60786f]">
        <p className="font-semibold text-[#24453b]">Questionnaire structure</p>
        <p className="mt-1">This questionnaire follows the standard Client Portal sidebar. Take control to choose which applicant groups it includes, add your own sections and reorder them.</p>
        <Button type="button" variant="outline" size="sm" className="mt-3 w-full border-[#d2dfd8] bg-white text-[#38564b]" disabled={disabled} onClick={onEnable}>Customise structure</Button>
      </div>
    );
  }

  const included = groups.filter((group) => group.included);
  return (
    <div data-testid="structure-panel" className="rounded-xl border border-[#dce6e1] bg-white p-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#6f837b]">Who this questionnaire covers</p>
      <p className="mt-1 text-[11px] leading-4 text-[#7a8e86]">Untick a group to hide it from clients. Its sections and any saved answers are kept.</p>
      <ul className="mt-2 space-y-1" aria-label="Questionnaire groups">
        {groups.map((group) => {
          const position = included.findIndex((candidate) => candidate.key === group.key);
          return (
            <li
              key={group.key}
              data-testid="structure-group"
              data-group={group.key}
              data-included={group.included ? "true" : "false"}
              {...(group.included ? drag.bind(group.key, { disabled }) : {})}
              className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 text-xs ${group.included ? "border-[#dce6e1] bg-[#fbfcfb]" : "border-transparent bg-transparent text-[#8a9b95]"} ${drag.overId === group.key && drag.dragId ? "ring-2 ring-[#79ae97]" : ""}`}
            >
              {group.included ? <DragHandle /> : <span className="w-3.5" />}
              <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 accent-[#1f6654]"
                  checked={group.included}
                  disabled={disabled || (group.included && included.length === 1)}
                  aria-label={`Include ${group.label}`}
                  onChange={(event) => onToggleGroup(group.key, event.target.checked)}
                />
                <span className="min-w-0 flex-1 truncate font-medium text-[#24453b]">{group.label}</span>
                <span className="shrink-0 text-[10px] text-[#7a8e86]">{group.pageCount} section{group.pageCount === 1 ? "" : "s"}</span>
              </label>
              {group.included ? (
                <ReorderButtons
                  label={`${group.label} group`}
                  disabled={disabled}
                  canMoveUp={position > 0}
                  canMoveDown={position >= 0 && position < included.length - 1}
                  onMove={(direction) => onMoveGroup(group.key, direction)}
                />
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * "Add section": a brand-new section with its own title under any included group, or (optionally)
 * one of the built-in Client Portal screens that is not in the questionnaire yet.
 */
export function NewSectionDialog({ open, groups, initialGroup, builtInOptions = [], error = "", disabled = false, onCreate, onCancel }) {
  const [title, setTitle] = useState("");
  const [groupKey, setGroupKey] = useState(initialGroup || groups[0]?.key || "main-applicant");
  const [source, setSource] = useState("new");
  const [builtInHref, setBuiltInHref] = useState("");
  if (!open) return null;

  const selectedGroup = NAVIGATION_GROUPS[groupKey];
  const groupBuiltIns = builtInOptions.filter((option) => option.groupKey === groupKey);
  const usingBuiltIn = source === "builtin" && groupBuiltIns.length > 0;
  const effectiveHref = usingBuiltIn ? (groupBuiltIns.some((option) => option.href === builtInHref) ? builtInHref : groupBuiltIns[0].href) : "";
  const canCreate = usingBuiltIn ? Boolean(effectiveHref) : Boolean(title.trim());

  const submit = () => {
    if (!canCreate || disabled) return;
    onCreate(usingBuiltIn ? { groupKey, builtInHref: effectiveHref } : { groupKey, title: title.trim() });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" data-testid="new-section-dialog">
      <section role="dialog" aria-modal="true" aria-labelledby="new-section-heading" className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
        <h2 id="new-section-heading" className="text-lg font-semibold text-[#17372e]">Add section</h2>
        <p className="mt-1 text-sm text-[#71857d]">Sections group related questions. A new section appears in the client sidebar under the group you choose.</p>

        <div className="mt-5 space-y-4">
          <div className="space-y-2">
            <label htmlFor="new-section-group" className="text-sm font-medium text-[#24453b]">Group</label>
            <select
              id="new-section-group"
              className="flex h-10 w-full rounded-md border border-[#d7e4de] bg-white px-3 text-sm"
              value={groupKey}
              onChange={(event) => setGroupKey(event.target.value)}
            >
              {groups.map((group) => <option key={group.key} value={group.key}>{group.label}</option>)}
            </select>
            {selectedGroup ? <p className="text-xs text-[#7a8e86]">Answers are stored for {selectedGroup.people}.</p> : null}
          </div>

          {groupBuiltIns.length ? (
            <fieldset className="space-y-2">
              <legend className="sr-only">Section source</legend>
              <label className="flex items-center gap-2 text-sm text-[#24453b]">
                <input type="radio" name="new-section-source" checked={source === "new"} onChange={() => setSource("new")} />
                A new section with my own title
              </label>
              <label className="flex items-center gap-2 text-sm text-[#24453b]">
                <input type="radio" name="new-section-source" checked={source === "builtin"} onChange={() => setSource("builtin")} />
                An existing Client Portal page ({groupBuiltIns.length} available)
              </label>
            </fieldset>
          ) : null}

          {usingBuiltIn ? (
            <div className="space-y-2">
              <label htmlFor="new-section-builtin" className="text-sm font-medium text-[#24453b]">Client Portal page</label>
              <select id="new-section-builtin" className="flex h-10 w-full rounded-md border border-[#d7e4de] bg-white px-3 text-sm" value={effectiveHref} onChange={(event) => setBuiltInHref(event.target.value)}>
                {groupBuiltIns.map((option) => <option key={option.href} value={option.href}>{option.title}</option>)}
              </select>
            </div>
          ) : (
            <div className="space-y-2">
              <label htmlFor="new-section-title" className="text-sm font-medium text-[#24453b]">Section title</label>
              <Input
                id="new-section-title"
                autoFocus
                placeholder="e.g. Employer background"
                value={title}
                maxLength={120}
                onChange={(event) => setTitle(event.target.value)}
                onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault?.(); submit(); } }}
              />
              <p className="text-xs text-[#7a8e86]">You can rename it later. Its address and storage keys are fixed once created, so saved answers always stay attached.</p>
            </div>
          )}

          {error ? <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="outline" className="border-[#d1ddd7] bg-white text-[#38564b]" onClick={onCancel}>Cancel</Button>
          <Button type="button" className="bg-[#4F726B] text-white hover:bg-[#3d625a]" disabled={disabled || !canCreate} onClick={submit}><Plus />Create section</Button>
        </div>
      </section>
    </div>
  );
}

export { SELECTABLE_GROUP_KEYS };

/**
 * Order of the fields inside a repeater (the popup a client fills in for each row).
 * `fields`: [{ id, label, dependents }] for the top-level fields; fields that appear only for a
 * particular answer travel with the field that reveals them.
 */
export function FieldOrderList({ fields, disabled = false, onReorder, onMove }) {
  const drag = useDragReorder(onReorder, "field");
  if (fields.length < 2) return null;
  return (
    <div data-testid="field-order" className="space-y-2 rounded-xl border border-[#d9e6e0] bg-[#f8fbf9] p-4">
      <div>
        <h4 className="text-sm font-semibold text-[#24453b]">Field order</h4>
        <p className="text-xs text-[#71857d]">Drag a field, or use the arrows, to change the order clients see in each record.</p>
      </div>
      <ol className="space-y-1" aria-label="Record field order">
        {fields.map((field, index) => (
          <li
            key={field.id}
            data-testid="field-order-row"
            data-field-id={field.id}
            {...drag.bind(field.id, { disabled })}
            className="flex items-center gap-2 rounded-lg border border-[#dce6e1] bg-white px-2 py-1.5 text-sm text-[#24453b] data-[drop-target=true]:ring-2 data-[drop-target=true]:ring-[#79ae97] data-[dragging=true]:opacity-50"
          >
            <DragHandle />
            <span className="min-w-0 flex-1 truncate">{field.label}</span>
            {field.dependents ? <span className="shrink-0 text-[10px] text-[#7a8e86]">+{field.dependents} follow-up{field.dependents === 1 ? "" : "s"}</span> : null}
            <ReorderButtons
              label={`field “${field.label}”`}
              disabled={disabled}
              canMoveUp={index > 0}
              canMoveDown={index < fields.length - 1}
              onMove={(direction) => onMove(field.id, direction)}
            />
          </li>
        ))}
      </ol>
    </div>
  );
}
