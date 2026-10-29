import { UNCATEGORIZED } from "./resourceTemplateCategories.mjs";
import {
  MATTER_SHARED_FILES_SOURCE,
  matchesMatterResourceSource,
  normalizeMatterResourceOrder,
  sortMatterResources,
} from "./matterResources.mjs";

const MAX_CATEGORY_MUTATION_WRITES = 400;
const CATEGORY_ICONS = new Set([
  "folder", "guide", "policy", "link", "file", "note", "shield", "scale",
  "government", "checklist", "briefcase", "education", "people", "calendar", "globe", "info",
]);
const uncategorizedKey = UNCATEGORIZED.toLowerCase();

function categoryName(value) {
  const name = typeof value === "string" ? value : value?.name;
  return typeof name === "string" ? name.trim() : "";
}

function categoryKey(value) {
  return (categoryName(value) || UNCATEGORIZED).toLowerCase();
}

function categoryDescription(value) {
  return typeof value?.description === "string" ? value.description.trim() : "";
}

function categoryError(message, status) {
  return Object.assign(new Error(message), { status });
}

export function normalizeMatterResourceCategories(rawCategories, resources = [], source = "") {
  const categories = [];
  const seen = new Set();
  const addCategory = (value) => {
    const name = categoryName(value);
    if (!name || seen.has(name.toLowerCase())) return;
    seen.add(name.toLowerCase());
    const description = categoryDescription(value);
    categories.push({
      name: name.toLowerCase() === uncategorizedKey ? UNCATEGORIZED : name,
      icon: CATEGORY_ICONS.has(value?.icon) ? value.icon : "folder",
      ...(description ? { description } : {}),
    });
  };

  if (Array.isArray(rawCategories)) rawCategories.forEach(addCategory);
  if (!seen.has(uncategorizedKey)) {
    categories.unshift({ name: UNCATEGORIZED, icon: "folder" });
    seen.add(uncategorizedKey);
  }
  resources
    .filter((resource) => matchesMatterResourceSource(resource, source) && resource.status !== "archived")
    .forEach((resource) => addCategory(resource.category));
  return categories;
}

async function readMatter(transaction, db, appId, source = "") {
  const ref = db.collection("applications").doc(appId);
  const snapshot = await transaction.get(ref);
  if (!snapshot.exists) throw categoryError("Matter not found", 404);
  const resources = await transaction.get(ref.collection("resources"));
  const docs = resources.docs.filter((doc) => matchesMatterResourceSource(doc.data() || {}, source));
  const categoryField = source === MATTER_SHARED_FILES_SOURCE
    ? "sharedFileCategories"
    : "resourceCategories";
  return {
    ref,
    docs,
    categories: normalizeMatterResourceCategories(
      snapshot.data()?.[categoryField],
      docs.map((doc) => doc.data() || {}),
      source,
    ),
  };
}

function assertSafeMutationSize(writeCount) {
  if (writeCount > MAX_CATEGORY_MUTATION_WRITES) {
    throw categoryError(
      `Folder update exceeds the safe limit of ${MAX_CATEGORY_MUTATION_WRITES} writes`,
      409
    );
  }
}

function commitCategories(transaction, matter, categories, changes, actor, source = "") {
  assertSafeMutationSize(changes.length + 1);
  const now = new Date();
  const items = changes.map(({ doc, update }) => {
    transaction.update(doc.ref, { ...update, updatedAt: now, updatedBy: actor });
    return {
      id: doc.id,
      category: update.category || categoryName(doc.data()?.category) || UNCATEGORIZED,
      ...(update.order !== undefined ? { order: update.order } : {}),
    };
  });
  transaction.update(matter.ref, {
    [source === MATTER_SHARED_FILES_SOURCE ? "sharedFileCategories" : "resourceCategories"]: categories,
    updatedAt: now,
    updatedBy: actor,
  });
  return { categories, items, updatedAt: now.toISOString(), updatedBy: actor };
}

function requireCategoryName(value, message = "Folder name is required") {
  const name = categoryName(value);
  if (!name) throw categoryError(message, 400);
  return name;
}

function hasCategory(matter, key) {
  return matter.categories.some((category) => categoryKey(category) === key) ||
    matter.docs.some((doc) => categoryKey(doc.data()?.category) === key);
}

