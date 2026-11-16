import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  NAVIGATION_GROUP_KEYS,
  createCustomSection,
  enableDefinitionNavigation,
  getGroupPages,
  getIncludedGroupKeys,
  getPageGroupKey,
  isDefinitionNavigation,
  moveGroup,
  moveGroupPage,
  reorderGroup,
  reorderGroupPages,
  setGroupIncluded,
} from "./questionnaireNavigationModel.js";
import { buildQuestionnaireSidebar } from "./questionnaireNavigation.js";
import {
  mergeQuestionnaireDefinition,
  normalizeQuestionnaireDefinition,
  QuestionnaireDefinitionValidationError,
} from "./questionnaireDefinitions.js";
import { getRegisteredQuestionnaireRoutes } from "./routes.js";
import { completeAdminQuestionnairePages } from "./questionnaireAdminCoverage.js";
import { createQuestionnaireDraft, createQuestionnaireDraftForMatterType } from "./questionnaireDrafts.js";
import { buildQuestionnaireAnswerGroups, calculateQuestionnaireAnswerProgress } from "./questionnaireAnswerModel.js";

function blank(overrides = {}) {
  return {
    id: "questionnaire-test",
    title: "Blank",
    version: "1.0.0",
    visaType: "temporary-work",
    visaContexts: ["482"],
    status: "draft",
    schemaVersion: 1,
    revision: 0,
    navigation: { mode: "definition", groups: ["main-applicant"] },
    pages: [],
    ...overrides,
  };
}

const builtInRoutes = getRegisteredQuestionnaireRoutes("temporary-work", ["482"]);

function addSection(definition, title, groupKey = "main-applicant") {
  return createCustomSection(definition, { title, groupKey, builtInRoutes });
}

test("a blank questionnaire can get entirely new, titled sections under Main Applicant", () => {
  let { definition, page: first } = addSection(blank(), "Employer Background");
  let second;
  ({ definition, page: second } = addSection(definition, "Work Authorisation"));

  assert.equal(first.title, "Employer Background");
  assert.equal(first.route, "/intake/temporary-work/main-applicant/employer-background");
  assert.equal(first.sectionKey, "custom_employer_background");
  assert.equal(first.completionKey, "temporary-work/main-applicant/employer-background");
  assert.equal(first.scope, "profile");
  assert.equal(first.metadata.renderer, "dynamic", "new content pages use the dynamic renderer");
  assert.equal(first.metadata.profileRole, "main_applicant");
  assert.equal(second.route, "/intake/temporary-work/main-applicant/work-authorisation");

  // The result is a valid definition the server accepts, and keeps its navigation.
  const normalized = normalizeQuestionnaireDefinition(definition);
  assert.deepEqual(normalized.navigation, { mode: "definition", groups: ["main-applicant"] });
  assert.deepEqual(normalized.pages.map((page) => page.title), ["Employer Background", "Work Authorisation"]);
});

test("identical titles still produce unique ids, routes, section keys and completion keys", () => {
  let definition = blank();
  const pages = [];
  for (let index = 0; index < 4; index += 1) {
    const result = addSection(definition, "Background");
    definition = result.definition;
    pages.push(result.page);
  }
  for (const field of ["id", "route", "sectionKey", "completionKey"]) {
    assert.equal(new Set(pages.map((page) => page[field])).size, 4, `${field} must be unique`);
  }
  assert.equal(pages[1].route, "/intake/temporary-work/main-applicant/background-2");
  assert.doesNotThrow(() => normalizeQuestionnaireDefinition(definition));
});

test("a new section can never shadow a hand-written client screen", () => {
  for (const title of ["Details", "Identity", "Skills", "Start", "Submit", "Profile", "Children"]) {
    const { page } = addSection(blank(), title);
    const slug = page.route.split("/").pop();
    assert.notEqual(slug, title.toLowerCase(), `${title} must not reuse the built-in route segment`);
    assert.match(page.route, /^\/intake\/temporary-work\/main-applicant\/[a-z0-9-]+$/);
  }
  const { page } = addSection(blank(), "Détails & Notes!!");
  assert.equal(page.route, "/intake/temporary-work/main-applicant/details-notes");
});

test("renaming a section never changes the keys client answers depend on", () => {
  const { definition, page } = addSection(blank(), "Original Title");
  const renamed = { ...definition, pages: definition.pages.map((candidate) => ({ ...candidate, title: "Brand New Title" })) };
  const after = renamed.pages[0];
  assert.equal(after.id, page.id);
  assert.equal(after.route, page.route);
  assert.equal(after.sectionKey, page.sectionKey);
  assert.equal(after.completionKey, page.completionKey);
  assert.doesNotThrow(() => normalizeQuestionnaireDefinition(renamed));
});

