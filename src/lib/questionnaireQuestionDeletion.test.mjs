import assert from "node:assert/strict";
import { test } from "node:test";
import { buildConditionalForest, nodeForQuestion } from "./questionnaireConditionalBranches.js";
import {
  columnsFor,
  planQuestionDeletion,
  prefillRulesFor,
  removeFieldsFromRepeater,
  removeQuestionsFromPage,
  singleQuestionNode,
} from "./questionnaireQuestionDeletion.js";

const onYes = (field) => [{ field, op: "equals", value: "yes" }];
const question = (answerKey, extra = {}) => ({ id: `q-${answerKey}`, answerKey, label: answerKey, type: "text", ...extra });
const entriesFor = (items) => items.map((item) => ({
  id: item.id,
  label: item.label,
  questions: [item],
  conditions: item.visibleIf || [],
}));
const plan = (items, id, otherScopes = []) => {
  const forest = buildConditionalForest(entriesFor(items));
  return planQuestionDeletion({ items, node: nodeForQuestion(forest, id), otherScopes });
};

test("a question with no follow-ups or references is deleted on its own", () => {
  const items = [question("a"), question("b")];
  assert.deepEqual(plan(items, "q-a"), { removedIds: ["q-a"], removedKeys: ["a"], followUpLabels: [], blockers: [] });
});

test("follow-ups at any depth go with their trigger", () => {
  const items = [
    question("trigger", { type: "yesNo" }),
    question("child", { type: "yesNo", visibleIf: onYes("trigger") }),
    question("grandchild", { visibleIf: onYes("child") }),
    question("unrelated"),
  ];
  const result = plan(items, "q-trigger");
  assert.deepEqual(result.removedIds, ["q-trigger", "q-child", "q-grandchild"]);
  assert.deepEqual(result.followUpLabels, ["child", "grandchild"]);
  assert.deepEqual(result.blockers, []);
  // Deleting the middle follow-up keeps its trigger.
  assert.deepEqual(plan(items, "q-child").removedIds, ["q-child", "q-grandchild"]);
});

test("other display rules that read a removed answer block deletion, including anyOf and popup fields", () => {
  const items = [
    question("trigger", { type: "yesNo" }),
    question("other", { type: "yesNo" }),
    question("second_rule", { visibleIf: [...onYes("other"), ...onYes("trigger")] }),
    { id: "heading", type: "heading", label: "Shown heading", visibleIf: [{ op: "anyOf", value: onYes("trigger") }] },
    question("records", { type: "repeater", metadata: { fields: [question("field", { visibleIf: onYes("trigger") })] } }),
  ];
  assert.deepEqual(plan(items, "q-trigger").blockers, ["second_rule", "Shown heading", "field"]);
});

test("a popup field reading a key its own record has reads the record, not the page", () => {
  const items = [
    question("same", { type: "yesNo" }),
    question("records", { type: "repeater", metadata: { fields: [question("same"), question("f", { visibleIf: onYes("same") })] } }),
  ];
  assert.deepEqual(plan(items, "q-same").blockers, []);
});

test("other pages block only when they read the answer without asking it themselves", () => {
  const items = [question("shared"), question("solo")];
  const otherScopes = [
    { label: "Asks it too", items: [question("shared"), question("x", { visibleIf: onYes("shared") })] },
    { label: "Reads it", items: [question("y", { visibleIf: onYes("solo") })] },
  ];
  assert.deepEqual(plan(items, "q-shared", otherScopes).blockers, []);
  assert.deepEqual(plan(items, "q-solo", otherScopes).blockers, ["y (Reads it)"]);
});

test("an answer key still asked by a remaining question is not treated as removed", () => {
  const items = [question("dup"), { ...question("dup"), id: "q-dup-2" }, question("z", { visibleIf: onYes("dup") })];
  const result = planQuestionDeletion({ items, node: singleQuestionNode(items[0]) });
  assert.deepEqual(result.removedKeys, []);
  assert.deepEqual(result.blockers, []);
});

test("removing questions prunes prefill rules and table columns but keeps everything else", () => {
  const page = {
    id: "p", route: "/r", sectionKey: "s", completionKey: "c",
    metadata: { renderer: "dynamic", prefill: [{ answerKey: "a", value: 1 }, { answerKey: "b", value: 2 }] },
    questions: [question("a"), question("b")],
  };
  const request = { removedIds: ["q-a"], removedKeys: ["a"] };
  assert.deepEqual(prefillRulesFor(page, request.removedKeys), [{ answerKey: "a", value: 1 }]);
  const next = removeQuestionsFromPage(page, request);
  assert.deepEqual(next.questions, [question("b")]);
  assert.deepEqual(next.metadata, { renderer: "dynamic", prefill: [{ answerKey: "b", value: 2 }] });
  assert.equal(page.questions.length, 2, "the input page is not mutated");

  const repeater = question("records", {
    type: "repeater",
    metadata: { collection: "array", fields: [question("f1"), question("f2")], presentation: { addLabel: "Add", columns: [{ key: "f1" }, { key: "f2" }] } },
  });
  const fieldRequest = { removedIds: ["q-f1"], removedKeys: ["f1"] };
  assert.deepEqual(columnsFor(repeater, fieldRequest.removedKeys), [{ key: "f1" }]);
  const nextRepeater = removeFieldsFromRepeater(repeater, fieldRequest);
  assert.deepEqual(nextRepeater.metadata, {
    collection: "array",
    fields: [question("f2")],
    presentation: { addLabel: "Add", columns: [{ key: "f2" }] },
  });
});
