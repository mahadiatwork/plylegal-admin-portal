import assert from "node:assert/strict";
import test from "node:test";
import {
  buildQuestionnaireAnswerGroups,
  calculateQuestionnaireAnswerProgress,
  getQuestionnaireAnswerDatePartNames,
  isQuestionnaireAnswerSectionComplete,
  isQuestionVisible,
} from "./questionnaireAnswerModel.js";

function page(role, suffix, order = 10, overrides = {}) {
  const paths = { main_applicant: "main-applicant", spouse: "spouse-partner", child: "children/child-profile", non_migrating: "non-migrating/member-profile" };
  return {
    id: `${role}-${suffix}`, route: `/intake/temporary-work/${paths[role]}/${suffix}`,
    title: suffix, sectionKey: `temporary_work_${suffix.replace(/-/g, "_")}`,
    scope: "profile", order, metadata: { profileRole: role }, questions: [], ...overrides,
  };
}

const definition = { visaType: "temporary-work", pages: [
  page("main_applicant", "details"), page("main_applicant", "contact-details", 20), page("main_applicant", "identity", 15),
  page("main_applicant", "other", 12, { sectionKey: "temporary_work_other_names" }), page("main_applicant", "employment", 30),
  page("spouse", "details"), page("spouse", "other-details", 20), page("spouse", "identity", 30),
  page("child", "details"), page("child", "other", 20), page("child", "identity", 30),
  page("non_migrating", "details"), page("non_migrating", "passport", 20), page("non_migrating", "citizenship", 30),
  { id: "character", route: "/intake/temporary-work/all-applicants/character", sectionKey: "temporary_work_character", title: "Character", scope: "shared", order: 100, questions: [] },
] };

function applicantItems(groups, id) { return groups.find((group) => group.key === `profile:${id}`).items; }
function section(items, suffix) { return items.find((item) => item.page.route.endsWith(`/${suffix}`)); }

test("schema pages expand per person and show unanswered sections, matching the client sidebar", () => {
  const draft = { profiles: [
    { id: "child-2", relationship: "child", given_names: "Second", family_name: "Child" },
    { id: "spouse-1", relationship: "spouse", given_names: "Jill", family_name: "Smith" },
    { id: "main-1", relationship: "main_applicant", given_names: "Main", family_name: "Person" },
    { id: "child-1", relationship: "child", given_names: "First", family_name: "Child" },
  ], profiles_data: { "main-1": { details: { given_names: "Updated", family_name: "Name" } } } };
  const groups = buildQuestionnaireAnswerGroups(definition, draft);
  assert.deepEqual(groups.filter((group) => group.type === "applicant").map((group) => group.title), ["Main Person", "Jill Smith", "Second Child", "First Child"]);
  assert.equal(groups.find((group) => group.key === "profile:spouse-1").subtitle, "Spouse/Partner");
  const main = applicantItems(groups, "main-1");
  assert.equal(main[main.findIndex((item) => item.title === "contact-details") + 1].title, "Other Family");
  assert.equal(section(applicantItems(groups, "child-2"), "identity").page.route, "/intake/temporary-work/children/child-2/identity");
  assert.deepEqual(section(applicantItems(groups, "spouse-1"), "identity").data, {});
});

test("prefixed dynamic profile answers take priority over legacy profile sections and preserve false/zero", () => {
  const groups = buildQuestionnaireAnswerGroups(definition, {
    profiles: [{ id: "main", relationship: "main_applicant", given_names: "Roster", family_name: "Person" }],
    profiles_data: { main: {
      temporary_work_details: { given_names: "Saved", age: 0, flag: false },
      details: { given_names: "Stale" },
      other: { has_other_names: "no", other_names: [] },
      temporary_work_identity: {},
    } },
    temporary_work_identity: { has_passport: "yes" },
  });
  const items = applicantItems(groups, "main");
  assert.deepEqual(section(items, "details").data, { given_names: "Roster", family_name: "Person", age: 0, flag: false });
  assert.deepEqual(section(items, "other").data, { has_other_names: "no", other_names: [] });
  assert.deepEqual(section(items, "identity").data, {});
});

