export const UNCATEGORIZED = "Uncategorized";
const MAX_CATEGORY_MUTATION_WRITES = 400;

function categoryName(value) {
  const name = typeof value === "string" ? value : value?.name;
  return typeof name === "string" ? name.trim() : "";
}

function categoryError(message, status) {
  return Object.assign(new Error(message), { status });
}

function renameCategoryValue(category, name) {
  if (typeof category === "string") return name;
  return { ...category, name };
}

function normalizedOrder(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "string" && !value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function appendedUncategorizedOrders(items, movedItems) {
  const existingOrders = items.docs
    .filter((item) => {
      const data = item.data() || {};
      const currentCategory = categoryName(data.category) || UNCATEGORIZED;
      return data.kind !== "folder" &&
        currentCategory.toLowerCase() === UNCATEGORIZED.toLowerCase();
    })
    .map((item) => normalizedOrder(item.data()?.order))
    .filter((order) => order !== null);
  let nextOrder = Math.max(0, ...existingOrders);
  const orderedResources = movedItems
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.data()?.kind !== "folder")
    .sort((left, right) => {
      const leftOrder = normalizedOrder(left.item.data()?.order) ?? 0;
      const rightOrder = normalizedOrder(right.item.data()?.order) ?? 0;
      return leftOrder - rightOrder || left.index - right.index;
    });

  return new Map(
    orderedResources.map(({ item }) => {
      nextOrder += 10;
      return [item.id, nextOrder];
    })
  );
}

function assertSafeMutationSize(writeCount) {
  if (writeCount > MAX_CATEGORY_MUTATION_WRITES) {
    throw categoryError(
      `Category update exceeds the safe limit of ${MAX_CATEGORY_MUTATION_WRITES} writes`,
      409
    );
  }
}

export async function deleteResourceTemplateCategory({
  db,
  visaSlugs,
  name,
  actor,
  defaultCategories = [{ name: UNCATEGORIZED, icon: "folder" }],
}) {
  const normalizedName = categoryName(name).toLowerCase();
  if (!normalizedName) throw categoryError("Category name is required", 400);
  if (normalizedName === UNCATEGORIZED.toLowerCase()) {
    throw categoryError("Uncategorized cannot be deleted", 400);
  }

  return db.runTransaction(async (transaction) => {
    const templates = [];

    // Read every affected template and its items before writing. All Resources
    // therefore either succeeds for every visa or leaves every visa unchanged.
    for (const visaSlug of [...new Set(visaSlugs)]) {
      const ref = db.collection("resourceTemplates").doc(visaSlug);
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) {
        throw categoryError(`Resource template ${visaSlug} was not found`, 404);
      }
      const items = await transaction.get(ref.collection("items"));
      templates.push({ visaSlug, ref, snapshot, items });
    }

    const plans = [];
    for (const { visaSlug, ref, snapshot, items } of templates) {
      const currentCategories = Array.isArray(snapshot.data().categories)
        ? snapshot.data().categories
        : defaultCategories;
      const categories = currentCategories.filter(
        (category) => categoryName(category).toLowerCase() !== normalizedName
      );
      const movedItems = items.docs.filter(
        (item) => categoryName(item.data().category).toLowerCase() === normalizedName
      );
      if (!movedItems.length && categories.length === currentCategories.length) continue;

      if (!categories.some((category) => categoryName(category).toLowerCase() === UNCATEGORIZED.toLowerCase())) {
        categories.unshift({ name: UNCATEGORIZED, icon: "folder" });
      }

      plans.push({
        visaSlug,
        ref,
        items,
        categories,
        movedItems,
        appendedOrders: appendedUncategorizedOrders(items, movedItems),
      });
    }

    assertSafeMutationSize(
      plans.reduce((writeCount, plan) => writeCount + plan.movedItems.length + 1, 0)
    );

    const now = new Date();
    const changes = [];
    let movedResourceCount = 0;

    for (const { visaSlug, ref, categories, movedItems, appendedOrders } of plans) {
      for (const item of movedItems) {
        transaction.update(item.ref, {
          category: UNCATEGORIZED,
          ...(appendedOrders.has(item.id) ? { order: appendedOrders.get(item.id) } : {}),
          updatedAt: now,
          updatedBy: actor,
        });
      }
      transaction.update(ref, { categories, updatedAt: now, updatedBy: actor });
      movedResourceCount += movedItems.filter((item) => item.data().kind !== "folder").length;
      changes.push({
        visaSlug,
        categories,
        movedItemIds: movedItems.map((item) => item.id),
        movedItems: movedItems.map((item) => ({
          id: item.id,
          ...(appendedOrders.has(item.id) ? { order: appendedOrders.get(item.id) } : {}),
        })),
      });
    }

    return { changes, movedResourceCount, updatedAt: now.toISOString(), updatedBy: actor };
  });
}