test("sections can be created in any group with the right route shape and scope", () => {
  const expectations = {
    "main-applicant": ["/intake/temporary-work/main-applicant/extra", "profile", "main_applicant"],
    "spouse-partner": ["/intake/temporary-work/spouse-partner/extra", "profile", "spouse"],
    children: ["/intake/temporary-work/children/child-profile/extra", "profile", "child"],
    "non-migrating": ["/intake/temporary-work/non-migrating/member-profile/extra", "profile", "non_migrating"],
    "all-applicants": ["/intake/temporary-work/all-applicants/extra", "shared", undefined],
    "family-sponsor": ["/intake/temporary-work/family-sponsor/extra", "shared", undefined],
    relationships: ["/intake/temporary-work/relationships/extra", "shared", undefined],
  };
  for (const [groupKey, [route, scope, role]] of Object.entries(expectations)) {
    const { definition, page } = addSection(blank(), "Extra", groupKey);
    assert.equal(page.route, route, groupKey);
    assert.equal(page.scope, scope, groupKey);
    assert.equal(page.metadata.profileRole, role, groupKey);
    assert.equal(getPageGroupKey(page), groupKey);
    assert.ok(getIncludedGroupKeys(definition).includes(groupKey), "creating a section includes its group");
    assert.doesNotThrow(() => normalizeQuestionnaireDefinition(definition), groupKey);
  }
  assert.throws(() => createCustomSection(blank(), { title: "", groupKey: "main-applicant" }), /title is required/);
  assert.throws(() => createCustomSection(blank(), { title: "x", groupKey: "nope" }), /group/);
});

test("groups can be included, excluded and ordered; pages are preserved", () => {
  let { definition } = addSection(blank(), "Alpha");
  ({ definition } = addSection(definition, "Shared one", "all-applicants"));
  assert.deepEqual(getIncludedGroupKeys(definition), ["main-applicant", "all-applicants"]);

  definition = setGroupIncluded(definition, "all-applicants", false);
  assert.deepEqual(getIncludedGroupKeys(definition), ["main-applicant"]);
  assert.equal(definition.pages.length, 2, "excluding a group keeps its sections so answers stay mapped");

  definition = setGroupIncluded(definition, "all-applicants", true);
  definition = setGroupIncluded(definition, "spouse-partner", true);
  assert.deepEqual(getIncludedGroupKeys(definition), ["main-applicant", "all-applicants", "spouse-partner"]);
  definition = moveGroup(definition, "spouse-partner", -1);
  assert.deepEqual(getIncludedGroupKeys(definition), ["main-applicant", "spouse-partner", "all-applicants"]);
  definition = reorderGroup(definition, "all-applicants", "main-applicant");
  assert.deepEqual(getIncludedGroupKeys(definition), ["all-applicants", "main-applicant", "spouse-partner"]);
  assert.deepEqual(moveGroup(definition, "all-applicants", -1).navigation.groups, definition.navigation.groups, "cannot move past the start");
});

test("sections reorder within their group by keyboard step or drop, without touching other groups", () => {
  let definition = blank();
  for (const title of ["One", "Two", "Three"]) ({ definition } = addSection(definition, title));
  ({ definition } = addSection(definition, "Elsewhere", "all-applicants"));
  const otherBefore = definition.pages.find((page) => page.title === "Elsewhere").order;
  const titles = () => getGroupPages(definition, "main-applicant").map((page) => page.title);

  assert.deepEqual(titles(), ["One", "Two", "Three"]);
  definition = moveGroupPage(definition, "main-applicant", definition.pages.find((page) => page.title === "Three").id, -1);
  assert.deepEqual(titles(), ["One", "Three", "Two"]);
  definition = reorderGroupPages(definition, "main-applicant", definition.pages.find((page) => page.title === "Two").id, definition.pages.find((page) => page.title === "One").id);
  assert.deepEqual(titles(), ["Two", "One", "Three"]);
  assert.equal(definition.pages.find((page) => page.title === "Elsewhere").order, otherBefore);

  // Order survives the server's canonical round trip and the sidebar uses it.
  const normalized = normalizeQuestionnaireDefinition(definition);
  assert.deepEqual(getGroupPages(normalized, "main-applicant").map((page) => page.title), ["Two", "One", "Three"]);
  const sidebar = buildQuestionnaireSidebar(normalized);
  const main = sidebar.entries.find((entry) => entry.key === "main-applicant");
  assert.deepEqual(main.items.map((item) => item.label), ["Two", "One", "Three"]);
  assert.deepEqual(main.items.map((item) => item.stepNumber), [1, 2, 3]);
});