test("legacy main and spouse sections stay isolated when actual profiles are present", () => {
  const groups = buildQuestionnaireAnswerGroups(definition, {
    profiles: [{ id: "main", relationship: "main_applicant" }, { id: "spouse", relationship: "spouse" }, { id: "child", relationship: "child" }],
    temporary_work_identity: { has_passport: "yes" },
    temporary_work_spouse_identity: { has_passport: "no" },
    temporary_work_other: { use_chinese_code: "yes" },
    temporary_work_spouse_other: { use_chinese_code: "no" },
  });
  assert.equal(section(applicantItems(groups, "main"), "identity").data.has_passport, "yes");
  assert.equal(section(applicantItems(groups, "spouse"), "identity").data.has_passport, "no");
  assert.equal(section(applicantItems(groups, "spouse"), "other-details").data.use_chinese_code, "no");
  assert.deepEqual(section(applicantItems(groups, "child"), "identity").data, {});
});

test("multiple people sharing a role do not inherit one person's root legacy answers or completion", () => {
  const groups = buildQuestionnaireAnswerGroups(definition, {
    profiles: [{ id: "a", relationship: "spouse" }, { id: "b", relationship: "spouse" }],
    temporary_work_spouse_identity: { passport_number: "AMBIGUOUS" },
    profiles_data: { a: { identity: { passport_number: "A" } } },
  });
  const a = section(applicantItems(groups, "a"), "identity");
  const b = section(applicantItems(groups, "b"), "identity");
  const completion = { "temporary-work/spouse-partner/identity__a": true, "temporary-work/spouse-partner/identity": true };
  assert.equal(a.data.passport_number, "A");
  assert.deepEqual(b.data, {});
  assert.equal(isQuestionnaireAnswerSectionComplete(a, completion), true);
  assert.equal(isQuestionnaireAnswerSectionComplete(b, completion), false);
});

test("completion aliases preserve profile identity instead of stripping person suffixes", () => {
  const groups = buildQuestionnaireAnswerGroups(definition, { profiles: [
    { id: "main", relationship: "main_applicant" }, { id: "spouse", relationship: "spouse" },
    { id: "child-a", relationship: "child" }, { id: "child-b", relationship: "child" },
  ] });
  const main = section(applicantItems(groups, "main"), "identity");
  const spouse = section(applicantItems(groups, "spouse"), "identity");
  const childA = section(applicantItems(groups, "child-a"), "identity");
  const childB = section(applicantItems(groups, "child-b"), "identity");
  const completion = {
    "/intake/temporary-work/main-applicant/identity?applicationId=example&profileId=spouse": true,
    "temporary-work/spouse-partner/identity__spouse": true,
    "temporary-work/children/child-a/identity__child-a": true,
  };
  assert.equal(isQuestionnaireAnswerSectionComplete(main, completion), false);
  assert.equal(isQuestionnaireAnswerSectionComplete(spouse, completion), true);
  assert.equal(isQuestionnaireAnswerSectionComplete(childA, completion), true);
  assert.equal(isQuestionnaireAnswerSectionComplete(childB, completion), false);
  assert.equal(isQuestionnaireAnswerSectionComplete(main, { "temporary-work/main-applicant/identity?profileId=main": true }), true);
  assert.equal(isQuestionnaireAnswerSectionComplete(main, { "temporary_work_identity__profileId=main": true }), true);
});

test("an explicit current incomplete stamp takes precedence over old completed aliases", () => {
  const groups = buildQuestionnaireAnswerGroups(definition, { profiles: [{ id: "main", relationship: "main_applicant" }] });
  const item = section(applicantItems(groups, "main"), "other");
  assert.equal(isQuestionnaireAnswerSectionComplete(item, {
    "temporary-work/main-applicant/other__main": false,
    "temporary-work/main-applicant/other-names__main": true,
    "temporary_work_other": true,
  }), false);
});

test("non-migrating sections reconstruct the client's nested member storage and isolate completion", () => {
  const groups = buildQuestionnaireAnswerGroups(definition, {
    profiles: [{ id: "main", relationship: "main_applicant" }],
    non_migrating_members: [
      { id: "parent", relationship: "parent", has_current_passport: "no", passport: { given_names: "Alice", family_name: "Smith", sex: "female", dob_day: "4", dob_month: "May", dob_year: "1960" }, place_of_birth: { town_city: "Sydney", state_province: "NSW", country: "Australia" }, citizenship: { has_other: "yes", countries: ["Australia", "Canada"] } },
      { id: "other", passport: { given_names: "Bob", family_name: "Smith" } },
    ],
  });
  const group = groups.find((entry) => entry.key === "nonMigrating:parent");
  assert.equal(group.title, "Alice Smith");
  assert.equal(group.subtitle, "Other Family (parent)");
  assert.equal(section(group.items, "details").data.place_of_birth_state, "NSW");
  assert.equal(section(group.items, "details").data.dob_year, "1960");
  assert.equal(section(group.items, "passport").data.has_current_passport, "no");
  assert.equal(section(group.items, "citizenship").data.citizenship_countries, "Australia, Canada");
  assert.equal(isQuestionnaireAnswerSectionComplete(section(group.items, "passport"), { "temporary-work/non-migrating/parent/passport__parent": true }), true);
  const other = groups.find((entry) => entry.key === "nonMigrating:other");
  assert.equal(isQuestionnaireAnswerSectionComplete(section(other.items, "passport"), { "temporary-work/non-migrating/parent/passport__parent": true }), false);
});

