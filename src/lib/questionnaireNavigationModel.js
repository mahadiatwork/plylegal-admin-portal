/**
 * Flexible questionnaire structure: which groups exist, section order, and brand-new sections.
 *
 * A definition may opt in to owning its navigation:
 *
 *   definition.navigation = { mode: "definition", groups: ["main-applicant", "all-applicants"] }
 *
 * `groups` lists the included groups in sidebar order. Pages in an excluded group stay in the
 * definition (so re-including the group restores them and no saved answer is ever deleted) but
 * clients do not see them, progress ignores them and they cannot block submission.
 * Within a group, sections follow `page.order`; within a page / repeater, questions follow array
 * order. Definitions without `navigation` keep the original code-owned navigation untouched.
 *
 * The client portal mirrors the read side of this in `src/lib/questionnaires/navigation.js`;
 * `questionnaireNavigationModel.test.mjs` compares the two when the workspace has both repos.
 */

export const NAVIGATION_MODE_DEFINITION = "definition";

/** Every group a definition can include, in the default sidebar order. */
export const NAVIGATION_GROUP_KEYS = Object.freeze([
  "main-applicant",
  "spouse-partner",
  "children",
  "non-migrating",
  "family-sponsor",
  "relationships",
  "all-applicants",
  "shared",
]);

/** Groups an administrator can switch on or off (the catch-all "shared" group is advanced-only). */
export const SELECTABLE_GROUP_KEYS = Object.freeze(NAVIGATION_GROUP_KEYS.filter((key) => key !== "shared"));

/**
 * How each group maps to routes and storage.
 *   routeBase  — path under /intake/<visa>/ that new sections are created in
 *   scope      — "profile" groups store answers per applicant
 *   profileRole— page.metadata.profileRole for profile groups
 *   people     — what the group expands to for each person
 */
export const NAVIGATION_GROUPS = Object.freeze({
  "main-applicant": { label: "Main Applicant", routeBase: "main-applicant", scope: "profile", profileRole: "main_applicant", people: "the main applicant" },
  "spouse-partner": { label: "Spouse / Partner", routeBase: "spouse-partner", scope: "profile", profileRole: "spouse", people: "the spouse or partner" },
  children: { label: "Children", routeBase: "children/child-profile", scope: "profile", profileRole: "child", people: "each child" },
  "non-migrating": { label: "Other Family", routeBase: "non-migrating/member-profile", scope: "profile", profileRole: "non_migrating", people: "each non-migrating family member" },
  "family-sponsor": { label: "Family Sponsor", routeBase: "family-sponsor", scope: "shared", people: "the whole application" },
  relationships: { label: "Relationships", routeBase: "relationships", scope: "shared", people: "the whole application" },
  "all-applicants": { label: "All Applicants", routeBase: "all-applicants", scope: "shared", people: "the whole application" },
  shared: { label: "Other sections", routeBase: "", scope: "shared", people: "the whole application" },
});

export const PERSON_GROUP_KEYS = Object.freeze(["main-applicant", "spouse-partner", "children", "non-migrating"]);

/** Last path segments a new section may never take: client screens, or hand-written routes. */
const RESERVED_SLUGS = new Set([
  "start", "profile", "submit", "non-migrating", "children", "dependents", "relationships", "family",
  "member-profile", "child-profile", "new", "index",
]);

const MAX_SLUG_LENGTH = 60;

export function isDefinitionNavigation(definition) {
  return definition?.navigation?.mode === NAVIGATION_MODE_DEFINITION;
}

