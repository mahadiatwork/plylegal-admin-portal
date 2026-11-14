import assert from "node:assert/strict";
import test from "node:test";
import {
  convertGroupHeadingsToContentItems,
  convertPageGroupHeadings,
  isQuestionnaireDisplayItem,
} from "../src/lib/questionnaireContentItems.js";
import {
  getQuestionnaireDefinitionIssues,
  normalizeQuestionnaireDefinition,
} from "../src/lib/questionnaireDefinitions.js";
import { migrateLegacyQuestionnaireDefinition } from "../src/lib/questionnaireLegacyProtection.js";
import { getClientQuestionnairePresentation } from "../src/lib/questionnaireClientPresentation.js";
import { getBuiltInQuestionnaireDefinition } from "../src/lib/questionnaireBuiltIns.js";

const q = (answerKey, group, extra = {}) => ({
  id: `details-${answerKey}`,
  answerKey,
  label: answerKey.replace(/_/g, " "),
  type: "text",
  ...(group ? { metadata: { group } } : {}),
  ...extra,
});

const summary = (items) => items.map((item) => (isQuestionnaireDisplayItem(item) ? `${item.type}:${item.label}` : item.answerKey));

test("a shared section heading becomes one heading item above its questions", () => {
  const questions = [
    q("family_name", "Personal Information"),
    q("given_names", "Personal Information"),
    q("gender", "Personal Information"),
    q("country_of_birth", "Birthplace Information"),
    q("notes"),
  ];
  const converted = convertGroupHeadingsToContentItems(questions);
  assert.deepEqual(summary(converted), [
    "heading:Personal Information", "family_name", "given_names", "gender",
    "heading:Birthplace Information", "country_of_birth", "notes",
  ]);
  assert.equal(converted[0].id, "details-family_name-heading", "ids derive from the run's first question");
  assert.ok(converted.filter((item) => !isQuestionnaireDisplayItem(item)).every((item) => item.metadata?.group === undefined));
  assert.equal(questions[0].metadata.group, "Personal Information", "the input is not mutated");
});

test("separate groups are not merged just because their text matches", () => {
  const converted = convertGroupHeadingsToContentItems([
    q("a", "Contact"), q("b", "Address"), q("c", "Contact"),
  ]);
  assert.deepEqual(summary(converted), ["heading:Contact", "a", "heading:Address", "b", "heading:Contact", "c"]);
  assert.equal(new Set(converted.map((item) => item.id)).size, converted.length, "ids stay unique");
});

test("a heading keeps a display rule shared by its whole run, and conversion is idempotent", () => {
  const rule = [{ field: "has_partner", op: "equals", value: "yes" }];
  const converted = convertGroupHeadingsToContentItems([
    q("has_partner"),
    q("partner_name", "Partner", { visibleIf: rule }),
    q("partner_dob", "Partner", { visibleIf: rule }),
    q("x", "Mixed", { visibleIf: rule }),
    q("y", "Mixed"),
  ]);
  assert.deepEqual(converted[1].visibleIf, rule);
  assert.equal(converted.find((item) => item.label === "Mixed").visibleIf, undefined);
  assert.equal(convertGroupHeadingsToContentItems(converted), converted);
});

test("an existing heading directly above a run is reused, not duplicated", () => {
  const converted = convertGroupHeadingsToContentItems([
    { id: "details-family_name-heading", type: "heading", label: "Personal Information" },
    q("family_name", "Personal Information"),
    q("given_names", "Personal Information"),
  ]);
  assert.deepEqual(summary(converted), ["heading:Personal Information", "family_name", "given_names"]);
});

test("legacy pages keep their locked structure", () => {
  const page = { id: "p", metadata: { renderer: "legacy" }, questions: [q("a", "Group")] };
  assert.equal(convertPageGroupHeadings(page), page);
});

function definitionWith(questions, status = "draft") {
  return {
    id: "content-test", title: "Content test", version: "1", visaType: "temporary-work", visaContexts: ["482"],
    status, schemaVersion: 1, revision: 0,
    pages: [{
      id: "details", route: "/intake/temporary-work/all-applicants/character", title: "Details", sectionKey: "content_test",
      completionKey: "temporary-work/all-applicants/character", scope: "shared", order: 10, questions,
    }],
  };
}

