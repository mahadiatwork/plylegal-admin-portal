import { getWorkDriveViewerUrl } from "./resourceFiles.mjs";

const MAX_MATTER_REORDER_WRITES = 400;

function matterCategory(value) {
  const category = typeof value === "string" ? value.trim() : "";
  return category || "Uncategorized";
}

function matterResourceError(message, status) {
  return Object.assign(new Error(message), { status });
}

export function normalizeMatterResourceOrder(rawValue, fallback = undefined) {
  if (
    rawValue === null || rawValue === undefined ||
    (typeof rawValue === "string" && !rawValue.trim())
  ) {
    return fallback;
  }

  if (typeof rawValue !== "number" && typeof rawValue !== "string") return null;

  const parsed = Number(rawValue);
  return Number.isFinite(parsed) ? parsed : null;
}

function timestampMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.toDate === "function") return value.toDate().getTime();
  if (value instanceof Date) return value.getTime();
  if (typeof value === "object" && typeof value.seconds === "number") {
    return value.seconds * 1000;
  }

  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

export function sortMatterResources(resources) {
  return [...resources].sort((a, b) => {
    const orderA = normalizeMatterResourceOrder(a.order);
    const orderB = normalizeMatterResourceOrder(b.order);
    const hasOrderA = orderA !== undefined && orderA !== null;
    const hasOrderB = orderB !== undefined && orderB !== null;

    if (hasOrderA && hasOrderB && orderA !== orderB) return orderA - orderB;
    if (hasOrderA !== hasOrderB) return hasOrderA ? -1 : 1;

    const createdDiff = timestampMillis(b.createdAt) - timestampMillis(a.createdAt);
    if (createdDiff) return createdDiff;

    const titleDiff = String(a.title || a.fileName || "").localeCompare(
      String(b.title || b.fileName || ""),
      undefined,
      { sensitivity: "base" }
    );
    if (titleDiff) return titleDiff;
    return String(a.id || "").localeCompare(String(b.id || ""));
  });
}

export async function reorderMatterResources({
  db,
  appId,
  category,
  itemIds,
  actor,
}) {
  if (typeof category !== "string" || !category.trim()) {
    throw matterResourceError("Resource category is required", 400);
  }
  const normalizedCategory = matterCategory(category);
  if (!Array.isArray(itemIds) || itemIds.length < 2) {
    throw matterResourceError("At least two resources are required to reorder", 400);
  }
  if (itemIds.length > MAX_MATTER_REORDER_WRITES) {
    throw matterResourceError(
      `Resource reorder exceeds the safe limit of ${MAX_MATTER_REORDER_WRITES} items`,
      409
    );
  }

  const normalizedIds = itemIds.map((itemId) =>
    typeof itemId === "string" ? itemId.trim() : ""
  );
  if (normalizedIds.some((itemId) => !itemId) || new Set(normalizedIds).size !== normalizedIds.length) {
    throw matterResourceError("Resource order contains invalid or duplicate IDs", 400);
  }

  const resourcesRef = db
    .collection("applications")
    .doc(appId)
    .collection("resources");

  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(resourcesRef);
    const matchingDocs = snapshot.docs.filter((doc) => {
      const data = doc.data() || {};
      return (
        data.status !== "archived" &&
        data.source !== "documentReview" &&
        matterCategory(data.category).toLowerCase() === normalizedCategory.toLowerCase()
      );
    });
    const byId = new Map(matchingDocs.map((doc) => [doc.id, doc]));

    if (
      matchingDocs.length !== normalizedIds.length ||
      normalizedIds.some((itemId) => !byId.has(itemId))
    ) {
      throw matterResourceError(
        "Resource list changed. Refresh before reordering this folder.",
        409
      );
    }

    const now = new Date();
    const items = normalizedIds.map((itemId, index) => {
      const order = (index + 1) * 10;
      transaction.update(byId.get(itemId).ref, {
        order,
        updatedAt: now,
        updatedBy: actor,
      });
      return { id: itemId, order };
    });

    return {
      category: normalizedCategory,
      items,
      updatedAt: now.toISOString(),
      updatedBy: actor,
    };
  });
}

export async function createViewOnlyMatterResourceLink({
  zohoClient,
  workDriveResourceId,
  linkName,
}) {
  try {
    const publicLink = await zohoClient.createWorkDrivePublicLink(
      workDriveResourceId,
      linkName,
      { allowDownload: false }
    );
    const viewerUrl = getWorkDriveViewerUrl(publicLink?.link);

    if (publicLink?.allowDownload !== false || !viewerUrl) {
      throw new Error("WorkDrive did not confirm a view-only resource link");
    }

    return { publicLink, viewerUrl };
  } catch (error) {
    await zohoClient.deleteWorkDriveResource(workDriveResourceId).catch((cleanupError) => {
      console.error(
        "Failed to clean up WorkDrive file after view-only link creation failed:",
        cleanupError.message
      );
    });
    throw error;
  }
}
