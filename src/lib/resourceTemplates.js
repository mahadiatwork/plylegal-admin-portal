import zohoClient from "@/lib/zohoClient";
import {
  cleanText,
  normalizeResourceUrl,
  sanitizeFileName,
  sanitizeLinkName,
  serializeTimestamp,
} from "@/lib/sharedResources";

export const MAX_RESOURCE_TEMPLATE_FILE_SIZE = 50 * 1024 * 1024;
export const RESOURCE_TEMPLATE_STATUSES = ["active", "draft", "archived"];
export const RESOURCE_TEMPLATE_ITEM_KINDS = ["folder", "file", "link", "note"];
export const RESOURCE_TEMPLATE_ITEM_STATUSES = ["active", "hidden"];
export const DEFAULT_RESOURCE_TEMPLATE_CATEGORY = "Uncategorized";
export const RESOURCE_TEMPLATE_CATEGORY_ICONS = [
  "folder",
  "guide",
  "policy",
  "link",
  "file",
  "note",
  "shield",
  "scale",
];
export const DEFAULT_RESOURCE_TEMPLATE_CATEGORIES = [
  { name: "Uncategorized", icon: "folder" },
  { name: "Guides", icon: "guide" },
  { name: "Policies", icon: "policy" },
  { name: "Helpful Links", icon: "link" },
];

const RESOURCE_TEMPLATE_DEFINITIONS = [
  {
    visaSlug: "186",
    title: "Subclass 186",
    workDriveFolderId: "hf3e66da96e2822c344cfb9927deb2ab9f216",
    workDriveFolderUrl:
      "https://workdrive.zoho.com.au/folder/hf3e66da96e2822c344cfb9927deb2ab9f216?layout=list",
    envKeys: [
      "RESOURCE_TEMPLATE_186_WORKDRIVE_FOLDER_ID",
      "VISA_186_RESOURCE_TEMPLATE_WORKDRIVE_FOLDER_ID",
    ],
  },
  {
    visaSlug: "482",
    title: "Subclass 482",
    workDriveFolderId: "hf3e63bcec93d5faf412cb6fbcb3075f4f2e2",
    workDriveFolderUrl:
      "https://workdrive.zoho.com.au/folder/hf3e63bcec93d5faf412cb6fbcb3075f4f2e2?layout=list",
    envKeys: [
      "RESOURCE_TEMPLATE_482_WORKDRIVE_FOLDER_ID",
      "VISA_482_RESOURCE_TEMPLATE_WORKDRIVE_FOLDER_ID",
    ],
  },
  {
    visaSlug: "partner",
    title: "Subclass 820/801",
    workDriveFolderId: "hf3e6c83ab75e91074b409d245dff4c1dc630",
    workDriveFolderUrl:
      "https://workdrive.zoho.com.au/folder/hf3e6c83ab75e91074b409d245dff4c1dc630?layout=list",
    envKeys: [
      "RESOURCE_TEMPLATE_PARTNER_WORKDRIVE_FOLDER_ID",
      "PARTNER_RESOURCE_TEMPLATE_WORKDRIVE_FOLDER_ID",
    ],
  },
  {
    visaSlug: "protection",
    title: "Subclass 866",
    workDriveFolderId: "hf3e62a84dfc392b9461dbb061e126f09e2c9",
    workDriveFolderUrl:
      "https://workdrive.zoho.com.au/folder/hf3e62a84dfc392b9461dbb061e126f09e2c9?layout=list",
    envKeys: [
      "RESOURCE_TEMPLATE_PROTECTION_WORKDRIVE_FOLDER_ID",
      "PROTECTION_RESOURCE_TEMPLATE_WORKDRIVE_FOLDER_ID",
    ],
  },
];

const LEGACY_RESOURCE_TEMPLATE_TITLES = {
  partner: ["partner visa"],
  protection: ["protection visa"],
};