test("sidebar only lists included groups and reports the excluded ones", () => {
  let { definition } = addSection(blank(), "Alpha");
  ({ definition } = addSection(definition, "Spousal", "spouse-partner"));
  definition = setGroupIncluded(definition, "spouse-partner", false);
  const sidebar = buildQuestionnaireSidebar(definition);
  assert.deepEqual(sidebar.entries.map((entry) => entry.key), ["main-applicant"]);
  assert.equal(sidebar.items.length, 1);
  assert.deepEqual(sidebar.excludedGroups.find((group) => group.key === "spouse-partner").pages.map((page) => page.title), ["Spousal"]);
});

test("definitions without navigation are untouched; opting in preserves the groups clients currently see", () => {
  const legacy = blank({ navigation: undefined, pages: [] });
  delete legacy.navigation;
  assert.equal(isDefinitionNavigation(legacy), false);
  assert.equal(buildQuestionnaireSidebar(legacy).definitionDriven, undefined);
  assert.deepEqual(getIncludedGroupKeys(legacy), [...NAVIGATION_GROUP_KEYS]);

  const withPages = {
    ...legacy,
    pages: [
      { id: "a", title: "A", route: "/intake/temporary-work/main-applicant/details", sectionKey: "details", scope: "profile", order: 10, questions: [] },
      { id: "b", title: "B", route: "/intake/temporary-work/all-applicants/health", sectionKey: "health", scope: "shared", order: 20, questions: [] },
    ],
  };
  assert.deepEqual(enableDefinitionNavigation(withPages).navigation.groups, ["main-applicant", "all-applicants"]);
  assert.equal(enableDefinitionNavigation(withPages).pages, withPages.pages, "pages are not rewritten");
});

test("the server validates and persists navigation", () => {
  const good = blank();
  assert.deepEqual(normalizeQuestionnaireDefinition(good).navigation, good.navigation);
  for (const navigation of [
    { mode: "legacy", groups: [] },
    { mode: "definition", groups: ["main-applicant", "main-applicant"] },
    { mode: "definition", groups: ["bogus"] },
    { mode: "definition", groups: "main-applicant" },
    { mode: "definition", groups: [], extra: true },
  ]) {
    assert.throws(() => normalizeQuestionnaireDefinition({ ...good, navigation }), QuestionnaireDefinitionValidationError);
  }
  const merged = mergeQuestionnaireDefinition(good, { navigation: { mode: "definition", groups: ["all-applicants", "main-applicant"] } });
  assert.deepEqual(merged.navigation.groups, ["all-applicants", "main-applicant"]);
  assert.deepEqual(mergeQuestionnaireDefinition(good, { title: "Renamed" }).navigation, good.navigation, "navigation survives unrelated patches");
});

test("an active questionnaire may keep empty sections in an excluded group but not in an included one", () => {
  let { definition } = addSection(blank(), "Alpha");
  definition = { ...definition, status: "active", pages: definition.pages.map((page) => ({ ...page, questions: [{ id: "q1", answerKey: "q1", label: "Q", type: "text" }] })) };
  ({ definition } = addSection(definition, "Spousal", "spouse-partner"));
  definition = setGroupIncluded(definition, "spouse-partner", false);
  assert.doesNotThrow(() => normalizeQuestionnaireDefinition(definition));
  assert.throws(() => normalizeQuestionnaireDefinition(setGroupIncluded(definition, "spouse-partner", true)), /at least one question/);
});

