import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { getBuiltInQuestionnaireDefinition } from "./questionnaireBuiltIns.js";
import { buildQuestionnaireSidebar, getClientNavigationSlots } from "./questionnaireNavigation.js";

const proposedVisible = (page) => !page?.metadata?.adminHiddenInProposed;
const MAIN_482 = ["Details", "Other Names", "Identity", "Contact Details", "Other Family", "Employment", "Education", "Skills", "Language"];

function sidebarFor(audience, options = { isVisible: proposedVisible }) {
  return buildQuestionnaireSidebar(getBuiltInQuestionnaireDefinition(audience), options);
}

function assertConsecutive(sidebar) {
  const numbers = sidebar.items.map((item) => item.stepNumber).filter((number) => number !== null);
  assert.deepEqual(numbers, numbers.map((_, index) => index + 1), "step numbers run 1…N with no gaps");
  assert.equal(sidebar.sectionCount, numbers.length);
}

test("482 Main Applicant matches the client sidebar labels and step numbers", () => {
  const sidebar = sidebarFor({ visaType: "temporary-work", visaContext: "482" });
  assert.deepEqual(sidebar.entries.slice(0, 2).map((entry) => [entry.kind, entry.item.stepNumber, entry.item.label]), [
    ["page", 1, "Getting Started"],
    ["page", 2, "Included Applicants"],
  ]);
  const main = sidebar.entries[2];
  assert.equal(main.kind, "group");
  assert.equal(main.label, "Main Applicant");
  assert.deepEqual(main.items.map((item) => item.label), MAIN_482);
  assert.deepEqual(main.items.map((item) => item.stepNumber), [3, 4, 5, 6, 7, 8, 9, 10, 11]);
  // Other Family is the fifth Main Applicant step and counts as a section.
  assert.equal(main.items[4].page.route, "/intake/temporary-work/non-migrating");
  assert.equal(main.items[4].page.metadata.renderer, "legacy");
  // Labels are not page headings, and headings are untouched.
  assert.equal(main.items[1].page.title, "Main Applicant's Other Details");

  assert.deepEqual(sidebar.entries.slice(3).map((entry) => `${entry.label}: ${entry.items.map((item) => `${item.stepNumber} ${item.label}`).join(", ")}`), [
    "Spouse/Partner: 12 Details, 13 Other Names, 14 Identity",
    "Child: 15 Details, 16 Other Names, 17 Identity, 18 Custody",
    "All Applicants: 19 Visas, 20 Travel History, 21 Countries of Residence, 22 Health, 23 Character",
  ]);
  assertConsecutive(sidebar);
  assert.equal(sidebar.sectionCount, 23);
});

test("hidden and member-template pages do not take step numbers", () => {
  const definition = getBuiltInQuestionnaireDefinition({ visaType: "temporary-work", visaContext: "482" });
  const hidden = definition.pages.filter((page) => !proposedVisible(page));
  assert.equal(hidden.length, 6, "the six Other Family member template pages are hidden in the new layout");
  const sidebar = buildQuestionnaireSidebar(definition, { isVisible: proposedVisible });
  hidden.forEach((page) => assert.equal(sidebar.stepNumberById.has(page.id), false));

  // Shown (classic layout, or an older saved definition without the flag): listed, never numbered.
  const everything = buildQuestionnaireSidebar(definition);
  const members = everything.entries.find((entry) => entry.key === "non-migrating");
  assert.equal(members.label, "Other Family");
  assert.deepEqual(members.items.map((item) => item.label), ["Details", "Passport", "Identity Documents", "Other Names", "Citizenship", "Health"]);
  assert.ok(members.items.every((item) => item.stepNumber === null));
  assertConsecutive(everything);
  assert.equal(everything.sectionCount, 23);
});

test("an older saved definition in any stored order renders in client order without new metadata", () => {
  const definition = getBuiltInQuestionnaireDefinition({ visaType: "temporary-work", visaContext: "482" });
  const saved = {
    ...definition,
    // Stored out of order, with the Other Family page last and no adminHiddenInProposed flags.
    pages: [...definition.pages].reverse().map((page) => {
      const metadata = { ...page.metadata };
      delete metadata.adminHiddenInProposed;
      return { ...page, metadata, order: undefined };
    }),
  };
  const sidebar = buildQuestionnaireSidebar(saved, { isVisible: proposedVisible });
  const main = sidebar.entries.find((entry) => entry.key === "main-applicant");
  assert.deepEqual(main.items.map((item) => `${item.stepNumber} ${item.label}`), MAIN_482.map((label, index) => `${index + 3} ${label}`));
  assertConsecutive(sidebar);
});

test("186, Partner and Protection follow their own client sidebars", () => {
  const groups = (sidebar) => Object.fromEntries(sidebar.entries
    .filter((entry) => entry.kind === "group")
    .map((entry) => [entry.label, entry.items.map((item) => item.label)]));

  const employer = sidebarFor({ visaType: "temporary-work", visaContext: "186" });
  assert.deepEqual(groups(employer)["Main Applicant"], MAIN_482);
  assert.deepEqual(groups(employer)["Spouse/Partner"], ["Details", "Other Names", "Identity", "Education", "Language"]);
  assertConsecutive(employer);

  const partner = sidebarFor({ visaType: "partner" });
  assert.deepEqual(groups(partner)["Main Applicant"], ["Details", "Other Names", "Identity", "Employment", "Education", "Language", "Family", "Other Family"]);
  assert.deepEqual(partner.entries.filter((entry) => entry.kind === "group").map((entry) => entry.label),
    ["Main Applicant", "Spouse/Partner", "Child", "Family Sponsor", "Relationships", "All Applicants"]);
  assertConsecutive(partner);

  const protection = sidebarFor({ visaType: "protection" });
  assert.deepEqual(groups(protection)["Main Applicant"], ["Details", "Other Names", "Identity", "Employment", "Education", "Family", "Other Family"]);
  assert.deepEqual(protection.entries.map((entry) => entry.kind === "page" ? entry.item.label : entry.label),
    ["Getting Started", "Included Applicants", "Main Applicant", "Spouse/Partner", "Child", "Employment", "All Applicants"]);
  assertConsecutive(protection);
});

