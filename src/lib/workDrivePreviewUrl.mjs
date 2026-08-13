export function getWorkDrivePreviewUrl(rawUrl) {
  if (typeof rawUrl !== "string") return "";

  try {
    const parsed = new URL(rawUrl.trim());
    const host = parsed.hostname.toLowerCase();
    if (!/^workdrive\.(?:zohopublic|zohoexternal)\./.test(host)) return "";

    parsed.pathname = parsed.pathname.replace(/\/download\/?$/, "");
    parsed.searchParams.delete("directDownload");

    return parsed.toString();
  } catch {
    return "";
  }
}
