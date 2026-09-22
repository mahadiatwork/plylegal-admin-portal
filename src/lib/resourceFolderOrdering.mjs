import { normalizeMatterResourceCategories } from "./matterResourceCategories.mjs";

const MAX_FOLDERS = 200;

function folderError(message, status) {
  return Object.assign(new Error(message), { status });
}

function nameOf(value) {
  const name = typeof value === "string" ? value : value?.name;
  return typeof name === "string" ? name.trim() : "";
}

function keyOf(value) {
  return nameOf(value).toLowerCase();
}

function validateNames(names) {
  if (!Array.isArray(names) || names.length < 2 || names.length > MAX_FOLDERS ||
      names.some((name) => typeof name !== "string" || !name.trim())) {
    throw folderError("A complete folder order is required", 400);
  }
  const keys = names.map(keyOf);
  if (new Set(keys).size !== keys.length) {
    throw folderError("Folder names must be unique", 400);
  }
  return keys;
}

function assertCompleteOrder(categories, keys) {
  const current = new Set(categories.map(keyOf));
  if (current.size !== keys.length || keys.some((key) => !current.has(key))) {
    throw folderError("Folder list changed. Refresh before reordering.", 409);
  }
}

export async function reorderMatterResourceFolders({ db, appId, names, actor }) {
  const keys = validateNames(names);
  const ref = db.collection("applications").doc(appId);
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) throw folderError("Matter not found", 404);
    const resources = await transaction.get(ref.collection("resources"));
    const categories = normalizeMatterResourceCategories(
      snapshot.data()?.resourceCategories,
      resources.docs.map((doc) => doc.data() || {}),
    );
    assertCompleteOrder(categories, keys);
    const byName = new Map(categories.map((category) => [keyOf(category), category]));
    const ordered = keys.map((key) => byName.get(key));
    const now = new Date();
    transaction.update(ref, { resourceCategories: ordered, updatedAt: now, updatedBy: actor });
    return { categories: ordered, updatedAt: now.toISOString(), updatedBy: actor };
  });
}

export async function reorderResourceTemplateFolders({ db, visaSlugs, names, actor, defaultCategories }) {
  const keys = validateNames(names);
  const slugs = [...new Set(visaSlugs)];
  if (!slugs.length) throw folderError("Choose a visa template before reordering", 400);
  return db.runTransaction(async (transaction) => {
    const templates = [];
    // Firestore transactions require all reads before writes.
    for (const visaSlug of slugs) {
      const ref = db.collection("resourceTemplates").doc(visaSlug);
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) throw folderError(`Resource template ${visaSlug} was not found`, 404);
      const items = await transaction.get(ref.collection("items"));
      templates.push({ visaSlug, ref, snapshot, items });
    }

    const plans = templates.map(({ visaSlug, ref, snapshot, items }) => {
      const byName = new Map();
      const add = (category) => {
        const name = nameOf(category);
        if (!name) return;
        const key = name.toLowerCase();
        byName.set(key, typeof category === "string"
          ? { name, icon: "folder" }
          : { ...category, name });
      };
      add({ name: "Uncategorized", icon: "folder" });
      (Array.isArray(snapshot.data()?.categories) ? snapshot.data().categories : defaultCategories).forEach(add);
      items.docs.filter((item) => item.data()?.kind !== "folder").forEach((item) => add(
        byName.get(keyOf(item.data()?.category)) || { name: nameOf(item.data()?.category) || "Uncategorized", icon: "folder" }
      ));
      return { visaSlug, ref, byName };
    });
    const union = new Set(plans.flatMap(({ byName }) => [...byName.keys()]));
    if (union.size !== keys.length || keys.some((key) => !union.has(key))) {
      throw folderError("Folder list changed. Refresh before reordering.", 409);
    }

    const now = new Date();
    const changes = plans.map(({ visaSlug, ref, byName }) => {
      const categories = keys.filter((key) => byName.has(key)).map((key) => ({
        ...byName.get(key),
        order: keys.indexOf(key) * 10 + 10,
      }));
      transaction.update(ref, { categories, updatedAt: now, updatedBy: actor });
      return { visaSlug, categories };
    });
    return { changes, updatedAt: now.toISOString(), updatedBy: actor };
  });
}
