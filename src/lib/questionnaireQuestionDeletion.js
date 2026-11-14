/**
 * Deleting a question from the questionnaire builder.
 *
 * A question is removed from the definition together with its follow-ups (the questions its
 * answers reveal, at any depth), because a follow-up whose trigger is gone would read an
 * answer that no longer exists. Saved client answers are never touched: the client keeps
 * stored keys a page no longer manages (`preserveUnmanagedAnswers`).
 *
 * Other references to the removed answers are handled explicitly:
 * - a display rule on any other question, heading or text that reads a removed answer
 *   **blocks** the deletion (removing the rule would silently change when that item shows);
 * - page prefill rules and repeater table columns for a removed answer are display/default
 *   plumbing only, so they are **cleaned up** and the confirmation says so.
 *
 * Items are a flat ordered list (page `questions`, or a repeater's `metadata.fields`); the
 * follow-up tree comes from questionnaireConditionalBranches.
 */
import { descendantNodes } from "./questionnaireConditionalBranches.js";

function conditionLeaves(conditions) {
  return (Array.isArray(conditions) ? conditions : []).flatMap((condition) =>
    condition?.op === "anyOf" && Array.isArray(condition.value) ? condition.value : [condition]);
}

function readsAnyKey(item, keys) {
  return conditionLeaves(item?.visibleIf).some((condition) => keys.has(condition?.field));
}

/**
 * Items whose display rule reads one of `keys`: legacy nested `followUps`, and repeater popup
 * fields too (a popup field may depend on a page answer, unless a field of the same record
 * has that key, in which case it reads its own record).
 */
function findReferences(items, keys, matches = []) {
  (items || []).forEach((item) => {
    if (readsAnyKey(item, keys)) matches.push(item);
    findReferences(item?.followUps, keys, matches);
    const fields = item?.metadata?.fields;
    if (Array.isArray(fields) && fields.length) {
      const recordKeys = collectAnswerKeys(fields);
      const pageKeys = new Set([...keys].filter((key) => !recordKeys.has(key)));
      if (pageKeys.size) findReferences(fields, pageKeys, matches);
    }
  });
  return matches;
}

function collectAnswerKeys(items, keys = new Set()) {
  (items || []).forEach((item) => {
    if (item?.answerKey) keys.add(item.answerKey);
    collectAnswerKeys(item?.followUps, keys);
  });
  return keys;
}

const labelOf = (item) => item?.label || item?.answerKey || item?.id || "another question";

/**
 * What deleting `node` would do.
 * @param {object} args
 * @param {object[]} args.items      the flat list the node lives in
 * @param {object}   args.node       forest node of the question to delete
 * @param {{label?: string, items: object[]}[]} [args.otherScopes] other lists whose display
 *        rules may read these answers (other pages of the questionnaire)
 * @returns {{ removedIds: string[], removedKeys: string[], followUpLabels: string[],
 *             blockers: string[] }}
 */
export function planQuestionDeletion({ items = [], node, otherScopes = [] }) {
  const removedNodes = node ? [node, ...descendantNodes(node)] : [];
  const removedIds = new Set(removedNodes.flatMap((removed) =>
    (removed.entry?.questions || []).map((question) => question?.id).filter(Boolean)));
  const remaining = items.filter((item) => !removedIds.has(item.id));
  const stillOwned = collectAnswerKeys(remaining);
  const removedKeys = new Set(items
    .filter((item) => removedIds.has(item.id))
    .flatMap((item) => [...collectAnswerKeys([item])])
    .filter((key) => !stillOwned.has(key)));

  const blockers = removedKeys.size ? findReferences(remaining, removedKeys).map(labelOf) : [];
  otherScopes.forEach((scope) => {
    // Another page that asks the same answer itself is reading its own question.
    const owned = collectAnswerKeys(scope.items);
    const keys = new Set([...removedKeys].filter((key) => !owned.has(key)));
    if (!keys.size) return;
    findReferences(scope.items, keys).forEach((item) => {
      blockers.push(scope.label ? `${labelOf(item)} (${scope.label})` : labelOf(item));
    });
  });

  return {
    removedIds: [...removedIds],
    removedKeys: [...removedKeys],
    followUpLabels: removedNodes.slice(1).map((removed) => removed.entry?.label || "Untitled question"),
    blockers: [...new Set(blockers)],
  };
}

/** Plan for a question the follow-up tree does not show (it is deleted on its own). */
export function singleQuestionNode(question) {
  return { entry: { id: question.id, label: question.label, questions: [question] }, parentId: null, branches: [] };
}

/** Page prefill rules that would write an answer the page no longer asks. */
export function prefillRulesFor(page, removedKeys) {
  const keys = new Set(removedKeys);
  return (Array.isArray(page?.metadata?.prefill) ? page.metadata.prefill : [])
    .filter((rule) => keys.has(rule?.answerKey));
}

/** Repeater table columns that show a removed popup field. */
export function columnsFor(repeater, removedKeys) {
  const keys = new Set(removedKeys);
  return (repeater?.metadata?.presentation?.columns || []).filter((column) => keys.has(column?.key));
}

/** The page without the removed questions and without prefill rules for their answers. */
export function removeQuestionsFromPage(page, { removedIds, removedKeys }) {
  const ids = new Set(removedIds);
  const keys = new Set(removedKeys);
  const next = { ...page, questions: (page.questions || []).filter((question) => !ids.has(question.id)) };
  if (Array.isArray(page.metadata?.prefill) && page.metadata.prefill.some((rule) => keys.has(rule?.answerKey))) {
    next.metadata = { ...page.metadata, prefill: page.metadata.prefill.filter((rule) => !keys.has(rule?.answerKey)) };
  }
  return next;
}

/** The repeater without the removed popup fields and without table columns for them. */
export function removeFieldsFromRepeater(repeater, { removedIds, removedKeys }) {
  const ids = new Set(removedIds);
  const keys = new Set(removedKeys);
  const metadata = { ...repeater.metadata, fields: (repeater.metadata?.fields || []).filter((field) => !ids.has(field.id)) };
  const columns = repeater.metadata?.presentation?.columns;
  if (Array.isArray(columns) && columns.some((column) => keys.has(column?.key))) {
    metadata.presentation = { ...repeater.metadata.presentation, columns: columns.filter((column) => !keys.has(column?.key)) };
  }
  return { ...repeater, metadata };
}
