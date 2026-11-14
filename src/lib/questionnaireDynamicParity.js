/* Dynamic-renderer parity layer (visa-neutral).
 *
 * Built-in pages start as `metadata.renderer: "legacy"`: the Client Portal renders its
 * hand-written React page and only swaps wording. A page is promoted to the dynamic
 * renderer (the Client Portal builds it entirely from this JSON, so structural builder
 * edits take effect) once its route is listed as certified for a visa audience.
 *
 * Certification means the Client Portal parity suite passes for that route:
 *   plylegal-client-portal/e2e/questionnaire-dynamic-parity.spec.js
 * (legacy-saved answers survive a dynamic save unchanged; defaults/prefills match).
 *
 * Per-route parity rules capture behaviour that lived in hand-written page code:
 *   prefill       → page.metadata.prefill (values copied from the applicant profile, etc.)
 *   defaults      → { answerKey: value } top-level question defaultValue
 *   fieldDefaults → { repeaterAnswerKey: { fieldAnswerKey: value } } popup field defaults
 *   fieldGroups   → { repeaterAnswerKey: { fieldAnswerKey: "Heading" } } popup section
 *                   headings; the heading applies from that field until the next one
 *   placeholders  → { answerKey: "text" } (top-level or "repeater.field")
 *   order         → [answerKey] top-level display order of those questions (legacy layout)
 *   patches       → { answerKey | "repeater.field": { ...question properties } } deep-merged
 *                   (e.g. clearWhenHidden, optionsSource, metadata.presentation.layout)
 *   visibleIf     → { answerKey | "repeater.field": [conditions] } display rules the legacy
 *                   page computed in JSX (may use { op: "anyOf", value: [conditions] })
 *   dateFormats   → { answerKey | "repeater.field": { day: "padded"|"number", month: "name"|"number" } }
 *                   stored date-part format of the legacy page (metadata.dateFormat)
 *   pageMetadata  → merged into page.metadata (e.g. answerLayout: "childCustody" storage adapter)
 *   hidden        → [answerKey] values kept in storage but not shown (metadata.storageOnly)
 */

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function patchByAnswerKey(questions = [], answerKey, patch) {
  return questions.map((question) => {
    let next = question;
    if (question.answerKey === answerKey) next = patch(question);
    if (next.followUps?.length) next = { ...next, followUps: patchByAnswerKey(next.followUps, answerKey, patch) };
    return next;
  });
}

function patchRepeaterFields(questions, repeaterKey, patchFields) {
  return patchByAnswerKey(questions, repeaterKey, (question) => ({
    ...question,
    metadata: { ...question.metadata, fields: patchFields(question.metadata?.fields || []) },
  }));
}

/** Put the listed top-level questions in the given order, within the slots they occupy. */
function reorderQuestions(questions, order) {
  const slots = [];
  questions.forEach((question, index) => { if (order.includes(question.answerKey)) slots.push(index); });
  const ordered = order.map((key) => questions.find((question) => question.answerKey === key)).filter(Boolean);
  const next = [...questions];
  slots.forEach((slot, index) => { next[slot] = ordered[index]; });
  return next;
}

function deepMerge(target, patch) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return cloneJson(patch);
  const output = { ...(target && typeof target === "object" && !Array.isArray(target) ? target : {}) };
  for (const [key, value] of Object.entries(patch)) {
    output[key] = value && typeof value === "object" && !Array.isArray(value) ? deepMerge(output[key], value) : cloneJson(value);
  }
  return output;
}

function mapDateParts(questions = [], patch) {
  return questions.map((question) => {
    let next = question.type === "dateParts" ? patch(question) : question;
    if (next.followUps?.length) next = { ...next, followUps: mapDateParts(next.followUps, patch) };
    if (next.metadata?.fields?.length) next = { ...next, metadata: { ...next.metadata, fields: mapDateParts(next.metadata.fields, patch) } };
    return next;
  });
}

function applyFieldGroups(fields, headings) {
  let current = null;
  return fields.map((field) => {
    if (Object.hasOwn(headings, field.answerKey)) current = headings[field.answerKey];
    if (!current) return field;
    return { ...field, metadata: { ...field.metadata, group: current } };
  });
}

