const MAX_REORDER_ITEMS = 400;

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function itemCategory(value) {
  return cleanText(value) || "Uncategorized";
}

function orderingError(message, status) {
  return Object.assign(new Error(message), { status });
}

export async function reorderResourceTemplateItems({
  db,
  visaSlug,
  category,
  itemIds,
  actor,
}) {
  const normalizedVisaSlug = cleanText(visaSlug);
  const normalizedCategory = cleanText(category);
  const normalizedItemIds = Array.isArray(itemIds)
    ? itemIds.map(cleanText)
    : [];

  if (!normalizedVisaSlug || normalizedVisaSlug === "all") {
    throw orderingError("Choose one visa template before reordering", 400);
  }
  if (!normalizedCategory) {
    throw orderingError("Category is required", 400);
  }
  if (!normalizedItemIds.length || normalizedItemIds.some((id) => !id)) {
    throw orderingError("A complete ordered item list is required", 400);
  }
  if (normalizedItemIds.length > MAX_REORDER_ITEMS) {
    throw orderingError(`No more than ${MAX_REORDER_ITEMS} resources can be reordered at once`, 400);
  }
  if (new Set(normalizedItemIds).size !== normalizedItemIds.length) {
    throw orderingError("Ordered item IDs must be unique", 400);
  }

  const templateRef = db.collection("resourceTemplates").doc(normalizedVisaSlug);

  return db.runTransaction(async (transaction) => {
    const templateSnapshot = await transaction.get(templateRef);
    if (!templateSnapshot.exists) {
      throw orderingError("Resource template was not found", 404);
    }

    const itemsSnapshot = await transaction.get(templateRef.collection("items"));
    const categoryItems = itemsSnapshot.docs.filter((item) => {
      const data = item.data() || {};
      return data.kind !== "folder" &&
        itemCategory(data.category).toLowerCase() === normalizedCategory.toLowerCase();
    });
    if (categoryItems.some((item) => item.data()?.deletionPending === true)) {
      throw orderingError(
        "Finish pending resource deletion before reordering this folder.",
        409
      );
    }
    const categoryIds = new Set(categoryItems.map((item) => item.id));

    if (
      categoryIds.size !== normalizedItemIds.length ||
      normalizedItemIds.some((id) => !categoryIds.has(id))
    ) {
      throw orderingError("Resource list changed. Refresh before reordering.", 409);
    }

    const docsById = new Map(categoryItems.map((item) => [item.id, item]));
    const now = new Date();
    const items = normalizedItemIds.map((id, index) => ({
      id,
      order: (index + 1) * 10,
    }));

    for (const item of items) {
      transaction.update(docsById.get(item.id).ref, {
        order: item.order,
        updatedAt: now,
        updatedBy: actor,
      });
    }
    transaction.update(templateRef, { updatedAt: now, updatedBy: actor });

    return {
      items,
      updatedAt: now.toISOString(),
      updatedBy: actor,
    };
  });
}