test("legacy drafts without profiles retain named applicants and static start/profile sections", () => {
  const groups = buildQuestionnaireAnswerGroups(definition, {
    temporary_work_details: { given_names: "Original", family_name: "Applicant" },
    temporary_work_spouse_details: { given_names: "Original", family_name: "Partner" },
    temporary_work_character: { char_q01: "no", flag: false, count: 0 },
  });
  assert.equal(groups.find((group) => group.key === "profile:legacy-main_applicant").title, "Original Applicant");
  assert.equal(groups.find((group) => group.key === "profile:legacy-spouse").title, "Original Partner");
  assert.equal(groups.find((group) => group.key === "allApplicants").items[0].data.flag, false);
  assert.equal(groups.find((group) => group.key === "allApplicants").items[0].data.count, 0);
  const progress = calculateQuestionnaireAnswerProgress(groups, {});
  assert.equal(progress.completedSections, 0);
  assert.ok(progress.totalSections > 2);
});

test("partner/protection profile aliases resolve their client legacy roots and nested dotted keys", () => {
  for (const visaType of ["partner", "protection"]) {
    const pages = ["main_applicant", "spouse"].flatMap((role) => ["details", "other"].map((suffix) => ({
      ...page(role, suffix), route: `/intake/${visaType}/${role === "main_applicant" ? "main-applicant" : "spouse-partner"}/${suffix}`,
      sectionKey: `${visaType}_${suffix}`,
    })));
    const questionnaire = visaType === "partner" ? {
      mainApplicant: { details: { given_names: "Main", family_name: "Partner" }, otherNames: { has_other_names: "yes" } },
      "spousePartner.details": { given_names: "Spouse", family_name: "Partner" },
      spousePartner: { otherNames: { has_other_names: "no" } },
    } : {
      protection_details: { given_names: "Main", family_name: "Protection" }, protection_other: { has_other_names: "yes" },
      protection_spouse_details: { given_names: "Spouse", family_name: "Protection" }, protection_spouse_other: { has_other_names: "no" },
    };
    const groups = buildQuestionnaireAnswerGroups({ visaType, pages }, questionnaire);
    assert.equal(section(applicantItems(groups, "legacy-main_applicant"), "other").data.has_other_names, "yes");
    assert.equal(section(applicantItems(groups, "legacy-spouse"), "other").data.has_other_names, "no");
  }
});

test("conditional questions follow client strict visibility semantics, including false/zero existence", () => {
  const values = { answer: "no", flag: false, count: 0, empty: "", list: ["a"] };
  assert.equal(isQuestionVisible({}, values), true);
  assert.equal(isQuestionVisible({ visibleIf: [{ field: "answer", op: "equals", value: "yes" }] }, values), false);
  assert.equal(isQuestionVisible({ visibleIf: [{ field: "flag", op: "equals", value: false }, { field: "count", op: "exists" }] }, values), true);
  assert.equal(isQuestionVisible({ visibleIf: [{ field: "count", op: "equals", value: "0" }] }, values), false);
  assert.equal(isQuestionVisible({ visibleIf: [{ field: "answer", op: "in", value: ["no", "yes"] }] }, values), true);
  assert.equal(isQuestionVisible({ visibleIf: [{ field: "answer", op: "notIn", value: ["no"] }] }, values), false);
  assert.equal(isQuestionVisible({ visibleIf: [{ field: "answer", op: "notEquals", value: "yes" }] }, values), true);
  assert.equal(isQuestionVisible({ visibleIf: [{ field: "empty", op: "notExists" }] }, values), true);
  assert.equal(isQuestionVisible({ visibleIf: [{ field: "flag", op: "exists" }] }, values), true);
  assert.equal(isQuestionVisible({ visibleIf: [{ field: "list", op: "in", value: ["a"] }] }, values), false);
});