function slugify(value, fallback = "section") {
  const slug = String(value || "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/g, "");
  return slug || fallback;
}

/** Included group keys, in order, with unknown or duplicate entries dropped. */
export function getIncludedGroupKeys(definition) {
  if (!isDefinitionNavigation(definition)) return [...NAVIGATION_GROUP_KEYS];
  const seen = new Set();
  return (Array.isArray(definition.navigation.groups) ? definition.navigation.groups : [])
    .filter((key) => NAVIGATION_GROUP_KEYS.includes(key) && !seen.has(key) && seen.add(key));
}

export function getPageGroupKey(page) {
  const metadataRole = page?.metadata?.profileRole;
  const role = metadataRole === "main" ? "main_applicant" : metadataRole;
  if (role === "main_applicant") return "main-applicant";
  if (role === "spouse") return "spouse-partner";
  if (role === "child") return "children";
  if (["non_migrating", "other"].includes(role)) return "non-migrating";

  const route = String(page?.route || "");
  if (route.includes("/main-applicant/")) return "main-applicant";
  if (route.includes("/spouse-partner/")) return "spouse-partner";
  if (/\/children\/[^/]+\/[^/]+$/.test(route)) return "children";
  if (/\/non-migrating\/[^/]+\/[^/]+$/.test(route)) return "non-migrating";
  if (route.includes("/family-sponsor/")) return "family-sponsor";
  if (route.includes("/relationships/")) return "relationships";
  if (route.includes("/all-applicants/")) return "all-applicants";
  return "shared";
}

/**
 * Turn a definition's navigation on, preserving what clients currently see: every group that has
 * pages stays included (in default order). Idempotent.
 */
export function enableDefinitionNavigation(definition) {
  if (isDefinitionNavigation(definition)) return definition;
  const present = new Set((definition?.pages || []).map(getPageGroupKey));
  // Code-owned screens (Other Family list, children list) belong to their groups too.
  const groups = NAVIGATION_GROUP_KEYS.filter((key) => present.has(key));
  return { ...definition, navigation: { mode: NAVIGATION_MODE_DEFINITION, groups: groups.length ? groups : ["main-applicant"] } };
}

/** Include or exclude a group. Pages are kept either way. Newly included groups go last. */
export function setGroupIncluded(definition, groupKey, included) {
  if (!NAVIGATION_GROUP_KEYS.includes(groupKey)) return definition;
  const enabled = enableDefinitionNavigation(definition);
  const current = getIncludedGroupKeys(enabled);
  const next = included
    ? (current.includes(groupKey) ? current : [...current, groupKey])
    : current.filter((key) => key !== groupKey);
  return { ...enabled, navigation: { ...enabled.navigation, groups: next } };
}

/** Move an included group earlier (-1) or later (+1) in the sidebar. */
export function moveGroup(definition, groupKey, direction) {
  const enabled = enableDefinitionNavigation(definition);
  const groups = getIncludedGroupKeys(enabled);
  const from = groups.indexOf(groupKey);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= groups.length) return enabled;
  return { ...enabled, navigation: { ...enabled.navigation, groups: moveInArray(groups, from, to) } };
}

/** Put `groupKey` where `targetKey` is (drag and drop). */
export function reorderGroup(definition, groupKey, targetKey) {
  const enabled = enableDefinitionNavigation(definition);
  const groups = getIncludedGroupKeys(enabled);
  const from = groups.indexOf(groupKey);
  const to = groups.indexOf(targetKey);
  if (from < 0 || to < 0 || from === to) return enabled;
  return { ...enabled, navigation: { ...enabled.navigation, groups: moveInArray(groups, from, to) } };
}

export function moveInArray(items, from, to) {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return items;
  const copy = [...items];
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item);
  return copy;
}

/** Pages of one group in sidebar order (`order`, then stored order). */
export function getGroupPages(definition, groupKey) {
  return (definition?.pages || [])
    .map((page, index) => ({ page, index }))
    .filter(({ page }) => page && getPageGroupKey(page) === groupKey)
    .sort((left, right) => (Number(left.page.order) || 0) - (Number(right.page.order) || 0) || left.index - right.index)
    .map(({ page }) => page);
}

/**
 * Reorder sections inside one group: `pageId` takes the place of `targetPageId`.
 * Only that group's pages are renumbered; their `order` values stay inside the range the group
 * already occupied relative to other groups, so unrelated pages never move.
 */
export function reorderGroupPages(definition, groupKey, pageId, targetPageId) {
  const pages = getGroupPages(definition, groupKey);
  const from = pages.findIndex((page) => page.id === pageId);
  const to = pages.findIndex((page) => page.id === targetPageId);
  if (from < 0 || to < 0 || from === to) return definition;
  return applyGroupPageOrder(definition, moveInArray(pages, from, to));
}

export function moveGroupPage(definition, groupKey, pageId, direction) {
  const pages = getGroupPages(definition, groupKey);
  const from = pages.findIndex((page) => page.id === pageId);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= pages.length) return definition;
  return applyGroupPageOrder(definition, moveInArray(pages, from, to));
}

function applyGroupPageOrder(definition, orderedGroupPages) {
  const ids = new Set(orderedGroupPages.map((page) => page.id));
  // Reuse the group's own order values (ascending) so the new order is stable and sortable.
  const slots = orderedGroupPages
    .map((page) => Number(page.order) || 0)
    .sort((left, right) => left - right);
  const distinct = new Set(slots).size === slots.length;
  const values = distinct ? slots : orderedGroupPages.map((_, index) => (index + 1) * 10);
  const nextOrder = new Map(orderedGroupPages.map((page, index) => [page.id, values[index]]));
  return {
    ...definition,
    pages: (definition.pages || []).map((page) => (ids.has(page.id) ? { ...page, order: nextOrder.get(page.id) } : page)),
  };
}

