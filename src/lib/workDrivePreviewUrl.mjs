const ZOHO_PUBLIC_DOMAIN = "(?:com|com\\.au|eu|in|jp|ca|sa|com\\.cn)";
const WORKDRIVE_HOST = new RegExp(
  `^workdrive\\.(?:zohopublic|zohoexternal)\\.${ZOHO_PUBLIC_DOMAIN}$`
);
const WORKDRIVE_FILE_HOST = new RegExp(
  `^files\\.(?:zohopublic|zohoexternal)\\.${ZOHO_PUBLIC_DOMAIN}$`
);

export function getWorkDrivePreviewUrl(rawUrl) {
  if (typeof rawUrl !== "string") return "";

  try {
    const parsed = new URL(rawUrl.trim());
    const host = parsed.hostname.toLowerCase();
    if (parsed.protocol !== "https:" || !WORKDRIVE_HOST.test(host)) return "";

    parsed.pathname = parsed.pathname.replace(/\/download\/?$/, "");
    parsed.searchParams.delete("directDownload");

    return parsed.toString();
  } catch {
    return "";
  }
}

export function getWorkDriveDirectDownloadUrl(rawUrl) {
  const previewUrl = getWorkDrivePreviewUrl(rawUrl);
  if (!previewUrl) return "";

  const parsed = new URL(previewUrl);
  if (!parsed.pathname.startsWith("/external/")) return "";
  parsed.pathname = `${parsed.pathname.replace(/\/$/, "")}/download`;
  parsed.searchParams.set("directDownload", "true");
  return parsed.toString();
}

export function isWorkDrivePublicFileUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname.toLowerCase();
    return (
      parsed.protocol === "https:" &&
      WORKDRIVE_FILE_HOST.test(host) &&
      parsed.pathname.includes("/public/workdrive-")
    );
  } catch {
    return false;
  }
}
