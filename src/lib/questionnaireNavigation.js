/**
 * Questionnaire sidebar navigation, as the Client Portal renders it.
 *
 * The client sidebar (`plylegal-client-portal/app/intake/layout.js`) does not use page titles:
 * its labels, order and grouping come from the route tables in
 * `plylegal-client-portal/src/lib/routes.js`, and its circled step numbers are one running
 * count over the items it actually shows:
 *
 *   Getting Started, Included Applicants,
 *   per applicant: Main Applicant (Other Family after Contact Details / Family), Spouse/Partner,
 *   Child, then Other Family members (their pages are not numbered),
 *   then the remaining route groups (All Applicants, …) and Review and Submit.
 *
 * The tables below mirror those client tables (a test compares them with the client file when
 * the workspace has it). Page headings (`page.title`) are deliberately not used for labels; a
 * page whose route is not in the client navigation keeps its title as the label and is listed
 * after the client's pages in its group. `page.metadata.navigationTitle`, when an administrator
 * or a future catalog sets one, overrides the label. Existing saved definitions need no changes.
 *
 * Definitions that opt in with `navigation.mode === "definition"` (see questionnaireNavigationModel.js)
 * are different: the client renders exactly what the definition says, so the sidebar here is built
 * from the definition too — included groups in `navigation.groups` order, sections in `page.order`.
 */
import {
  getGroupPages,
  getIncludedGroupKeys,
  isDefinitionNavigation,
} from "./questionnaireNavigationModel.js";

const MAIN_APPLICANT_SUBPAGES = {
  "temporary-work": [
    ["details", "Details"],
    ["other", "Other Names"],
    ["identity", "Identity"],
    ["contact-details", "Contact Details"],
    ["employment", "Employment"],
    ["education", "Education"],
    ["skills", "Skills"],
    ["language", "Language"],
  ],
  partner: [
    ["details", "Details"],
    ["other", "Other Names"],
    ["identity", "Identity"],
    ["employment", "Employment"],
    ["education", "Education"],
    ["language", "Language"],
    ["family", "Family"],
  ],
  protection: [
    ["details", "Details"],
    ["other", "Other Names"],
    ["identity", "Identity"],
    ["employment", "Employment"],
    ["education", "Education"],
    ["family", "Family"],
  ],
};

/** The client shows the main applicant's Other Family step right after this sub-page. */
const OTHER_FAMILY_AFTER = { "temporary-work": "contact-details", partner: "family", protection: "family" };

const SPOUSE_SUBPAGES = {
  "temporary-work:482": [["details", "Details"], ["other-details", "Other Names"], ["identity", "Identity"]],
  "temporary-work:186": [
    ["details", "Details"],
    ["other-details", "Other Names"],
    ["identity", "Identity"],
    ["education", "Education"],
    ["language", "Language"],
  ],
  partner: [["details", "Details"], ["other-details", "Other Names"], ["identity", "Identity"]],
  protection: [["details", "Details"], ["other-details", "Other Names"], ["identity", "Identity"]],
};

const CHILD_SUBPAGES = [["details", "Details"], ["other", "Other Names"], ["identity", "Identity"], ["custody", "Custody"]];

const NON_MIGRATING_MEMBER_SUBPAGES = [
  ["details", "Details"],
  ["passport", "Passport"],
  ["identity", "Identity Documents"],
  ["other-names", "Other Names"],
  ["citizenship", "Citizenship"],
  ["health", "Health"],
];

/** Client routes after the applicant sections, in sidebar order: a group, or a single step. */
const LATER_ROUTES = {
  "temporary-work": [
    { key: "all-applicants", label: "All Applicants", pages: [
      ["all-applicants/visas", "Visas"],
      ["all-applicants/travel-history", "Travel History"],
      ["all-applicants/countries-of-residence", "Countries of Residence"],
      ["all-applicants/health", "Health"],
      ["all-applicants/character", "Character"],
    ] },
  ],
  partner: [
    { key: "family-sponsor", label: "Family Sponsor", pages: [
      ["family-sponsor/details", "Details"],
      ["family-sponsor/other", "Other"],
      ["family-sponsor/identity", "Identity"],
      ["family-sponsor/family", "Family"],
      ["family-sponsor/circumstances", "Circumstances"],
      ["family-sponsor/addresses", "Addresses"],
      ["family-sponsor/contact", "Contact Details"],
      ["family-sponsor/previous-sponsorship", "Previous Sponsorships"],
      ["family-sponsor/travel", "Travel"],
      ["family-sponsor/character", "Character"],
    ] },
    { key: "relationships", label: "Relationships", pages: [
      ["relationships/current-relationship", "Current Relationship"],
      ["relationships/relationship-details", "Relationship Details"],
      ["relationships/previous-relationships", "Previous Relationships"],
      ["relationships/supporting-witnesses", "Supporting Witnesses"],
    ] },
    { key: "all-applicants", label: "All Applicants", pages: [
      ["all-applicants/addresses", "Addresses"],
      ["all-applicants/contact-details", "Contact Details"],
      ["all-applicants/visas", "Visas"],
      ["all-applicants/travel-history", "Travel History"],
      ["all-applicants/future-travel", "Future Travel"],
      ["all-applicants/future-addresses", "Future Addresses"],
      ["all-applicants/health", "Health"],
      ["all-applicants/character", "Character"],
      ["all-applicants/contacts", "Contacts"],
    ] },
  ],
  protection: [
    { single: ["employment", "Employment"] },
    { key: "all-applicants", label: "All Applicants", pages: [
      ["all-applicants/addresses", "Addresses"],
      ["all-applicants/languages", "Languages"],
      ["all-applicants/contact-details", "Contact Details"],
      ["all-applicants/visas", "Visas"],
      ["all-applicants/travel-history", "Travel History"],
      ["all-applicants/future-travel", "Future Travel"],
      ["all-applicants/future-addresses", "Future Addresses"],
      ["all-applicants/character", "Character"],
      ["all-applicants/contacts", "Contacts"],
    ] },
  ],
};

