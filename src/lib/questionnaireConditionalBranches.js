/**
 * Follow-up ("conditional") questions for the questionnaire builder.
 *
 * A follow-up is an ordinary question with a `visibleIf` rule on another answer: page
 * questions depend on page answers, and record fields (the repeater Add/Edit popup) depend
 * on fields of the same record. The client renders both as flat ordered lists and hides
 * whatever is not revealed, so the definition never stores a tree.
 *
 * These helpers build that tree for the builder — trigger → one branch per display rule →
 * follow-ups, which may be triggers themselves — and work out where new or moved follow-ups
 * go so they stay directly after the question that reveals them.
 *
 * Input is the ordered list of logical entries from questionnaireClientPresentation
 * (`{ id, questions, conditions }`), so split day/month/year dates count as one entry.
 */

export function entryAnswerKeys(entry) {
  return new Set((entry?.questions || []).map((question) => question?.answerKey).filter(Boolean));
}

function conditionsSignature(conditions = []) {
  return JSON.stringify(conditions.map(({ field, op = "equals", value }) => ({ field, op, value })));
}

/**
 * The answers a plain "answer is X" / "answer is one of X, Y" rule reveals on, or null when
 * the rule is anything else (does not equal, has an answer, several rules together…).
 */
export function ruleAnswerValues(conditions = []) {
  if (conditions.length !== 1) return null;
  const [condition] = conditions;
  const op = condition?.op || "equals";
  if (op === "equals" && condition.value !== undefined && !Array.isArray(condition.value)) return [condition.value];
  if (op === "in" && Array.isArray(condition.value) && condition.value.length) return condition.value;
  return null;
}

/**
 * Follow-up tree for an ordered list of entries.
 * Each entry's parent is the entry that owns the answer its first rule reads (the nearest
 * earlier one, else a later one); entries without a parent on this list are roots.
 * Nodes: `{ entry, parentId, branches: [{ id, conditions, children: [node] }] }`, children in list order.
 */
export function buildConditionalForest(entries = []) {
  const parentById = new Map();
  entries.forEach((entry, index) => {
    const field = entry?.conditions?.[0]?.field;
    if (!field) return;
    let controller = null;
    for (let candidateIndex = index - 1; candidateIndex >= 0 && !controller; candidateIndex -= 1) {
      if (entryAnswerKeys(entries[candidateIndex]).has(field)) controller = entries[candidateIndex];
    }
    controller ||= entries.find((candidate, candidateIndex) => candidateIndex > index && entryAnswerKeys(candidate).has(field));
    if (controller && controller.id !== entry.id) parentById.set(entry.id, controller.id);
  });

  // Rules that reveal each other in a loop: the first entry of the loop becomes a root.
  entries.forEach((entry) => {
    const seen = new Set([entry.id]);
    let current = parentById.get(entry.id);
    while (current) {
      if (seen.has(current)) {
        parentById.delete(entry.id);
        break;
      }
      seen.add(current);
      current = parentById.get(current);
    }
  });

  const nodeById = new Map(entries.map((entry) => [
    entry.id,
    { entry, parentId: parentById.get(entry.id) || null, branches: [] },
  ]));
  const roots = [];
  entries.forEach((entry) => {
    const node = nodeById.get(entry.id);
    if (!node.parentId) {
      roots.push(node);
      return;
    }
    const parent = nodeById.get(node.parentId);
    const id = conditionsSignature(entry.conditions);
    let branch = parent.branches.find((candidate) => candidate.id === id);
    if (!branch) {
      branch = { id, conditions: entry.conditions, children: [] };
      parent.branches.push(branch);
    }
    branch.children.push(node);
  });
  return { roots, nodeById };
}

/** The node whose entry contains this question id (date parts share one node). */
export function nodeForQuestion(forest, questionId) {
  for (const node of forest?.nodeById?.values?.() || []) {
    if (node.entry.questions?.some((question) => question?.id === questionId)) return node;
  }
  return null;
}

