/* Display content items: headings and explanatory text placed between questions.
 *
 * They live in the same ordered `questions` array as questions so the builder and the
 * Client Portal show them in exactly the same position:
 *
 *   { id, type: "heading", label: "Personal Information" }
 *   { id, type: "paragraph", label: "Explanatory text…", visibleIf?: [...] }
 *
 * They never collect answers: no answerKey, required, options, follow-ups or validation,
 * and they do not count as questions. Mirrored in the Client Portal by
 * src/lib/questionnaires/contentItems.js.
 */

// "paragraph" (not "text": that is the short-answer question type).
export const QUESTIONNAIRE_DISPLAY_TYPES = ["heading", "paragraph"];

export const QUESTIONNAIRE_DISPLAY_TYPE_LABELS = {
  heading: "Heading",
  paragraph: "Explanatory text",
};

export function isQuestionnaireDisplayItem(question) {
  return QUESTIONNAIRE_DISPLAY_TYPES.includes(question?.type);
}

/** Questions that collect answers (display items removed). */
export function answerableQuestions(questions = []) {
  return (questions || []).filter((question) => question && !isQuestionnaireDisplayItem(question));
}

function groupOf(question) {
  return isQuestionnaireDisplayItem(question) ? "" : String(question?.metadata?.group || "").trim();
}

function uniqueId(base, usedIds) {
  const safeBase = String(base).replace(/[^A-Za-z0-9_.:-]/g, "-").slice(0, 118).replace(/[^A-Za-z0-9]+$/, "") || "heading";
  let candidate = safeBase;
  for (let suffix = 2; usedIds.has(candidate); suffix += 1) candidate = `${safeBase}-${suffix}`;
  usedIds.add(candidate);
  return candidate;
}

/**
 * Older definitions express a page heading as `metadata.group` repeated on each question
 * of a run. Convert every run into one heading item placed before the run (ids are derived
 * from the run's first question, so repeated conversions agree). Separate runs that share
 * the same text stay separate. If every question in a run has the same display rule, the
 * heading keeps that rule so it disappears with its questions. Returns the input array
 * unchanged when there is nothing to convert.
 */
export function convertGroupHeadingsToContentItems(questions = []) {
  if (!Array.isArray(questions) || !questions.some((question) => groupOf(question))) return questions;
  const usedIds = new Set(questions.map((question) => question?.id).filter(Boolean));
  const output = [];
  let index = 0;
  while (index < questions.length) {
    const question = questions[index];
    const group = groupOf(question);
    if (!group) {
      output.push(question);
      index += 1;
      continue;
    }
    let end = index + 1;
    while (end < questions.length && groupOf(questions[end]) === group) end += 1;
    const run = questions.slice(index, end);

    const ruleSignatures = new Set(run.map((item) => JSON.stringify(item.visibleIf || [])));
    const sharedRule = ruleSignatures.size === 1 && run[0].visibleIf?.length ? run[0].visibleIf : null;
    const previous = output[output.length - 1];
    // A heading item with this text already introduces the run (e.g. merged from a
    // converted baseline): keep it rather than adding a duplicate.
    const alreadyIntroduced = previous?.type === "heading" && String(previous.label || "").trim() === group;
    if (!alreadyIntroduced) output.push({
      id: uniqueId(`${question.id}-heading`, usedIds),
      type: "heading",
      label: group,
      metadata: { originalLabel: group },
      ...(sharedRule ? { visibleIf: JSON.parse(JSON.stringify(sharedRule)) } : {}),
    });
    run.forEach((item) => {
      const { group: _removed, ...metadata } = item.metadata || {};
      const next = { ...item, metadata };
      if (Object.keys(metadata).length === 0) delete next.metadata;
      output.push(next);
    });
    index = end;
  }
  return output;
}

/** Page-level conversion for pages the builder fully controls (never legacy pages). */
export function convertPageGroupHeadings(page) {
  if (!page || page.metadata?.renderer === "legacy") return page;
  const questions = convertGroupHeadingsToContentItems(page.questions);
  return questions === page.questions ? page : { ...page, questions };
}