export async function renameResourceTemplateCategory({
  db,
  visaSlugs,
  name,
  nextName,
  actor,
  defaultCategories = [{ name: UNCATEGORIZED, icon: "folder" }],
}) {
  const currentName = categoryName(name);
  const replacementName = categoryName(nextName);
  const normalizedName = currentName.toLowerCase();
  const normalizedNextName = replacementName.toLowerCase();

  if (!normalizedName) throw categoryError("Category name is required", 400);
  if (!normalizedNextName) throw categoryError("New category name is required", 400);
  if (currentName === replacementName) {
    throw categoryError("Choose a different category name", 400);
  }
  if (normalizedName === UNCATEGORIZED.toLowerCase()) {
    throw categoryError("Uncategorized cannot be renamed", 400);
  }
  if (normalizedNextName === UNCATEGORIZED.toLowerCase()) {
    throw categoryError("Uncategorized is reserved", 400);
  }

  return db.runTransaction(async (transaction) => {
    const templates = [];

    // Read every selected template and item collection before writing so an
    // All Resources rename cannot leave visa templates out of sync.
    for (const visaSlug of [...new Set(visaSlugs)]) {
      const ref = db.collection("resourceTemplates").doc(visaSlug);
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) {
        throw categoryError(`Resource template ${visaSlug} was not found`, 404);
      }
      const items = await transaction.get(ref.collection("items"));
      templates.push({ visaSlug, ref, snapshot, items });
    }

    const affectedTemplates = templates.filter(({ snapshot, items }) => {
      const categories = Array.isArray(snapshot.data().categories)
        ? snapshot.data().categories
        : defaultCategories;
      return categories.some(
        (category) => categoryName(category).toLowerCase() === normalizedName
      ) || items.docs.some(
        (item) => categoryName(item.data().category).toLowerCase() === normalizedName
      );
    });

    if (!affectedTemplates.length) {
      throw categoryError(`Category "${currentName}" was not found`, 404);
    }

    for (const { snapshot, items } of affectedTemplates) {
      const categories = Array.isArray(snapshot.data().categories)
        ? snapshot.data().categories
        : defaultCategories;
      const hasConflictingCategory = normalizedNextName !== normalizedName && (
        categories.some(
          (category) => categoryName(category).toLowerCase() === normalizedNextName
        ) || items.docs.some(
          (item) => categoryName(item.data().category).toLowerCase() === normalizedNextName
        )
      );
      if (hasConflictingCategory) {
        throw categoryError(`Category "${replacementName}" already exists`, 409);
      }
    }

    assertSafeMutationSize(
      affectedTemplates.reduce(
        (writeCount, { items }) => writeCount + 1 + items.docs.filter(
          (item) => categoryName(item.data().category).toLowerCase() === normalizedName
        ).length,
        0
      )
    );

    const now = new Date();
    const changes = [];
    let renamedResourceCount = 0;

    for (const { visaSlug, ref, snapshot, items } of affectedTemplates) {
      const currentCategories = Array.isArray(snapshot.data().categories)
        ? snapshot.data().categories
        : defaultCategories;
      const renamedItems = items.docs.filter(
        (item) => categoryName(item.data().category).toLowerCase() === normalizedName
      );
      const hasCategoryMetadata = currentCategories.some(
        (category) => categoryName(category).toLowerCase() === normalizedName
      );
      const categories = currentCategories.map((category) =>
        categoryName(category).toLowerCase() === normalizedName
          ? renameCategoryValue(category, replacementName)
          : category
      );
      if (!hasCategoryMetadata && renamedItems.length) {
        categories.push({ name: replacementName, icon: "folder" });
      }

      for (const item of renamedItems) {
        transaction.update(item.ref, {
          category: replacementName,
          updatedAt: now,
          updatedBy: actor,
        });
      }
      transaction.update(ref, { categories, updatedAt: now, updatedBy: actor });
      renamedResourceCount += renamedItems.filter((item) => item.data().kind !== "folder").length;
      changes.push({
        visaSlug,
        categories,
        renamedItemIds: renamedItems.map((item) => item.id),
      });
    }

    return {
      changes,
      renamedResourceCount,
      updatedAt: now.toISOString(),
      updatedBy: actor,
    };
  });
}