export function normalizeFolderId(rawValue) {
  let value = rawValue;

  if (Array.isArray(value)) {
    value = value[0];
  }

  if (value && typeof value === "object") {
    value = value.id || value.value || value.name || "";
  }

  value = cleanText(value);
  if (!value) return null;

  const folderUrlPatterns = [
    /\/folder\/([^/?#]+)/,
    /\/folders\/([^/?#]+)/,
    /\/ws\/([^/?#]+)\/folders(?:\/files)?(?:[/?#]|$)/,
  ];

  for (const pattern of folderUrlPatterns) {
    const match = value.match(pattern);
    if (match?.[1] && match[1] !== "files") {
      return match[1];
    }
  }

  return value;
}

function getConfiguredFolderId(definition) {
  for (const key of definition.envKeys) {
    const folderId = normalizeFolderId(process.env[key]);
    if (folderId) {
      return folderId;
    }
  }

  return definition.workDriveFolderId;
}

export function getResourceTemplateDefinitions() {
  return RESOURCE_TEMPLATE_DEFINITIONS.map((definition) => ({
    ...definition,
    workDriveFolderId: getConfiguredFolderId(definition),
  }));
}

export function getResourceTemplateDefinition(visaSlug) {
  const normalizedSlug = normalizeVisaSlug(visaSlug);
  return getResourceTemplateDefinitions().find(
    (definition) => definition.visaSlug === normalizedSlug
  );
}

export function normalizeVisaSlug(rawValue) {
  const value = cleanText(rawValue).toLowerCase();
  if (value === "subclass-482" || value === "482-visa") return "482";
  if (value === "subclass-186" || value === "186-visa") return "186";
  return value;
}

export function normalizeTemplateStatus(rawValue, fallback = "active") {
  const value = cleanText(rawValue).toLowerCase();
  if (!value) return fallback;
  return RESOURCE_TEMPLATE_STATUSES.includes(value) ? value : null;
}

export function normalizeTemplateItemKind(rawValue) {
  const value = cleanText(rawValue).toLowerCase();
  return RESOURCE_TEMPLATE_ITEM_KINDS.includes(value) ? value : null;
}

export function normalizeTemplateItemStatus(rawValue, fallback = "active") {
  const value = cleanText(rawValue).toLowerCase();
  if (!value) return fallback;
  return RESOURCE_TEMPLATE_ITEM_STATUSES.includes(value) ? value : null;
}

export function normalizeTemplateParentId(rawValue) {
  const value = cleanText(rawValue);
  if (!value || value === "__root__" || value.toLowerCase() === "root") {
    return null;
  }

  return value;
}

export function normalizeTemplateCategory(rawValue) {
  return cleanText(rawValue) || DEFAULT_RESOURCE_TEMPLATE_CATEGORY;
}

export function normalizeTemplateCategoryIcon(rawValue) {
  const value = cleanText(rawValue).toLowerCase();
  return RESOURCE_TEMPLATE_CATEGORY_ICONS.includes(value) ? value : "folder";
}

export function normalizeTemplateCategories(rawValue) {
  const values = Array.isArray(rawValue) ? rawValue : [];
  const categoriesByName = new Map();

  for (const value of values) {
    const name =
      typeof value === "string" ? cleanText(value) : cleanText(value?.name);
    if (!name) continue;

    categoriesByName.set(name.toLowerCase(), {
      name,
      icon:
        typeof value === "string"
          ? "folder"
          : normalizeTemplateCategoryIcon(value?.icon),
    });
  }

  return [...categoriesByName.values()];
}

export function normalizeTemplateOrder(rawValue, fallback = 0) {
  if (rawValue === null || rawValue === undefined || rawValue === "") {
    return fallback;
  }

  const parsed = Number(rawValue);
  return Number.isFinite(parsed) ? parsed : null;
}

export function serializeTemplateDoc(doc) {
  const data = doc.data();

  return {
    id: doc.id,
    ...data,
    createdAt: serializeTimestamp(data.createdAt),
    updatedAt: serializeTimestamp(data.updatedAt),
    archivedAt: serializeTimestamp(data.archivedAt),
    publishedAt: serializeTimestamp(data.publishedAt),
  };
}

export function serializeTemplateItemDoc(doc) {
  const data = doc.data();

  return {
    id: doc.id,
    ...data,
    createdAt: serializeTimestamp(data.createdAt),
    updatedAt: serializeTimestamp(data.updatedAt),
    hiddenAt: serializeTimestamp(data.hiddenAt),
  };
}

export function sortTemplateItems(items) {
  return [...items].sort((a, b) => {
    const orderA = Number.isFinite(Number(a.order)) ? Number(a.order) : 0;
    const orderB = Number.isFinite(Number(b.order)) ? Number(b.order) : 0;
    if (orderA !== orderB) return orderA - orderB;
    return cleanText(a.name).localeCompare(cleanText(b.name), undefined, {
      sensitivity: "base",
    });
  });
}

export async function ensureResourceTemplate(db, visaSlug, actor = "admin") {
  const definition = getResourceTemplateDefinition(visaSlug);

  if (!definition) {
    return { error: "Unsupported visa template", status: 404 };
  }

  const templateRef = db.collection("resourceTemplates").doc(definition.visaSlug);
  const templateSnap = await templateRef.get();
  const now = new Date();

  if (!templateSnap.exists) {
    const templateData = {
      visaSlug: definition.visaSlug,
      title: definition.title,
      status: "active",
      categories: DEFAULT_RESOURCE_TEMPLATE_CATEGORIES,
      workDriveFolderId: definition.workDriveFolderId,
      workDriveFolderUrl: definition.workDriveFolderUrl,
      createdAt: now,
      updatedAt: now,
      createdBy: actor,
      updatedBy: actor,
    };

    await templateRef.set(templateData);
    return {
      definition,
      ref: templateRef,
      template: {
        id: templateRef.id,
        ...templateData,
        createdAt: templateData.createdAt.toISOString(),
        updatedAt: templateData.updatedAt.toISOString(),
      },
    };
  }

  const existingData = templateSnap.data() || {};
  const backfill = {};
  const existingTitle = cleanText(existingData.title);
  const legacyTitles = LEGACY_RESOURCE_TEMPLATE_TITLES[definition.visaSlug] || [];

  if (!existingData.visaSlug) backfill.visaSlug = definition.visaSlug;
  if (
    !existingTitle ||
    legacyTitles.includes(existingTitle.toLowerCase())
  ) {
    backfill.title = definition.title;
  }
  if (!existingData.status) backfill.status = "active";
  if (!Array.isArray(existingData.categories)) {
    backfill.categories = DEFAULT_RESOURCE_TEMPLATE_CATEGORIES;
  }
  if (existingData.workDriveFolderId !== definition.workDriveFolderId) {
    backfill.workDriveFolderId = definition.workDriveFolderId;
  }
  if (existingData.workDriveFolderUrl !== definition.workDriveFolderUrl) {
    backfill.workDriveFolderUrl = definition.workDriveFolderUrl;
  }

  if (Object.keys(backfill).length) {
    backfill.updatedAt = now;
    backfill.updatedBy = actor;
    await templateRef.set(backfill, { merge: true });
    const updatedSnap = await templateRef.get();
    return { definition, ref: templateRef, template: serializeTemplateDoc(updatedSnap) };
  }

  return { definition, ref: templateRef, template: serializeTemplateDoc(templateSnap) };
}

export async function getTemplateItems(db, visaSlug) {
  const snapshot = await db
    .collection("resourceTemplates")
    .doc(visaSlug)
    .collection("items")
    .get();

  return sortTemplateItems(snapshot.docs.map(serializeTemplateItemDoc));
}

export async function validateTemplateParent(db, visaSlug, parentId) {
  if (!parentId) {
    return { valid: true };
  }

  const parentSnap = await db
    .collection("resourceTemplates")
    .doc(visaSlug)
    .collection("items")
    .doc(parentId)
    .get();

  if (!parentSnap.exists) {
    return { valid: false, error: "Parent folder was not found", status: 400 };
  }

  const parentData = parentSnap.data() || {};
  if (parentData.kind !== "folder") {
    return { valid: false, error: "Parent must be a folder item", status: 400 };
  }

  return { valid: true, parent: { id: parentSnap.id, ...parentData } };
}

export function wouldCreateFolderCycle(items, itemId, nextParentId) {
  if (!nextParentId) return false;

  const byId = new Map(items.map((item) => [item.id, item]));
  let currentId = nextParentId;

  while (currentId) {
    if (currentId === itemId) return true;
    currentId = byId.get(currentId)?.parentId || null;
  }

  return false;
}

export async function uploadResourceTemplateFile(file, title, folderId) {
  if (!folderId) {
    return {
      error: "Resource template WorkDrive folder is not configured",
      status: 500,
    };
  }

  if (!file || typeof file === "string" || typeof file.arrayBuffer !== "function") {
    return { error: "A file is required", status: 400 };
  }

  if (file.size > MAX_RESOURCE_TEMPLATE_FILE_SIZE) {
    return { error: "File uploads are limited to 50 MB", status: 400 };
  }

  const originalFileName = sanitizeFileName(file.name);
  const buffer = Buffer.from(await file.arrayBuffer());
  const upload = await zohoClient.uploadWorkDriveFile(
    folderId,
    buffer,
    originalFileName,
    file.type || "application/octet-stream"
  );

  let publicLink;
  try {
    publicLink = await zohoClient.createWorkDrivePublicLink(
      upload.resourceId,
      sanitizeLinkName(title || originalFileName)
    );
  } catch (error) {
    await zohoClient.deleteWorkDriveResource(upload.resourceId).catch((deleteError) => {
      console.error(
        "Failed to clean up WorkDrive file after public link creation failed:",
        deleteError.message
      );
    });

    throw error;
  }
  const externalUrl =
    publicLink.link ||
    publicLink.downloadUrl ||
    upload.downloadUrl ||
    upload.permalink;

  if (!externalUrl) {
    return {
      error: "WorkDrive did not return a usable public resource link",
      status: 502,
    };
  }

  return {
    data: {
      externalUrl,
      workdriveId: upload.resourceId,
      mimeType: file.type || "application/octet-stream",
      size: file.size,
      fileName: originalFileName,
      workDriveFolderId: folderId,
      workDriveResourceId: upload.resourceId,
      workDrivePublicLinkId: publicLink.linkId,
      workDrivePermalink: upload.permalink,
      downloadUrl: publicLink.downloadUrl || upload.downloadUrl || externalUrl,
    },
  };
}

export async function deleteResourceTemplateWorkDriveResource(item) {
  const resourceId = cleanText(item?.workDriveResourceId || item?.workdriveId);
  if (!resourceId) {
    return { skipped: true };
  }

  return zohoClient.deleteWorkDriveResource(resourceId);
}

export { normalizeResourceUrl };
