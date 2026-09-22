const LOWER_YES_NO = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
];
const TITLE_YES_NO = [
  { value: "Yes", label: "Yes" },
  { value: "No", label: "No" },
];

// These rules mirror explicit cross-field Zod refinements or submit checks in
// the shipped client forms. Arbitrary refine callbacks cannot be inferred
// safely from syntax, so keep this list limited to exact, reviewed paths.
const CONDITIONAL_RULES = [
  {
    route: "/intake/temporary-work/all-applicants/travel-history",
    target: "travel_history",
    source: "has_travel_history",
    value: "yes",
    required: true,
    sourceControl: { type: "yesNo", options: LOWER_YES_NO },
  },
  {
    route: "/intake/partner/all-applicants/travel-history",
    target: "travel_history",
    source: "has_travel_history",
    value: "yes",
    required: false,
    sourceControl: { type: "yesNo", options: LOWER_YES_NO },
  },
  {
    route: "/intake/partner/main-applicant/education",
    target: "education_history",
    source: "has_secondary_education",
    value: "yes",
    required: true,
  },
  {
    route: "/intake/partner/main-applicant/family",
    target: "children",
    source: "has_children",
    value: "Yes",
    required: true,
    sourceControl: { type: "radio", options: TITLE_YES_NO },
  },
  {
    route: "/intake/partner/all-applicants/future-travel",
    target: "future_travel",
    source: "has_future_travel",
    value: "Yes",
    required: true,
  },
  {
    route: "/intake/partner/family-sponsor/previous-sponsorship",
    target: "previous_sponsorships",
    source: "has_previous_sponsorship",
    value: "Yes",
    required: true,
  },
  {
    route: "/intake/partner/family-sponsor/travel",
    target: "travel_history",
    source: "has_travel_history",
    value: "Yes",
    required: true,
  },
];

function updateQuestion(questions = [], answerKey, update) {
  return questions.map((question) => {
    let next = question.answerKey === answerKey ? update(question) : question;
    const fields = next.metadata?.fields?.length
      ? updateQuestion(next.metadata.fields, answerKey, update)
      : next.metadata?.fields;
    const followUps = next.followUps?.length
      ? updateQuestion(next.followUps, answerKey, update)
      : next.followUps;
    if (fields !== next.metadata?.fields) next = { ...next, metadata: { ...next.metadata, fields } };
    if (followUps !== next.followUps) next = { ...next, followUps };
    return next;
  });
}

function applySourceControl(question, control) {
  if (!control) return question;
  const options = control.options.map((option) => ({ ...option }));
  return {
    ...question,
    type: control.type,
    options,
    metadata: {
      ...question.metadata,
      originalOptions: options.map((option) => ({ ...option })),
    },
  };
}

/** Preserve reviewed conditional requirements which live in Zod refine callbacks. */
export function applyQuestionnaireBuiltInConditionalRules(pages = []) {
  return pages.map((page) => {
    let questions = page.questions;
    for (const rule of CONDITIONAL_RULES.filter((candidate) => candidate.route === page.route)) {
      questions = updateQuestion(questions, rule.source, (question) => applySourceControl(question, rule.sourceControl));
      questions = updateQuestion(questions, rule.target, (question) => ({
        ...question,
        required: rule.required,
        visibleIf: [{ field: rule.source, op: "equals", value: rule.value }],
      }));
    }

    if (page.route === "/intake/protection/all-applicants/travel-history") {
      questions = updateQuestion(questions, "main_applicant_travel_history", (question) => ({ ...question, required: true }));
      questions = updateQuestion(questions, "arrival_city", (question) => ({ ...question, required: true }));
    }

    return questions === page.questions ? page : { ...page, questions };
  });
}