test("date parts support client default names and explicit legacy field names", () => {
  assert.deepEqual(getQuestionnaireAnswerDatePartNames({ answerKey: "birth" }), { day: "birth_day", month: "birth_month", year: "birth_year" });
  assert.deepEqual(getQuestionnaireAnswerDatePartNames({ answerKey: "dob", parts: { day: "birth_day", month: "birth_month", year: "birth_year" } }), { day: "birth_day", month: "birth_month", year: "birth_year" });
});

test("progress counts real schema sections once, omits submit and unrelated completion metadata", () => {
  const groups = buildQuestionnaireAnswerGroups({ ...definition, pages: [...definition.pages, { id: "submit", route: "/intake/temporary-work/submit", title: "Submit" }] }, {
    profiles: [{ id: "main", relationship: "main_applicant" }],
  });
  assert.ok(!groups.some((group) => group.items.some((item) => item.page.id === "submit")));
  assert.deepEqual(calculateQuestionnaireAnswerProgress(groups, { "temporary-work/main-applicant/details__main": true, "updatedAt": true, "unrelated": true }), {
    completedSections: 1, totalSections: 9, percentage: 11,
  });
});

test("profiles and started answers never imply completion without the client's stored flags", () => {
  const groups = buildQuestionnaireAnswerGroups(definition, { started: true, profiles: [{ id: "main", relationship: "main_applicant", given_names: "Main" }] });
  assert.equal(calculateQuestionnaireAnswerProgress(groups, {}).completedSections, 0);
  assert.equal(calculateQuestionnaireAnswerProgress(groups, { "temporary-work/start": true, "temporary-work/profile": true }).completedSections, 2);
});

test("custody saved booleans/nested declarations map to the client's question keys", () => {
  const childDefinition = { visaType: "temporary-work", pages: [page("child", "custody")] };
  const groups = buildQuestionnaireAnswerGroups(childDefinition, {
    profiles: [{ id: "child", relationship: "child" }],
    profiles_data: { child: { custody: { under_18: true, primary_custody: { has: false, details: "Court order" }, other_person_rights: { has: true, details: "Shared rights" }, travel_impediments: { has: false, details: "" } } } },
  });
  const values = section(applicantItems(groups, "child"), "custody").data;
  assert.equal(values.under_18, "yes");
  assert.equal(values.primary_custody_has, "no");
  assert.equal(values.primary_custody_details, "Court order");
  assert.equal(values.other_person_rights_has, "yes");
  assert.equal(values.travel_impediments_has, "no");
});

test("catalog metadata preserves nested legacy roots and precise profile section aliases", () => {
  const pages = [
    page("main_applicant", "details", 1, { sectionKey: "safe_main_details", metadata: { profileRole: "main_applicant", profileSection: "details", storagePath: "temporary_work_details" } }),
    { id: "sponsor", route: "/intake/partner/family-sponsor/details", title: "Details", sectionKey: "safe_sponsor_details", scope: "shared", questions: [], metadata: { storagePath: "familySponsor.details" } },
  ];
  const groups = buildQuestionnaireAnswerGroups({ visaType: "temporary-work", pages }, {
    profiles: [{ id: "main", relationship: "main_applicant" }],
    profiles_data: { main: { details: { count: 0 } } }, familySponsor: { details: { given_names: "Sponsor", family_name: "Person", flag: false } },
  });
  assert.equal(section(applicantItems(groups, "main"), "details").data.count, 0);
  assert.equal(groups.find((group) => group.key === "family-sponsor").items[0].data.flag, false);
});

test("multiple sponsor sections sharing a legacy object mark additional answers as shared", () => {
  const pages = ["details", "travel"].map((suffix) => ({ id: `sponsor-${suffix}`, route: `/intake/partner/family-sponsor/${suffix}`, title: suffix, sectionKey: `sponsor_${suffix}`, scope: "shared", questions: [], metadata: { storagePath: "familySponsor.details" } }));
  const groups = buildQuestionnaireAnswerGroups({ visaType: "partner", pages }, { familySponsor: { details: { given_names: "Sponsor", travels: [] } } });
  const items = groups.find((group) => group.key === "family-sponsor").items;
  assert.equal(items[0].page.metadata.sharedStorage, true);
  assert.equal(items[1].page.metadata.sharedStorage, true);
  assert.equal(items[0].data.given_names, "Sponsor");
});

