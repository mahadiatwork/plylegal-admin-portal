// Keep the picker open to all file formats. Browsers often omit MIME types for
// Office files, so preserve known document types before uploading to WorkDrive.
export const MAX_RESOURCE_FILE_SIZE = 50 * 1024 * 1024;

const DOCUMENT_MIME_TYPES = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  odt: "application/vnd.oasis.opendocument.text",
  rtf: "application/rtf",
  txt: "text/plain",
  csv: "text/csv",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ods: "application/vnd.oasis.opendocument.spreadsheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  odp: "application/vnd.oasis.opendocument.presentation",
};

export function getResourceMimeType(file) {
  const extension = String(file.name || "").split(".").pop().toLowerCase();
  return DOCUMENT_MIME_TYPES[extension] || file.type || "application/octet-stream";
}

export function validateResourceFile(file) {
  if (!file || typeof file === "string" || typeof file.arrayBuffer !== "function") {
    return "A file is required";
  }
  if (!Number.isFinite(file.size) || file.size <= 0) {
    return "Empty files cannot be uploaded";
  }
  if (file.size > MAX_RESOURCE_FILE_SIZE) {
    return "File uploads are limited to 50 MB";
  }
  return null;
}

export function getWorkDriveViewerUrl(value) {
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" || url.username || url.password || url.port ||
      !/^workdrive\.(?:zoho|zohopublic|zohoexternal)\.(?:com|com\.au|eu|in|jp|ca|com\.cn|sa)$/.test(url.hostname) ||
      !/^\/external\/[A-Za-z0-9_-]+\/?$/.test(url.pathname) || url.search || url.hash
    ) return null;
    return url.toString();
  } catch {
    return null;
  }
}
