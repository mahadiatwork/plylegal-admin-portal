import assert from "node:assert/strict";
import { test } from "node:test";
import { getClientQuestionnairePresentation } from "./questionnaireClientPresentation.js";
import {
  buildConditionalForest,
  descendantNodes,
  followUpInsertIndex,
  getAnswerBranches,
  moveItemBlock,
  nodeBranchPosition,
  nodeForQuestion,
  nodeQuestionIds,
  rootNodeOf,
  ruleAnswerValues,
} from "./questionnaireConditionalBranches.js";

const YES_NO = [{ value: "yes", label: "Yes" }, { value: "no", label: "No" }];
const revealedOnYes = (field) => [{ field, op: "equals", value: "yes" }];

// Shape of the spouse/partner "Other Personal Details" page (482, certified).
function otherDetailsPage() {
  return {
    route: "/intake/temporary-work/spouse-partner/other-details",
    questions: [
      { id: "has_other_names", answerKey: "has_other_names", label: "Have you ever had another name?", type: "yesNo", options: YES_NO },
      {
        id: "other_names",
        answerKey: "other_names",
        label: "Other Names",
        type: "repeater",
        visibleIf: revealedOnYes("has_other_names"),
        metadata: {
          fields: [
            { id: "family_name", answerKey: "family_name", label: "Family Name", type: "text" },
            { id: "has_evidence", answerKey: "has_evidence", label: "Do you have identity documents?", type: "yesNo", options: YES_NO },
            { id: "evidence_type", answerKey: "evidence_type", label: "Evidence Type", type: "select", visibleIf: revealedOnYes("has_evidence") },
            { id: "issue_day", answerKey: "document_issue_day", label: "Date of Document Issue", type: "text", visibleIf: revealedOnYes("has_evidence") },
            { id: "issue_month", answerKey: "document_issue_month", label: "Date of Document Issue", type: "text", visibleIf: revealedOnYes("has_evidence") },
            { id: "issue_year", answerKey: "document_issue_year", label: "Date of Document Issue", type: "text", visibleIf: revealedOnYes("has_evidence") },
          ],
        },
      },
      { id: "use_chinese_code", answerKey: "use_chinese_code", label: "Do you use a Chinese Commercial Code?", type: "yesNo", options: YES_NO },
      { id: "chinese_code", answerKey: "chinese_code", label: "Chinese Commercial Code", type: "text", visibleIf: revealedOnYes("use_chinese_code") },
    ],
  };
}

test("each Yes/No trigger owns the follow-ups its answer reveals", () => {
  const presentation = getClientQuestionnairePresentation(otherDetailsPage());
  const forest = buildConditionalForest(presentation.entries);

  assert.deepEqual(forest.roots.map((node) => node.entry.id), ["has_other_names", "use_chinese_code"]);
  const [otherNames, chineseCode] = forest.roots;
  assert.deepEqual(otherNames.branches.map((branch) => branch.children.map((child) => child.entry.id)), [["other_names"]]);
  assert.deepEqual(chineseCode.branches.map((branch) => branch.children.map((child) => child.entry.id)), [["chinese_code"]]);

  const branches = getAnswerBranches(otherNames, YES_NO);
  assert.deepEqual(branches.map((branch) => [branch.kind, branch.label, branch.children.length]), [
    ["answer", "Yes", 1],
    ["answer", "No", 0],
  ]);
});

test("record fields build their own tree, with split dates as one follow-up", () => {
  const presentation = getClientQuestionnairePresentation(otherDetailsPage());
  const repeater = presentation.entries.find((entry) => entry.id === "other_names");
  const forest = buildConditionalForest(repeater.nestedEntries);

  assert.deepEqual(forest.roots.map((node) => node.entry.id), ["family_name", "has_evidence"]);
  const evidence = forest.roots[1];
  assert.deepEqual(descendantNodes(evidence).map((node) => node.entry.id), ["evidence_type", "date:document_issue"]);
  assert.deepEqual(nodeQuestionIds(evidence), ["has_evidence", "evidence_type", "issue_day", "issue_month", "issue_year"]);

  const datePart = nodeForQuestion(forest, "issue_month");
  assert.equal(datePart.entry.id, "date:document_issue");
  assert.equal(rootNodeOf(forest, datePart), evidence);
  const position = nodeBranchPosition(forest, datePart);
  assert.equal(position.parent, evidence);
  assert.equal(position.index, 1);
});

