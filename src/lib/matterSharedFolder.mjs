const WORKDRIVE_HOST = /^workdrive\.(?:zoho|zohopublic|zohoexternal)\.(?:com|com\.au|eu|in|jp|ca|sa|com\.cn)$/i;

export function getMatterSharedFolderUrl(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" || url.username || url.password || url.port ||
        !WORKDRIVE_HOST.test(url.hostname) || url.pathname === "/") return null;
    return url.toString();
  } catch {
    return null;
  }
}