test("pages the client does not list keep their heading and go last in their group", () => {
  const page = (id, route, title, metadata = {}) => ({ id, route, title, questions: [], metadata });
  const definition = {
    visaType: "temporary-work",
    visaContexts: ["482"],
    pages: [
      page("custom", "/intake/temporary-work/main-applicant/extra", "Extra questions", { profileRole: "main_applicant" }),
      page("identity", "/intake/temporary-work/main-applicant/identity", "Main Applicant's Identity"),
      page("details", "/intake/temporary-work/main-applicant/details", "Details", { navigationTitle: "About you" }),
      page("loose", "/intake/temporary-work/something-else", "Something else"),
    ],
  };
  const sidebar = buildQuestionnaireSidebar(definition);
  assert.deepEqual(sidebar.items.map((item) => `${item.stepNumber} ${item.label}`), [
    "1 About you", "2 Identity", "3 Extra questions", "4 Something else",
  ]);
  assert.equal(sidebar.entries.at(-1).label, "Other sections");
});

// The tables in questionnaireNavigation.js mirror the client portal's. When the workspace has the
// client repo, rebuild the client sidebar from its own exports and compare.
const clientRoutesPath = fileURLToPath(new URL("../../../plylegal-client-portal/src/lib/routes.js", import.meta.url));
test("navigation tables match the Client Portal sidebar", { skip: !existsSync(clientRoutesPath) && "client portal not in this workspace" }, async () => {
  const client = await import(pathToFileURL(clientRoutesPath).href);
  const tail = (href) => String(href).replace(/^\/intake\/[^/]+\//, "");
  const clientSidebar = (visaType, visaContext) => {
    const routes = client.getIntakeRoutes(visaType, visaContext);
    const tables = {
      "temporary-work": [client.PROFILE_SUBPAGES, visaContext === "186" ? client.EMPLOYER_NOMINATION_SPOUSE_PROFILE_SUBPAGES : client.TEMPORARY_WORK_482_SPOUSE_PROFILE_SUBPAGES, client.TEMPORARY_WORK_CHILD_PROFILE_SUBPAGES],
      partner: [client.PARTNER_MAIN_APPLICANT_PROFILE_SUBPAGES, client.PARTNER_SPOUSE_PROFILE_SUBPAGES, client.PARTNER_CHILD_PROFILE_SUBPAGES],
      protection: [client.PROTECTION_MAIN_APPLICANT_PROFILE_SUBPAGES, client.PROTECTION_SPOUSE_PROFILE_SUBPAGES, client.PROTECTION_CHILD_PROFILE_SUBPAGES],
    }[visaType];
    const [main, spouse, child] = tables;
    const rows = [];
    routes.forEach((route) => {
      if (/\/(?:main-applicant|spouse-partner|children)/.test(route.href)) return;
      if (route.href.endsWith("/profile")) {
        rows.push(`|${route.title}|profile|1`);
        main.forEach((sub) => {
          rows.push(`main-applicant|${sub.title}|${tail(sub.href)}|1`);
          const otherFamilyAfter = visaType === "temporary-work" ? "Contact Details" : "Family";
          if (sub.title === otherFamilyAfter) rows.push(`main-applicant|Other Family|non-migrating|1`);
        });
        spouse.forEach((sub) => rows.push(`spouse-partner|${sub.title}|${tail(sub.href)}|1`));
        child.forEach((sub) => rows.push(`children|${sub.title}|children/*/${sub.pathSuffix}|1`));
        client.NON_MIGRATING_MEMBER_SUBPAGES.forEach((sub) => rows.push(`non-migrating|${sub.title}|non-migrating/*/${sub.pathSuffix}|0`));
        return;
      }
      if (route.subpages?.length) route.subpages.forEach((sub) => rows.push(`${route.title}|${sub.title}|${tail(sub.href)}|1`));
      else rows.push(`|${route.title}|${tail(route.href)}|1`);
    });
    return rows;
  };
  for (const [visaType, visaContext] of [["temporary-work", "482"], ["temporary-work", "186"], ["partner", null], ["protection", null]]) {
    const expected = clientSidebar(visaType, visaContext);
    const slots = getClientNavigationSlots(visaType, visaContext || "482");
    assert.equal(slots.length, expected.length, `${visaType} ${visaContext || ""}: same number of sidebar items`);
    expected.forEach((row, index) => {
      const [group, label, path, numbered] = row.split("|");
      const slot = slots[index];
      const route = `/intake/${visaType}/${path.replace("*", "someone")}`;
      assert.equal(slot.label, label, `${visaType} item ${index + 1} label`);
      assert.ok(slot.test(route), `${visaType} item ${index + 1} (${label}) matches ${route}`);
      assert.equal(slot.numbered, numbered === "1", `${visaType} item ${index + 1} numbering`);
      const groupLabel = group === "" ? "" : ({ "main-applicant": "Main Applicant", "spouse-partner": "Spouse/Partner", children: "Child", "non-migrating": "Other Family" })[group] || group;
      assert.equal(slot.groupLabel, groupLabel, `${visaType} item ${index + 1} group`);
    });
  }
});