test("temporary-work Details review restores the same earlier citizenship rows as client forms", () => {
  const groups = buildQuestionnaireAnswerGroups(definition, {
    profiles: [{ id: "main", relationship: "main_applicant" }, { id: "spouse", relationship: "spouse" }, { id: "child", relationship: "child" }],
    profiles_data: Object.fromEntries(["main", "spouse", "child"].map((id) => [id, { identity: { citizenships: [{ country: "Canada" }] } }])),
  });
  for (const id of ["main", "spouse", "child"]) {
    const data = section(applicantItems(groups, id), "details").data;
    assert.equal(data.citizenship_other_than_birth, "yes");
    assert.deepEqual(data.citizenships, [{ country: "Canada" }]);
  }
});

test("protection per-person language dictionaries render names and preserve skill booleans", () => {
  const groups = buildQuestionnaireAnswerGroups({ visaType: "protection", pages: [{ id: "languages", title: "Languages", route: "/intake/protection/all-applicants/languages", sectionKey: "protection_languages", questions: [], metadata: { answerLayout: "applicantLanguages" } }] }, {
    profiles: [{ id: "main", relationship: "main_applicant", given_names: "Alex", family_name: "Person" }],
    protection_languages: { main: [{ language: "English", speak: true, read: false, write: false }], previous: [{ language: "French", speak: true }] },
  });
  const data = groups.find((group) => group.key === "allApplicants").items[0].data;
  assert.equal(data.applicants[0].name, "Alex Person");
  assert.equal(data.applicants[0].languages[0].read, false);
  assert.equal(data.applicants[1].name, "previous");
  assert.equal(data.applicants[1].languages[0].language, "French");
});

test("edited page headings preserve the client's original sidebar titles for profiles/members/shared pages", () => {
  const editedDefinition = {
    visaType: "temporary-work", pages: [
      page("main_applicant", "identity", 1, { title: "Updated identity heading", metadata: { profileRole: "main_applicant", originalDisplayTitle: "Identity" } }),
      page("non_migrating", "passport", 2, { title: "Updated passport heading", metadata: { profileRole: "non_migrating", originalDisplayTitle: "Passport" } }),
      { id: "character", route: "/intake/temporary-work/all-applicants/character", title: "Updated declaration heading", sectionKey: "temporary_work_character", scope: "shared", questions: [], metadata: { originalDisplayTitle: "Original declarations", navigationTitle: "Character" } },
    ],
  };
  const groups = buildQuestionnaireAnswerGroups(editedDefinition, {
    profiles: [{ id: "main", relationship: "main_applicant" }], non_migrating_members: [{ id: "parent" }],
  });
  const identity = section(applicantItems(groups, "main"), "identity");
  assert.equal(identity.title, "Identity");
  assert.equal(identity.page.title, "Updated identity heading");
  const passport = groups.find((group) => group.key === "nonMigrating:parent").items[0];
  assert.equal(passport.title, "Passport");
  assert.equal(passport.page.title, "Updated passport heading");
  const character = groups.find((group) => group.key === "allApplicants").items[0];
  assert.equal(character.title, "Character");
  assert.equal(character.page.title, "Updated declaration heading");
});

test("child relationship labels expand original and edited spouse placeholders while preserving edited plain wording", () => {
  const originalLabel = "This person is the spouse or partner's:";
  const originalQuestion = {
    id: "relationship", answerKey: "relationship_to_spouse", label: originalLabel,
    metadata: { originalLabel, labelTemplate: "This person is {spouseName}'s:", requiresSpouse: true },
  };
  const profiles = [
    { id: "spouse", relationship: "spouse", given_names: "Sam", family_name: "Spouse" },
    { id: "child", relationship: "child" },
  ];
  for (const [label, expected] of [
    [originalLabel, "This person is Sam Spouse's:"],
    ["How is this person related to your partner?", "How is this person related to your partner?"],
    ["How is this person related to {spouseName}?", "How is this person related to Sam Spouse?"],
  ]) {
    const relationshipDefinition = { visaType: "temporary-work", pages: [page("child", "details", 1, { questions: [{ ...originalQuestion, label }] })] };
    const groups = buildQuestionnaireAnswerGroups(relationshipDefinition, { profiles });
    assert.equal(section(applicantItems(groups, "child"), "details").page.questions[0].label, expected);
    assert.equal(relationshipDefinition.pages[0].questions[0].label, label);
  }
});
