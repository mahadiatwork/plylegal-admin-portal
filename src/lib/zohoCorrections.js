export const DOCUMENT_REVIEW_SOURCE = "documentReview";
export const ZOHO_CORRECTION_MODULE = "Corrections";
export const ZOHO_CORRECTION_RELATED_LIST = "Corrections";
export const ZOHO_CORRECTION_PREFIX = "zohoCorrection:";
export const ZOHO_CORRECTION_SUBFORM = "Correction_Details";
export const ZOHO_CORRECTION_NOTIFY_STATUS = "Correction Made - Notify Client";
export const ZOHO_CORRECTION_OPEN_STATUS = "Correction Requested";
export const ZOHO_CORRECTION_FIELDS = [
  "id",
  "Name",
  "Connected_To__s",
  "Field_Name",
  "Issue_description",
  "Status",
  "Created_Time",
  "Modified_Time",
  "Email",
  "Secondary_Email",
  "Matter",
  ZOHO_CORRECTION_SUBFORM,
].join(",");

export function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function displayValue(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function getLookupId(value) {
  if (!value) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "object") return cleanText(value.id);
  return "";
}

function compareCorrectionItems(a, b) {
  const aNumber = Number(a.correctionNo);
  const bNumber = Number(b.correctionNo);

  if (Number.isFinite(aNumber) && Number.isFinite(bNumber) && aNumber !== bNumber) {
    return aNumber - bNumber;
  }

  return a.id.localeCompare(b.id);
}

export function normalizeZohoCorrectionStatus(status) {
  const value = cleanText(status).toLowerCase();

  if (
    value === "resolved" ||
    value === "closed" ||
    value === "done" ||
    value === ZOHO_CORRECTION_NOTIFY_STATUS.toLowerCase()
  ) {
    return "resolved";
  }

  return "open";
}

export function normalizeZohoCorrectionItemStatus(status) {
  const value = displayValue(status).toLowerCase().replace(/\s+/g, " ");

  if (value === "done" || value === "resolved" || value === "corrected") {
    return "Done";
  }

  if (value === "to do" || value === "todo" || value === "open" || value === "pending") {
    return "To Do";
  }

  return "";
}

export function serializeZohoCorrectionItem(row, index = 0) {
  const id = cleanText(row?.id);
  const status = normalizeZohoCorrectionItemStatus(row?.Status) || "To Do";

  return {
    id: id || `correction-item-${index + 1}`,
    zohoSubformId: id,
    correctionNo: displayValue(row?.Correction_No),
    pageNo: displayValue(row?.Page_No),
    questionNo: displayValue(row?.Question_No),
    details: displayValue(row?.Details_of_Correction),
    status: status === "Done" ? "done" : "todo",
    zohoStatus: status,
  };
}

export function getZohoCorrectionItems(record) {
  const rows = Array.isArray(record?.[ZOHO_CORRECTION_SUBFORM])
    ? record[ZOHO_CORRECTION_SUBFORM]
    : [];

  return rows
    .map(serializeZohoCorrectionItem)
    .filter(
      (item) =>
        item.zohoSubformId ||
        item.correctionNo ||
        item.pageNo ||
        item.questionNo ||
        item.details
    )
    .sort(compareCorrectionItems);
}

export function areAllZohoCorrectionItemsDone(record) {
  const items = getZohoCorrectionItems(record);
  return items.length > 0 && items.every((item) => item.status === "done");
}

export function serializeZohoCorrection(record) {
  const id = cleanText(record?.id);
  const fieldName = cleanText(record?.Field_Name);
  const name = cleanText(record?.Name);
  const body = cleanText(record?.Issue_description);
  const correctionItems = getZohoCorrectionItems(record);
  const openItemCount = correctionItems.filter((item) => item.status !== "done").length;
  const zohoStatus = cleanText(record?.Status);

  return {
    id: `${ZOHO_CORRECTION_PREFIX}${id}`,
    zohoCorrectionId: id,
    source: DOCUMENT_REVIEW_SOURCE,
    origin: "zohoCorrections",
    path: fieldName || name || `${ZOHO_CORRECTION_RELATED_LIST}.${id}`,
    label: fieldName || name || "Correction",
    body: body || name || "Correction submitted in Zoho CRM.",
    severity: "issue",
    status: normalizeZohoCorrectionStatus(record?.Status),
    zohoStatus,
    sectionKey: fieldName || "documentReview",
    authorName: cleanText(record?.Email) || cleanText(record?.Secondary_Email) || "",
    createdAt: record?.Created_Time || null,
    updatedAt: record?.Modified_Time || null,
    correctionItems,
    openItemCount,
    doneItemCount: correctionItems.length - openItemCount,
    totalItemCount: correctionItems.length,
    canNotifyClient:
      correctionItems.length > 0 &&
      openItemCount === 0 &&
      zohoStatus !== ZOHO_CORRECTION_NOTIFY_STATUS,
  };
}

export async function fetchZohoCorrectionRecord(zohoClient, correctionId) {
  const id = cleanText(correctionId);
  if (!id) return null;

  return zohoClient.getRecord(ZOHO_CORRECTION_MODULE, id, ZOHO_CORRECTION_FIELDS);
}

export async function hydrateZohoCorrectionRecord(zohoClient, record) {
  const id = cleanText(record?.id);
  if (!id) return record;

  const hydratedRecord = await fetchZohoCorrectionRecord(zohoClient, id);
  return hydratedRecord ? { ...record, ...hydratedRecord } : record;
}

export function zohoCorrectionBelongsToMatter(record, dealId) {
  const expectedDealId = cleanText(dealId);
  if (!expectedDealId) return true;

  const correctionDealId = getLookupId(record?.Matter) || getLookupId(record?.Connected_To__s);
  return !correctionDealId || correctionDealId === expectedDealId;
}

export function buildZohoCorrectionItemStatusUpdate(record, itemId, status) {
  const rowId = cleanText(itemId);
  const nextStatus = normalizeZohoCorrectionItemStatus(status);

  if (!rowId) {
    throw new Error("Correction item ID is required");
  }

  if (!nextStatus) {
    throw new Error("Correction item status is invalid");
  }

  const rows = Array.isArray(record?.[ZOHO_CORRECTION_SUBFORM])
    ? record[ZOHO_CORRECTION_SUBFORM]
    : [];
  const targetRow = rows.find((row) => cleanText(row?.id) === rowId);

  if (!targetRow) {
    throw new Error("Correction item was not found");
  }

  return rows
    .map((row) => {
      const id = cleanText(row?.id);
      if (!id) return null;

      return id === rowId ? { id, Status: nextStatus } : { id };
    })
    .filter(Boolean);
}