/** Client group headings for each applicant (the role line of the profile header). */
export const NAVIGATION_GROUP_LABELS = Object.freeze({
  "main-applicant": "Main Applicant",
  "spouse-partner": "Spouse/Partner",
  children: "Child",
  "non-migrating": "Other Family",
  "family-sponsor": "Family Sponsor",
  relationships: "Relationships",
  "all-applicants": "All Applicants",
  shared: "Other sections",
});

const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function routeOf(page) {
  return String(page?.route || "").split("?")[0].replace(/\/+$/, "");
}

function contextOf(definition) {
  const contexts = (Array.isArray(definition?.visaContexts) ? definition.visaContexts : []).map(String);
  if (contexts.includes("482")) return "482";
  if (contexts.includes("186")) return "186";
  return "482";
}

function visaTypeOf(definition) {
  if (definition?.visaType) return String(definition.visaType);
  const match = routeOf(definition?.pages?.find((page) => routeOf(page).startsWith("/intake/"))).match(/^\/intake\/([^/]+)\//);
  return match?.[1] || "";
}

/**
 * The client sidebar for a visa as an ordered list of slots:
 * `{ group, groupLabel, label, test(route), numbered }` (group "" = a top-level step).
 */
export function getClientNavigationSlots(visaType, visaContext = "482") {
  if (!MAIN_APPLICANT_SUBPAGES[visaType]) return [];
  const base = `/intake/${visaType}`;
  const exact = (path) => {
    const href = `${base}/${path}`;
    return (route) => route === href;
  };
  const placeholder = (section, suffix) => {
    const pattern = new RegExp(`^${escapeRegExp(`${base}/${section}/`)}[^/]+/${escapeRegExp(suffix)}$`);
    return (route) => pattern.test(route);
  };
  const slot = (group, label, test, numbered = true) => ({
    group,
    groupLabel: group ? NAVIGATION_GROUP_LABELS[group] : "",
    label,
    test,
    numbered,
  });

  const slots = [
    slot("", "Getting Started", exact("start")),
    slot("", "Included Applicants", exact("profile")),
  ];
  MAIN_APPLICANT_SUBPAGES[visaType].forEach(([suffix, label]) => {
    slots.push(slot("main-applicant", label, exact(`main-applicant/${suffix}`)));
    if (suffix === OTHER_FAMILY_AFTER[visaType]) {
      slots.push(slot("main-applicant", "Other Family", exact("non-migrating")));
    }
  });
  const spouse = SPOUSE_SUBPAGES[visaType === "temporary-work" ? `${visaType}:${visaContext === "186" ? "186" : "482"}` : visaType];
  spouse.forEach(([suffix, label]) => slots.push(slot("spouse-partner", label, exact(`spouse-partner/${suffix}`))));
  CHILD_SUBPAGES.forEach(([suffix, label]) => slots.push(slot("children", label, placeholder("children", suffix))));
  // Other Family members' pages are listed under each member without step numbers.
  NON_MIGRATING_MEMBER_SUBPAGES.forEach(([suffix, label]) =>
    slots.push(slot("non-migrating", label, placeholder("non-migrating", suffix), false)));
  LATER_ROUTES[visaType].forEach((entry) => {
    if (entry.single) slots.push(slot("", entry.single[1], exact(entry.single[0])));
    else entry.pages.forEach(([path, label]) => slots.push({ ...slot(entry.key, label, exact(path)), groupLabel: entry.label }));
  });
  slots.push(slot("", "Review and Submit", exact("submit")));
  return slots;
}

/** Sidebar group for a page the client navigation does not list (by route, then role). */
function fallbackGroup(page) {
  const role = page?.metadata?.profileRole === "main" ? "main_applicant" : page?.metadata?.profileRole;
  const route = routeOf(page);
  if (role === "main_applicant" || route.includes("/main-applicant/")) return "main-applicant";
  if (role === "spouse" || route.includes("/spouse-partner/")) return "spouse-partner";
  if (role === "child" || /\/children\/[^/]+\//.test(route)) return "children";
  if (/\/non-migrating\/[^/]+\//.test(route)) return "non-migrating";
  if (route.includes("/family-sponsor/")) return "family-sponsor";
  if (route.includes("/relationships/")) return "relationships";
  if (route.includes("/all-applicants/")) return "all-applicants";
  return "shared";
}

/**
 * The builder sidebar for a definition, in Client Portal order.
 *
 * @param {object} definition
 * @param {{ isVisible?: (page) => boolean }} [options] pages the sidebar should list
 * @returns {{
 *   entries: Array<{ kind: "page", item } | { kind: "group", key, label, items }>,
 *   items: Array<{ page, label, stepNumber, group }>,   // every listed page, in order
 *   stepNumberById: Map<string, number>,                 // numbered pages only
 *   labelById: Map<string, string>,
 *   sectionCount: number,                                // numbered pages
 * }}
 */
export function buildQuestionnaireSidebar(definition, { isVisible = () => true } = {}) {
  if (isDefinitionNavigation(definition)) return buildDefinitionSidebar(definition, { isVisible });
  const pages = (definition?.pages || []).filter((page) => page && isVisible(page));
  const slots = getClientNavigationSlots(visaTypeOf(definition), contextOf(definition));
  const bySlot = new Map();
  const unmatched = [];
  pages.forEach((page) => {
    const route = routeOf(page);
    const index = slots.findIndex((candidate) => candidate.test(route));
    if (index < 0) unmatched.push(page);
    else bySlot.set(index, [...(bySlot.get(index) || []), page]);
  });

  // Slots in client order; pages the client does not list go last in their group (or at the end).
  const ordered = [];
  slots.forEach((slot, index) => (bySlot.get(index) || []).forEach((page) => ordered.push({ page, slot })));
  unmatched.forEach((page) => {
    const group = fallbackGroup(page);
    let insertAt = -1;
    ordered.forEach((entry, index) => { if (entry.slot.group === group) insertAt = index; });
    const entry = {
      page,
      slot: { group, groupLabel: NAVIGATION_GROUP_LABELS[group], label: page.title, numbered: group !== "non-migrating" },
    };
    if (insertAt < 0) ordered.push(entry);
    else ordered.splice(insertAt + 1, 0, entry);
  });

  const entries = [];
  const items = [];
  const stepNumberById = new Map();
  const labelById = new Map();
  let step = 0;
  ordered.forEach(({ page, slot }) => {
    const label = String(page.metadata?.navigationTitle || "").trim() || slot.label || page.title || "Untitled section";
    const stepNumber = slot.numbered ? ++step : null;
    const item = { page, label, stepNumber, group: slot.group };
    items.push(item);
    labelById.set(page.id, label);
    if (stepNumber) stepNumberById.set(page.id, stepNumber);
    const previous = entries.at(-1);
    if (!slot.group) entries.push({ kind: "page", item });
    else if (previous?.kind === "group" && previous.key === slot.group) previous.items.push(item);
    else entries.push({ kind: "group", key: slot.group, label: slot.groupLabel || NAVIGATION_GROUP_LABELS[slot.group], items: [item] });
  });

  return { entries, items, stepNumberById, labelById, sectionCount: step };
}

/**
 * Sidebar of a definition-driven questionnaire: exactly the groups the definition includes (even
 * empty ones, so sections can be added to them) with their sections in saved order. Pages of
 * excluded groups are returned in `excludedGroups` and never listed.
 */
function buildDefinitionSidebar(definition, { isVisible = () => true } = {}) {
  const includedKeys = getIncludedGroupKeys(definition);
  const entries = [];
  const items = [];
  const stepNumberById = new Map();
  const labelById = new Map();
  let step = 0;

  includedKeys.forEach((groupKey) => {
    const groupItems = getGroupPages(definition, groupKey)
      .filter((page) => isVisible(page))
      .map((page) => {
        const label = String(page.metadata?.navigationTitle || "").trim() || page.title || "Untitled section";
        const stepNumber = groupKey === "non-migrating" ? null : ++step;
        const item = { page, label, stepNumber, group: groupKey };
        items.push(item);
        labelById.set(page.id, label);
        if (stepNumber) stepNumberById.set(page.id, stepNumber);
        return item;
      });
    entries.push({ kind: "group", key: groupKey, label: NAVIGATION_GROUP_LABELS[groupKey] || groupKey, items: groupItems });
  });

  const excludedGroups = Object.keys(NAVIGATION_GROUP_LABELS)
    .filter((key) => !includedKeys.includes(key))
    .map((key) => ({
      key,
      label: NAVIGATION_GROUP_LABELS[key],
      pages: getGroupPages(definition, key).filter((page) => isVisible(page)),
    }))
    .filter((group) => group.key !== "shared" || group.pages.length > 0);

  return { entries, items, stepNumberById, labelById, sectionCount: step, excludedGroups, definitionDriven: true };
}