/** Patch a top-level question ("key") or a popup field ("repeaterKey.fieldKey"). */
function patchPath(questions, path, patch) {
  const [first, second] = path.split(".");
  if (!second) return patchByAnswerKey(questions, first, patch);
  return patchRepeaterFields(questions, first, (fields) => patchByAnswerKey(fields, second, patch));
}

function applyPlaceholder(questions, path, text) {
  return patchPath(questions, path, (question) => ({ ...question, placeholder: text }));
}

export function applyPageParityRules(page, rules = {}) {
  let questions = cloneJson(page.questions || []);
  for (const [answerKey, value] of Object.entries(rules.defaults || {})) {
    questions = patchByAnswerKey(questions, answerKey, (question) => ({ ...question, defaultValue: cloneJson(value) }));
  }
  for (const [repeaterKey, defaults] of Object.entries(rules.fieldDefaults || {})) {
    questions = patchRepeaterFields(questions, repeaterKey, (fields) => Object.entries(defaults).reduce(
      (current, [fieldKey, value]) => patchByAnswerKey(current, fieldKey, (field) => ({ ...field, defaultValue: cloneJson(value) })),
      fields,
    ));
  }
  for (const [repeaterKey, headings] of Object.entries(rules.fieldGroups || {})) {
    questions = patchRepeaterFields(questions, repeaterKey, (fields) => applyFieldGroups(fields, headings));
  }
  for (const [path, text] of Object.entries(rules.placeholders || {})) {
    questions = applyPlaceholder(questions, path, text);
  }
  if (rules.order?.length) questions = reorderQuestions(questions, rules.order);
  for (const [path, patch] of Object.entries(rules.patches || {})) {
    questions = patchPath(questions, path, (question) => {
      const next = deepMerge(question, patch);
      // Parity rules describe the original client copy, not an administrator edit, so
      // keep the legacy wording layer's "original" baseline in step.
      for (const [field, originalField] of [["label", "originalLabel"], ["description", "originalDescription"], ["placeholder", "originalPlaceholder"]]) {
        if (Object.hasOwn(patch, field)) next.metadata = { ...next.metadata, [originalField]: patch[field] };
      }
      return next;
    });
  }
  for (const [path, visibleIf] of Object.entries(rules.visibleIf || {})) {
    questions = patchPath(questions, path, (question) => ({ ...question, visibleIf: cloneJson(visibleIf) }));
  }
  const withDateFormat = (question, dateFormat) => {
    const next = { ...question, metadata: { ...question.metadata, dateFormat: cloneJson(dateFormat) } };
    // An explicit month format replaces extracted month options so storage matches the legacy page.
    if (dateFormat.month) delete next.monthOptions;
    return next;
  };
  for (const [path, dateFormat] of Object.entries(rules.dateFormats || {})) {
    questions = path === "*"
      ? mapDateParts(questions, (question) => withDateFormat(question, { ...dateFormat, ...(question.metadata?.dateFormat || {}) }))
      : patchPath(questions, path, (question) => withDateFormat(question, dateFormat));
  }
  for (const answerKey of rules.hidden || []) {
    questions = patchByAnswerKey(questions, answerKey, (question) => ({ ...question, metadata: { ...question.metadata, storageOnly: true } }));
  }
  const metadata = { ...page.metadata };
  if (rules.prefill?.length) metadata.prefill = cloneJson(rules.prefill);
  if (rules.pageMetadata) Object.assign(metadata, cloneJson(rules.pageMetadata));
  return { ...page, questions, metadata };
}

/** Promote certified routes to the dynamic renderer. Uncertified pages stay legacy. */
export function certifyDynamicPages(pages, certifiedRoutes = []) {
  const certified = new Set(certifiedRoutes);
  return pages.map((page) => {
    if (!certified.has(page.route) || page.metadata?.renderer !== "legacy") return page;
    const { renderer, ...metadata } = page.metadata;
    return { ...page, metadata: { ...metadata, dynamicParity: "certified" } };
  });
}

export function applyDynamicParity(pages, { rulesByRoute = {}, certifiedRoutes = [] } = {}) {
  return certifyDynamicPages(
    pages.map((page) => (rulesByRoute[page.route] ? applyPageParityRules(page, rulesByRoute[page.route]) : page)),
    certifiedRoutes,
  );
}

/** True when a built-in page has been promoted from the legacy renderer. */
export function isDynamicCertifiedPage(page) {
  return page?.metadata?.dynamicParity === "certified" && page?.metadata?.renderer !== "legacy";
}