function stableUnique(base, taken) {
  if (!taken.has(base)) return base;
  let suffix = 2;
  while (taken.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

/** Every last route segment already used anywhere under the visa (definition pages + built-in routes). */
function takenSlugs(definition, builtInRoutes = []) {
  const taken = new Set(RESERVED_SLUGS);
  (definition?.pages || []).forEach((page) => {
    taken.add(String(page.route || "").split("/").pop());
  });
  builtInRoutes.forEach((route) => taken.add(String(route?.href || route || "").split("/").pop()));
  return taken;
}

/**
 * Create a brand-new section (page) in a group.
 *
 * IDs are generated once and never derived again from the title, so renaming a section later does
 * not change its route, section key or completion key (client answers depend on them).
 *
 * @param {object} definition
 * @param {{ title: string, groupKey: string, builtInRoutes?: Array<{href: string}> }} options
 *   `builtInRoutes` — routes of hand-written client screens, so a new section can never shadow one.
 */
export function createCustomSection(definition, { title, groupKey = "main-applicant", builtInRoutes = [] }) {
  const group = NAVIGATION_GROUPS[groupKey];
  if (!group || groupKey === "shared") throw new Error("Choose a section group.");
  const cleanTitle = String(title || "").trim();
  if (!cleanTitle) throw new Error("Section title is required.");

  const visaType = definition.visaType;
  const pages = definition.pages || [];
  const existingIds = new Set(pages.map((page) => page.id));
  const existingSectionKeys = new Set(pages.map((page) => page.sectionKey));
  const existingRoutes = new Set(pages.map((page) => page.route));

  const slug = stableUnique(slugify(cleanTitle), takenSlugs(definition, builtInRoutes));
  const base = `/intake/${visaType}/${group.routeBase}`;
  let route = `${base}/${slug}`;
  let routeSlug = slug;
  for (let suffix = 2; existingRoutes.has(route); suffix += 1) {
    routeSlug = `${slug}-${suffix}`;
    route = `${base}/${routeSlug}`;
  }

  const id = stableUnique(`custom-${groupKey}-${routeSlug}`.slice(0, 100), existingIds);
  const sectionKey = stableUnique(`custom_${routeSlug.replace(/-/g, "_")}`, existingSectionKeys);
  const groupPages = getGroupPages(definition, groupKey);
  const lastOrder = groupPages.length ? Math.max(...groupPages.map((page) => Number(page.order) || 0)) : null;
  const overallMax = pages.length ? Math.max(...pages.map((page) => Number(page.order) || 0)) : 0;

  const page = {
    id,
    title: cleanTitle,
    route,
    sectionKey,
    completionKey: route.replace(/^\/intake\//, ""),
    scope: group.scope,
    // After the group's last section; otherwise after everything (groups are ordered by navigation.groups).
    order: lastOrder === null ? overallMax + 10 : lastOrder + 1,
    introBlocks: [],
    questions: [],
    metadata: {
      renderer: "dynamic",
      customSection: true,
      ...(group.profileRole ? { profileRole: group.profileRole } : {}),
    },
  };

  let next = setGroupIncluded({ ...definition, pages: [...pages, page] }, groupKey, true);
  next = applyGroupPageOrder(next, [...groupPages, page]);
  return { definition: next, page };
}

/** Sections that clients will see: pages whose group is included, grouped in sidebar order. */
export function buildDefinitionSidebarModel(definition) {
  const included = getIncludedGroupKeys(definition);
  const groups = included.map((key) => ({
    key,
    label: NAVIGATION_GROUPS[key]?.label || key,
    pages: getGroupPages(definition, key),
  }));
  const excluded = NAVIGATION_GROUP_KEYS
    .filter((key) => !included.includes(key))
    .map((key) => ({ key, label: NAVIGATION_GROUPS[key]?.label || key, pages: getGroupPages(definition, key) }))
    .filter((group) => group.key !== "shared" || group.pages.length > 0);
  return { included: groups, excluded };
}

/** Validation issues for `definition.navigation` (used by the definition validator). */
export function getNavigationIssues(definition) {
  const issues = [];
  if (definition?.navigation === undefined) return issues;
  const navigation = definition.navigation;
  if (!navigation || typeof navigation !== "object" || Array.isArray(navigation)) {
    return ["definition.navigation must be an object"];
  }
  const unknown = Object.keys(navigation).filter((key) => !["mode", "groups"].includes(key));
  unknown.forEach((key) => issues.push(`definition.navigation.${key} is not supported`));
  if (navigation.mode !== NAVIGATION_MODE_DEFINITION) issues.push(`definition.navigation.mode must be "${NAVIGATION_MODE_DEFINITION}"`);
  if (!Array.isArray(navigation.groups)) {
    issues.push("definition.navigation.groups must be an array");
    return issues;
  }
  const seen = new Set();
  navigation.groups.forEach((group, index) => {
    if (!NAVIGATION_GROUP_KEYS.includes(group)) issues.push(`definition.navigation.groups[${index}] "${group}" is not a supported group`);
    else if (seen.has(group)) issues.push(`definition.navigation.groups[${index}] "${group}" is duplicated`);
    seen.add(group);
  });
  return issues;
}

export function canonicalNavigation(navigation) {
  if (!navigation) return undefined;
  const seen = new Set();
  return {
    mode: NAVIGATION_MODE_DEFINITION,
    groups: navigation.groups.filter((key) => !seen.has(key) && seen.add(key)),
  };
}