test("headings and explanatory text validate without answer keys and are not counted as questions", () => {
  const valid = definitionWith([
    { id: "h1", type: "heading", label: "Personal Information" },
    { id: "p1", type: "paragraph", label: "Use the names shown in your passport.", visibleIf: [{ field: "family_name", op: "exists" }] },
    q("family_name"),
  ], "active");
  assert.deepEqual(getQuestionnaireDefinitionIssues(valid), []);
  const normalized = normalizeQuestionnaireDefinition(valid);
  assert.deepEqual(normalized.pages[0].questions[0], { id: "h1", type: "heading", label: "Personal Information" });

  const withAnswerKey = definitionWith([{ id: "h1", type: "heading", label: "Title", answerKey: "title" }, q("a")]);
  assert.ok(getQuestionnaireDefinitionIssues(withAnswerKey).some((issue) => issue.includes("answerKey is not supported")));
  const withoutText = definitionWith([{ id: "h1", type: "heading", label: "" }, q("a")]);
  assert.ok(getQuestionnaireDefinitionIssues(withoutText).some((issue) => issue.includes("label is required")));
  const onlyContent = definitionWith([{ id: "h1", type: "heading", label: "Title" }], "active");
  assert.ok(getQuestionnaireDefinitionIssues(onlyContent).some((issue) => issue.includes("at least one question")));
  const duplicateId = definitionWith([{ id: "a", type: "heading", label: "Title" }, { ...q("a"), id: "a" }]);
  assert.ok(getQuestionnaireDefinitionIssues(duplicateId).some((issue) => issue.includes("duplicated")));
});

test("existing saved dynamic definitions migrate safely and keep every answer key", () => {
  const saved = definitionWith([
    q("family_name", "Personal Information"),
    q("given_names", "Personal Information"),
    q("gender", "Personal Information"),
  ]);
  const { definition: migrated, report } = migrateLegacyQuestionnaireDefinition(saved);
  assert.deepEqual(summary(migrated.pages[0].questions), ["heading:Personal Information", "family_name", "given_names", "gender"]);
  assert.ok(report.preserved.some((entry) => entry.includes("converted section headings")));
  assert.deepEqual(getQuestionnaireDefinitionIssues(migrated), []);
  for (const key of ["id", "route", "sectionKey", "completionKey"]) assert.equal(migrated.pages[0][key], saved.pages[0][key]);
  assert.deepEqual(
    migrated.pages[0].questions.filter((item) => item.answerKey).map((item) => [item.id, item.answerKey]),
    saved.pages[0].questions.map((item) => [item.id, item.answerKey]),
  );
  // Save → load round trip: a second migration changes nothing.
  const reloaded = migrateLegacyQuestionnaireDefinition(normalizeQuestionnaireDefinition(migrated));
  assert.deepEqual(reloaded.report.preserved, []);
  assert.deepEqual(reloaded.definition.pages[0].questions, normalizeQuestionnaireDefinition(migrated).pages[0].questions);
});

test("the certified 482 Details page shows Personal Information once above its questions", () => {
  const definition = getBuiltInQuestionnaireDefinition({ visaType: "temporary-work", visaContext: "482" });
  const details = definition.pages.find((page) => page.route.endsWith("/main-applicant/details"));
  assert.deepEqual(summary(details.questions).slice(0, 4), ["heading:Personal Information", "family_name", "given_names", "gender"]);
  assert.equal(details.questions.filter((item) => item.type === "heading" && item.label === "Personal Information").length, 1);
});

test("the builder preview shows content items in order and a legacy group heading once per run", () => {
  const dynamic = getClientQuestionnairePresentation({
    questions: [{ id: "h1", type: "heading", label: "Personal Information" }, q("family_name"), { id: "p1", type: "paragraph", label: "Note" }, q("given_names")],
  });
  assert.deepEqual(dynamic.primaryEntries.map((entry) => entry.kind), ["heading", "question", "paragraph", "question"]);
  assert.equal(dynamic.primaryCount, 2, "content items are not counted as questions");

  const legacy = getClientQuestionnairePresentation({
    metadata: { renderer: "legacy" },
    questions: [q("family_name", "Personal Information"), q("given_names", "Personal Information"), q("gender", "Personal Information"), q("city", "Birthplace")],
  });
  assert.deepEqual(legacy.primaryEntries.map((entry) => entry.showGroup), [true, false, false, true]);
});

test("locked legacy pages still reject added content at the persistence boundary", async () => {
  const { assertQuestionnaireDefinitionStructureEditable } = await import("../src/lib/questionnaireDefinitions.js");
  const current = getBuiltInQuestionnaireDefinition({ visaType: "temporary-work", visaContext: "186" });
  const next = structuredClone(current);
  const page = next.pages.find((candidate) => candidate.route.endsWith("/main-applicant/employment"));
  assert.equal(page.metadata.renderer, "legacy");
  page.questions.unshift({ id: "added-heading", type: "heading", label: "New heading" });
  assert.throws(() => assertQuestionnaireDefinitionStructureEditable(current, next), /locked|parity/);
});
