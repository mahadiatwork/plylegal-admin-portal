import { getWorkDriveViewerUrl } from "../src/lib/resourceFiles.mjs";

const WORKDRIVE_DOMAIN = "(?:com|com\\.au|eu|in|jp|ca|sa|com\\.cn)";
const SHARE_HOST = new RegExp(
  `^workdrive\\.(?:zoho|zohopublic|zohoexternal)\\.${WORKDRIVE_DOMAIN}$`
);
const RAW_HOST = new RegExp(
  `^(?:workdrive\\.zoho\\.${WORKDRIVE_DOMAIN}|files\\.(?:zohopublic|zohoexternal)\\.${WORKDRIVE_DOMAIN}|(?:www\\.)?zohoapis\\.${WORKDRIVE_DOMAIN})$`
);
const LINK_ID = /^[a-zA-Z0-9_-]+$/;
const URL_FIELD = /(?:url|uri|permalink|href)$|^(?:link|publiclink|sharelink|externallink|downloadlink|webcontentlink|webviewlink)$/i;
const RAW_FIELD = /^(?:raw|rawresponse|workdriveraw|workdriveresponse|download|downloads)$/i;

function normalizedKey(key) {
  return key.replace(/[^a-zA-Z0-9]/g, "");
}

function isPlainObject(value) {
  return value && Object.getPrototypeOf(value) === Object.prototype;
}

export function parseShareUrl(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      !SHARE_HOST.test(url.hostname)
    ) return null;
    const match = url.pathname.match(/^\/external\/([a-zA-Z0-9_-]+)(?:\/download)?\/?$/);
    if (!match) return null;
    return { linkId: match[1], viewerUrl: `${url.origin}/external/${match[1]}` };
  } catch {
    return null;
  }
}

// Pure planning: importing this module never loads credentials or contacts a service.
export function planResourceViewOnly(data, kind) {
  const linkIds = new Set();
  const problems = new Set();
  const removedFields = new Set();
  const clean = {};
  let storedLinkId = null;

  function inspectUrl(value) {
    if (value === null || value === undefined || value === "") return;
    if (typeof value !== "string") {
      problems.add("non_string_url_alias");
      return;
    }
    const share = parseShareUrl(value);
    if (share) {
      linkIds.add(share.linkId);
      return;
    }
    try {
      const url = new URL(value.trim());
      if (
        url.protocol !== "https:" || url.username || url.password || url.port ||
        !RAW_HOST.test(url.hostname) || url.pathname.startsWith("/external/")
      ) problems.add("unidentified_url_alias");
    } catch {
      problems.add("unidentified_url_alias");
    }
  }

  function visit(value, path = []) {
    if (Array.isArray(value)) {
      return value.map((item, index) => visit(item, [...path, String(index)]))
        .filter((item) => item !== undefined);
    }
    if (!isPlainObject(value)) {
      if (typeof value === "string" && /^https?:\/\//i.test(value.trim())) {
        inspectUrl(value);
        removedFields.add(path.join("."));
        return undefined;
      }
      return value;
    }
    const result = {};
    for (const [key, child] of Object.entries(value)) {
      const field = normalizedKey(key);
      const childPath = [...path, key];
      if (field.toLowerCase() === "workdrivepubliclinkid" || field.toLowerCase() === "publiclinkid") {
        if (typeof child === "string" && LINK_ID.test(child.trim())) {
          linkIds.add(child.trim());
          if (key === "workDrivePublicLinkId" && path.length === 0) storedLinkId = child.trim();
        } else if (child !== null && child !== undefined && child !== "") {
          problems.add("invalid_stored_link_id");
        }
      }
      if (URL_FIELD.test(field)) {
        if (isPlainObject(child) || Array.isArray(child)) visit(child, childPath);
        else inspectUrl(child);
        removedFields.add(childPath.join("."));
        continue;
      }
      const next = visit(child, childPath);
      if (RAW_FIELD.test(field)) {
        removedFields.add(childPath.join("."));
      } else if (next !== undefined) {
        result[key] = next;
      }
    }
    return result;
  }

  Object.assign(clean, visit(data));
  if (!linkIds.size) problems.add("missing_existing_public_link");
  return {
    kind,
    linkIds: [...linkIds],
    primaryLinkId: storedLinkId || [...linkIds][0] || null,
    problems: [...problems],
    removedFields: [...removedFields],
    clean,
  };
}

export function protectedResourceData(plan, verifiedLinks) {
  if (plan.problems.length) throw new Error("Resource plan is blocked");
  const verified = new Map();
  for (const linkId of plan.linkIds) {
    const link = verifiedLinks.get(linkId);
    const viewer = parseShareUrl(link?.link);
    if (
      link?.allowDownload !== false ||
      !viewer ||
      !getWorkDriveViewerUrl(link?.link) ||
      (link.linkId && link.linkId !== linkId)
    ) throw new Error("WorkDrive did not verify a restricted viewer link");
    verified.set(linkId, viewer.viewerUrl);
  }
  const viewerUrl = verified.get(plan.primaryLinkId);
  return {
    ...plan.clean,
    ...(plan.kind === "template"
      ? { externalUrl: viewerUrl }
      : { publicUrl: viewerUrl, url: viewerUrl }),
    workDrivePublicLinkId: plan.primaryLinkId,
    downloadAllowed: false,
  };
}