test("group and route classification matches the client portal", async (t) => {
  const clientFile = new URL("../../../plylegal-client-portal/src/lib/questionnaires/navigation.js", import.meta.url);
  if (!fs.existsSync(clientFile)) return t.skip("client repo not present");
  const client = await import(clientFile.href);
  assert.deepEqual([...client.NAVIGATION_GROUP_KEYS], [...NAVIGATION_GROUP_KEYS]);
  const routes = [
    "/intake/temporary-work/main-applicant/details",
    "/intake/temporary-work/spouse-partner/identity",
    "/intake/temporary-work/children/child-profile/custody",
    "/intake/temporary-work/children/abc123/custody",
    "/intake/temporary-work/non-migrating/member-profile/health",
    "/intake/partner/family-sponsor/details",
    "/intake/partner/relationships/current-relationship",
    "/intake/temporary-work/all-applicants/health",
    "/intake/protection/employment",
    "/intake/temporary-work/children",
  ];
  for (const route of routes) {
    assert.equal(client.getPageGroupKey({ route }), getPageGroupKey({ route }), route);
  }
  // Same included groups and the same page order for the same definition.
  let { definition } = addSection(blank(), "Alpha");
  ({ definition } = addSection(definition, "Beta"));
  definition = moveGroupPage(definition, "main-applicant", definition.pages[1].id, -1);
  const nav = client.buildDefinitionNavigation(definition, { draft: { profiles: [{ id: "m", relationship: "main_applicant" }] } });
  assert.deepEqual(
    nav.steps.filter((step) => step.kind === "page").map((step) => step.page.title),
    buildQuestionnaireSidebar(definition).items.map((item) => item.label),
  );
});

test("root cause: opening a saved blank questionnaire used to pad it with every built-in page", () => {
  // Legacy behaviour (unchanged): the editor shows the client's fallback pages for a definition that omits them.
  const legacyBlank = blank();
  delete legacyBlank.navigation;
  assert.ok(completeAdminQuestionnairePages(legacyBlank).pages.length > 0);
  // A definition-driven questionnaire has no client fallback, so it is shown exactly as saved.
  const driven = completeAdminQuestionnairePages(blank());
  assert.deepEqual(driven.pages, []);
  const { definition } = addSection(blank(), "Only mine");
  assert.deepEqual(completeAdminQuestionnairePages(definition).pages.map((page) => page.title), ["Only mine"]);
});

test("copying a definition-driven questionnaire keeps its structure, even for another subclass", () => {
  let { definition } = addSection(blank(), "Alpha");
  ({ definition } = addSection(definition, "Spousal", "spouse-partner"));
  definition = setGroupIncluded(definition, "spouse-partner", false);

  const copy = createQuestionnaireDraft(definition, "copy-1");
  assert.deepEqual(copy.navigation, { mode: "definition", groups: ["main-applicant"] });
  assert.notEqual(copy.navigation, definition.navigation, "the copy is independent");
  assert.deepEqual(copy.pages.map((page) => page.title), ["Alpha", "Spousal"]);

  const to186 = createQuestionnaireDraftForMatterType(definition, "copy-2", { visaType: "temporary-work", visaContexts: ["186"] });
  assert.deepEqual(to186.visaContexts, ["186"]);
  assert.deepEqual(to186.navigation.groups, ["main-applicant"]);
  assert.deepEqual(to186.pages.map((page) => page.title), ["Alpha", "Spousal"], "custom sections are not replaced by the other subclass's built-ins");
  assert.doesNotThrow(() => normalizeQuestionnaireDefinition(to186));
});

test("matter review and progress in the admin portal cover only the included groups", () => {
  let { definition } = addSection(blank(), "Alpha");
  ({ definition } = addSection(definition, "Beta"));
  ({ definition } = addSection(definition, "Spousal", "spouse-partner"));
  definition = setGroupIncluded(definition, "spouse-partner", false);
  const questionnaire = {
    visaContext: "482",
    profiles: [
      { id: "m1", relationship: "main_applicant", given_names: "Alex", family_name: "Main" },
      { id: "s1", relationship: "spouse", given_names: "Sam", family_name: "Main" },
    ],
    non_migrating_members: [{ id: "n1", passport: { given_names: "Nina" } }],
    profiles_data: { s1: { custom_spousal: { x: "kept" } } },
  };
  const completion = { "temporary-work/start": true, "temporary-work/profile": true, "temporary-work/main-applicant/alpha__m1": true };
  const groups = buildQuestionnaireAnswerGroups(definition, questionnaire);
  const titles = groups.flatMap((group) => group.items.map((item) => item.title));
  assert.deepEqual(titles, ["Getting Started", "Included Applicants", "Alpha", "Beta"], "no Other Family, spouse or hidden sections");
  assert.ok(!groups.some((group) => group.type === "nonMigrating"));
  assert.deepEqual(calculateQuestionnaireAnswerProgress(groups, completion), { completedSections: 3, totalSections: 4, percentage: 75 });

  // Without definition-driven navigation the same data still counts every built-in group (compat).
  const legacy = { ...definition };
  delete legacy.navigation;
  const legacyTitles = buildQuestionnaireAnswerGroups(legacy, questionnaire).flatMap((group) => group.items.map((item) => item.title));
  assert.ok(legacyTitles.includes("Spousal") && legacyTitles.includes("Other Family"));
});