export function rootNodeOf(forest, node) {
  let current = node || null;
  while (current?.parentId) {
    const parent = forest.nodeById.get(current.parentId);
    if (!parent) break;
    current = parent;
  }
  return current;
}

/** Ids of the node's own questions and of every follow-up beneath it. */
export function nodeQuestionIds(node) {
  if (!node) return [];
  return [
    ...(node.entry.questions || []).map((question) => question?.id).filter(Boolean),
    ...node.branches.flatMap((branch) => branch.children.flatMap(nodeQuestionIds)),
  ];
}

/** Every follow-up beneath a node, depth first. */
export function descendantNodes(node) {
  return (node?.branches || []).flatMap((branch) =>
    branch.children.flatMap((child) => [child, ...descendantNodes(child)]));
}

/** The branch a node sits in under its parent, with its position among that branch's follow-ups. */
export function nodeBranchPosition(forest, node) {
  const parent = node?.parentId ? forest.nodeById.get(node.parentId) : null;
  if (!parent) return null;
  for (const branch of parent.branches) {
    const index = branch.children.indexOf(node);
    if (index >= 0) return { parent, branch, index, siblings: branch.children };
  }
  return null;
}

/**
 * The branches to show under a trigger: one per answer choice, in choice order (empty ones
 * included so follow-ups can be added there), then one per rule that is not a single answer.
 * `choices` = `[{ value, label }]`; values compare strictly (checkbox answers are booleans).
 */
export function getAnswerBranches(node, choices = []) {
  const used = new Set();
  const answerBranches = choices.map((choice) => {
    const matching = (node?.branches || []).filter((branch) => {
      const values = ruleAnswerValues(branch.conditions);
      return values?.length === 1 && values[0] === choice.value;
    });
    matching.forEach((branch) => used.add(branch.id));
    return {
      id: matching[0]?.id || `answer:${JSON.stringify(choice.value)}`,
      kind: "answer",
      value: choice.value,
      label: choice.label,
      conditions: matching[0]?.conditions || null,
      children: matching.flatMap((branch) => branch.children),
    };
  });
  const ruleBranches = (node?.branches || [])
    .filter((branch) => !used.has(branch.id))
    .map((branch) => ({ ...branch, kind: "rule", value: undefined, label: "" }));
  return [...answerBranches, ...ruleBranches];
}

/** Position in `items` just after the last of `ids`, or `fallbackIndex` when none is present. */
export function indexAfter(items = [], ids = [], fallbackIndex = items.length) {
  const wanted = new Set(ids);
  let last = -1;
  items.forEach((item, index) => {
    if (wanted.has(item?.id)) last = index;
  });
  return last >= 0 ? last + 1 : fallbackIndex;
}

/**
 * Where a new follow-up for one of a trigger's branches goes: after that branch's existing
 * follow-ups, or — for an empty branch — after everything the trigger already reveals.
 */
export function followUpInsertIndex(items, node, branchChildren = []) {
  return branchChildren.length
    ? indexAfter(items, branchChildren.flatMap(nodeQuestionIds))
    : indexAfter(items, nodeQuestionIds(node));
}

/**
 * Moves the items in `blockIds` (kept in their order) to just before the first of
 * `targetIds` (direction < 0) or just after the last of them (direction > 0).
 */
export function moveItemBlock(items = [], blockIds = [], targetIds = [], direction = 1) {
  const block = new Set(blockIds);
  const moving = items.filter((item) => block.has(item?.id));
  const rest = items.filter((item) => !block.has(item?.id));
  const targets = new Set(targetIds);
  const targetIndexes = rest.flatMap((item, index) => (targets.has(item?.id) ? [index] : []));
  if (!moving.length || !targetIndexes.length) return items;
  const at = direction < 0 ? targetIndexes[0] : targetIndexes.at(-1) + 1;
  return [...rest.slice(0, at), ...moving, ...rest.slice(at)];
}