test("follow-ups of follow-ups nest under their own trigger", () => {
  const page = {
    route: "/intake/test",
    questions: [
      { id: "a", answerKey: "a", label: "A", type: "yesNo", options: YES_NO },
      { id: "b", answerKey: "b", label: "B", type: "yesNo", options: YES_NO, visibleIf: revealedOnYes("a") },
      { id: "c", answerKey: "c", label: "C", type: "text", visibleIf: revealedOnYes("b") },
      { id: "d", answerKey: "d", label: "D", type: "text", visibleIf: [{ field: "a", op: "notEquals", value: "yes" }] },
      { id: "e", answerKey: "e", label: "E", type: "text", visibleIf: revealedOnYes("other_page_answer") },
    ],
  };
  const forest = buildConditionalForest(getClientQuestionnairePresentation(page).entries);
  assert.deepEqual(forest.roots.map((node) => node.entry.id), ["a", "e"], "an answer from another page leaves the follow-up at the top level");
  const a = forest.roots[0];
  assert.deepEqual(descendantNodes(a).map((node) => node.entry.id), ["b", "c", "d"]);
  assert.equal(rootNodeOf(forest, nodeForQuestion(forest, "c")), a);

  const branches = getAnswerBranches(a, YES_NO);
  assert.deepEqual(branches.map((branch) => [branch.kind, branch.label || null, branch.children.map((child) => child.entry.id)]), [
    ["answer", "Yes", ["b"]],
    ["answer", "No", []],
    ["rule", null, ["d"]],
  ]);
});

test("rules that reveal each other do not loop", () => {
  const entries = [
    { id: "x", questions: [{ id: "x", answerKey: "x" }], conditions: revealedOnYes("y") },
    { id: "y", questions: [{ id: "y", answerKey: "y" }], conditions: revealedOnYes("x") },
  ];
  const forest = buildConditionalForest(entries);
  assert.deepEqual(forest.roots.map((node) => node.entry.id), ["x"]);
  assert.deepEqual(descendantNodes(forest.roots[0]).map((node) => node.entry.id), ["y"]);
});

test("plain answer rules are recognised, other rules are not", () => {
  assert.deepEqual(ruleAnswerValues(revealedOnYes("a")), ["yes"]);
  assert.deepEqual(ruleAnswerValues([{ field: "a", op: "in", value: ["x", "y"] }]), ["x", "y"]);
  assert.deepEqual(ruleAnswerValues([{ field: "a", op: "equals", value: true }]), [true]);
  assert.equal(ruleAnswerValues([{ field: "a", op: "notEquals", value: "yes" }]), null);
  assert.equal(ruleAnswerValues([{ field: "a", op: "exists" }]), null);
  assert.equal(ruleAnswerValues([...revealedOnYes("a"), ...revealedOnYes("b")]), null);
});

test("a single-answer 'is one of' rule shares the answer's branch", () => {
  const node = {
    branches: [
      { id: "1", conditions: revealedOnYes("a"), children: [{ entry: { id: "p" } }] },
      { id: "2", conditions: [{ field: "a", op: "in", value: ["yes"] }], children: [{ entry: { id: "q" } }] },
    ],
  };
  const [yes, no] = getAnswerBranches(node, YES_NO);
  assert.deepEqual(yes.children.map((child) => child.entry.id), ["p", "q"]);
  assert.equal(no.children.length, 0);
});

test("new follow-ups go after their branch, or after everything the trigger reveals", () => {
  const page = otherDetailsPage();
  const forest = buildConditionalForest(getClientQuestionnairePresentation(page).entries);
  const trigger = forest.roots[0];
  const [yes, no] = getAnswerBranches(trigger, YES_NO);
  assert.equal(followUpInsertIndex(page.questions, trigger, yes.children), 2);
  assert.equal(followUpInsertIndex(page.questions, trigger, no.children), 2);

  const lonely = forest.roots[1];
  assert.equal(followUpInsertIndex(page.questions, lonely, []), 4);
});

test("moving a block keeps it together and lands next to the target block", () => {
  const items = ["a", "b1", "b2", "c", "d"].map((id) => ({ id }));
  const ids = (list) => list.map((item) => item.id);
  assert.deepEqual(ids(moveItemBlock(items, ["b1", "b2"], ["d"], 1)), ["a", "c", "d", "b1", "b2"]);
  assert.deepEqual(ids(moveItemBlock(items, ["d"], ["b1", "b2"], -1)), ["a", "d", "b1", "b2", "c"]);
  assert.deepEqual(ids(moveItemBlock(items, ["zz"], ["a"], -1)), ids(items), "nothing to move leaves the list unchanged");
});