export async function createMatterResourceCategory({ db, appId, name, icon = "folder", description = "", actor, source = "" }) {
  const nextName = requireCategoryName(name);
  if (!CATEGORY_ICONS.has(icon)) throw categoryError("Unsupported folder icon", 400);
  return db.runTransaction(async (transaction) => {
    const matter = await readMatter(transaction, db, appId, source);
    if (hasCategory(matter, nextName.toLowerCase())) {
      throw categoryError(`Folder "${nextName}" already exists`, 409);
    }
    return commitCategories(
      transaction,
      matter,
      [...matter.categories, {
        name: nextName,
        icon,
        ...(categoryDescription({ description }) ? { description: categoryDescription({ description }) } : {}),
      }],
      [],
      actor,
      source,
    );
  });
}

export async function renameMatterResourceCategory({ db, appId, name, nextName, description, actor, source = "" }) {
  const currentName = requireCategoryName(name);
  const replacementName = requireCategoryName(nextName, "New folder name is required");
  const key = currentName.toLowerCase();
  const nextKey = replacementName.toLowerCase();
  if (key === uncategorizedKey) throw categoryError("Uncategorized cannot be renamed", 400);
  if (nextKey === uncategorizedKey) throw categoryError("Uncategorized is reserved", 400);
  const descriptionWasProvided = description !== undefined;
  const nextDescription = categoryDescription({ description });
  const nameChanged = currentName !== replacementName;
  if (currentName === replacementName && !descriptionWasProvided) {
    throw categoryError("Choose a different folder name or description", 400);
  }

  return db.runTransaction(async (transaction) => {
    const matter = await readMatter(transaction, db, appId, source);
    if (!hasCategory(matter, key)) throw categoryError(`Folder "${currentName}" was not found`, 404);
    if (nextKey !== key && hasCategory(matter, nextKey)) {
      throw categoryError(`Folder "${replacementName}" already exists`, 409);
    }
    const categories = matter.categories.map((category) =>
      categoryKey(category) === key
        ? {
            ...category,
            name: replacementName,
            ...(descriptionWasProvided ? { description: nextDescription } : {}),
          }
        : category
    );
    if (!categories.some((category) => categoryKey(category) === nextKey)) {
      categories.push({ name: replacementName, icon: "folder" });
    }
    const changes = nameChanged
      ? matter.docs
          .filter((doc) => categoryKey(doc.data()?.category) === key)
          .map((doc) => ({ doc, update: { category: replacementName } }))
      : [];
    return commitCategories(transaction, matter, categories, changes, actor, source);
  });
}

export async function deleteMatterResourceCategory({ db, appId, name, actor, source = "" }) {
  const currentName = requireCategoryName(name);
  const key = currentName.toLowerCase();
  if (key === uncategorizedKey) throw categoryError("Uncategorized cannot be deleted", 400);

  return db.runTransaction(async (transaction) => {
    const matter = await readMatter(transaction, db, appId, source);
    if (!hasCategory(matter, key)) throw categoryError(`Folder "${currentName}" was not found`, 404);
    const categories = matter.categories.filter((category) => categoryKey(category) !== key);
    const movedResources = sortMatterResources(matter.docs
      .filter((doc) => categoryKey(doc.data()?.category) === key)
      .map((doc) => ({ ...doc.data(), id: doc.id })));
    if (!movedResources.length) {
      return commitCategories(transaction, matter, categories, [], actor, source);
    }
    const byId = new Map(matter.docs.map((doc) => [doc.id, doc]));
    const targetResources = sortMatterResources(matter.docs
      .filter((doc) => categoryKey(doc.data()?.category) === uncategorizedKey)
      .map((doc) => ({ ...doc.data(), id: doc.id })));
    let nextOrder = targetResources.reduce((max, resource) => {
      const order = normalizeMatterResourceOrder(resource.order);
      return order === undefined || order === null ? max : Math.max(max, order);
    }, 0);
    const changes = [];

    // Give legacy unordered rows a stable place before appended resources.
    // Matching archived rows also move so restoring one cannot revive the folder.
    for (const resource of targetResources) {
      if (normalizeMatterResourceOrder(resource.order) == null) {
        nextOrder += 10;
        changes.push({ doc: byId.get(resource.id), update: { order: nextOrder } });
      }
    }
    for (const resource of movedResources) {
      nextOrder += 10;
      changes.push({
        doc: byId.get(resource.id),
        update: { category: UNCATEGORIZED, order: nextOrder },
      });
    }
    return commitCategories(transaction, matter, categories, changes, actor, source);
  });
}
