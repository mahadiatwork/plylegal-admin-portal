import assert from "node:assert/strict";
import test from "node:test";
import {
  QUESTIONNAIRE_DEFINITION_LIMITS,
  QuestionnaireDefinitionValidationError,
  assertQuestionnaireDefinitionStructureEditable,
  generateQuestionnaireDefinitionId,
  getQuestionnaireDefinitionIssues,
  isSafeQuestionnaireDefinitionId,
  mergeQuestionnaireDefinition,
  normalizeQuestionnaireDefinition,
  serializeQuestionnaireDefinitionDoc,
  visaContextsOverlap,
} from "./questionnaireDefinitions.js";
import { getRegisteredQuestionnaireRoutes } from "./routes.js";

function validDefinition(overrides = {}) {
  return {
    id: "temporary-work-482-v1",
    visaType: "temporary-work",
    visaContext: "482",
    title: "Skills in Demand Visa Questionnaire",
    version: "1.0.0",
    status: "active",
    pages: [
      {
        id: "all-applicants-character",
        route: "/intake/temporary-work/all-applicants/character",
        title: "Character",
        sectionKey: "temporary_work_character",
        completionKey: "temporary-work/all-applicants/character",
        scope: "shared",
        order: 140,
        introBlocks: [
          { type: "paragraph", text: "Answer every declaration." },
          { type: "list", lead: "Provide:", items: ["Relevant details"] },
        ],
        questions: [
          {
            id: "char_q01",
            answerKey: "char_q01",
            label: "Has any applicant ever been charged?",
            type: "yesNo",
            required: true,
            options: [
              { value: "yes", label: "Yes" },
              { value: "no", label: "No" },
            ],
            followUps: [
              {
                id: "char_q01_details",
                answerKey: "char_q01_details",
                label: "Give details",
                type: "textarea",
                rows: 4,
                visibleIf: [{ field: "char_q01", op: "equals", value: "yes" }],
              },
            ],
          },
        ],
      },
    ],
    ...overrides,
  };
}

test("publishable route registry exposes reachable questionnaire slots", () => {
  const globalTemporaryWorkRoutes = getRegisteredQuestionnaireRoutes("temporary-work", [])
    .map((route) => route.href);
  const subclass482Routes = getRegisteredQuestionnaireRoutes("temporary-work", ["482"])
    .map((route) => route.href);
  const partnerRoutes = getRegisteredQuestionnaireRoutes("partner", [])
    .map((route) => route.href);

  assert.ok(globalTemporaryWorkRoutes.includes("/intake/temporary-work/spouse-partner/education"));
  assert.equal(subclass482Routes.includes("/intake/temporary-work/spouse-partner/education"), false);
  assert.ok(partnerRoutes.includes("/intake/partner/all-applicants/character"));
  assert.equal(partnerRoutes.includes("/intake/partner/start"), false);
  assert.equal(partnerRoutes.includes("/intake/partner/children/start"), false);
  assert.equal(partnerRoutes.includes("/intake/partner/family"), false);
});

test("normalizes the client schema and legacy singular visaContext", () => {
  const normalized = normalizeQuestionnaireDefinition(validDefinition());
  assert.deepEqual(normalized.visaContexts, ["482"]);
  assert.equal(normalized.visaContext, "482");
  assert.equal(normalized.schemaVersion, 1);
  assert.equal(normalized.revision, 0);
  assert.equal(normalized.pages[0].questions[0].followUps[0].type, "textarea");
});

test("supports multiple visa contexts without emitting an ambiguous singular field", () => {
  const input = validDefinition({ visaContexts: ["482", "186"] });
  delete input.visaContext;
  const normalized = normalizeQuestionnaireDefinition(input);
  assert.deepEqual(normalized.visaContexts, ["482", "186"]);
  assert.equal(Object.hasOwn(normalized, "visaContext"), false);
  assert.equal(visaContextsOverlap(normalized, { visaContexts: ["186"] }), true);
  assert.equal(visaContextsOverlap(normalized, { visaContexts: ["494"] }), false);
  assert.equal(visaContextsOverlap(normalized, { visaContexts: [] }), true);
});

test("generates safe deterministic Firestore document IDs", () => {
  const id = generateQuestionnaireDefinitionId({
    visaType: "Temporary Work",
    visaContexts: ["482"],
    version: "1.0.0",
  });
  assert.equal(id, "temporary-work-482-v1-0-0");
  assert.equal(isSafeQuestionnaireDefinitionId(id), true);
  assert.equal(isSafeQuestionnaireDefinitionId("../unsafe"), false);
  assert.equal(isSafeQuestionnaireDefinitionId("contains/slash"), false);
});

test("rejects unsafe routes and unsupported fields", () => {
  const input = validDefinition();
  input.pages[0].route = "/intake/temporary-work/../admin";
  input.pages[0].questions[0].typo = true;
  const issues = getQuestionnaireDefinitionIssues(input);
  assert.ok(issues.some((issue) => issue.includes("unsafe path sequence")));
  assert.ok(issues.some((issue) => issue.includes("typo is not supported")));
});

test("enforces unique page routes, global question IDs, and scoped answer keys", () => {
  const input = validDefinition();
  input.pages.push({
    ...structuredClone(input.pages[0]),
    id: "another-page",
    title: "Another page",
  });
  const issues = getQuestionnaireDefinitionIssues(input);
  assert.ok(issues.some((issue) => issue.includes("route") && issue.includes("duplicated")));
  assert.ok(issues.some((issue) => issue.includes("char_q01") && issue.includes("duplicated")));
});

test("allows an answer key to repeat in a different scope and section", () => {
  const input = validDefinition();
  const repeated = structuredClone(input.pages[0]);
  repeated.id = "main-applicant-details";
  repeated.route = "/intake/temporary-work/main-applicant/details";
  repeated.completionKey = "temporary-work/main-applicant/details";
  repeated.title = "Details";
  repeated.scope = "profile";
  repeated.sectionKey = "details";
  repeated.questions[0].id = "main_family_name";
  repeated.questions[0].answerKey = "char_q01";
  repeated.questions[0].followUps[0].id = "main_family_name_details";
  repeated.questions[0].followUps[0].answerKey = "char_q01_details";
  input.pages.push(repeated);
  assert.deepEqual(getQuestionnaireDefinitionIssues(input), []);
});

test("reserves generated date-part keys in the page storage namespace", () => {
  const input = validDefinition();
  input.pages[0].questions.push(
    {
      id: "birth-date",
      answerKey: "birth_date",
      label: "Date of birth",
      type: "dateParts",
    },
    {
      id: "birth-date-day-shadow",
      answerKey: "birth_date_day",
      label: "Day repeated as a standalone answer",
      type: "text",
    }
  );

  const issues = getQuestionnaireDefinitionIssues(input);
  assert.ok(
    issues.some(
      (issue) => issue.includes('storage key "birth_date_day"') && issue.includes("duplicated")
    )
  );
});

test("reserves explicit date-part keys against answer keys and sibling parts", () => {
  const input = validDefinition();
  input.pages[0].questions.push({
    id: "birth-date",
    answerKey: "birth_date",
    label: "Date of birth",
    type: "dateParts",
    parts: {
      day: "char_q01_details",
      month: "birth_date_month",
      year: "birth_date_month",
    },
  });

  const issues = getQuestionnaireDefinitionIssues(input);
  assert.ok(
    issues.some(
      (issue) => issue.includes('storage key "char_q01_details"') && issue.includes("duplicated")
    )
  );
  assert.ok(
    issues.some(
      (issue) => issue.includes('storage key "birth_date_month"') && issue.includes("duplicated")
    )
  );
});

test("validates option values, conditions, and follow-up depth", () => {
  const input = validDefinition({ status: "draft" });
  const question = input.pages[0].questions[0];
  question.options.push({ value: "yes", label: "Certainly" });
  question.visibleIf = Array.from({ length: QUESTIONNAIRE_DEFINITION_LIMITS.maxConditionsPerQuestion + 1 }, () => ({
    field: "char_q01",
    op: "equals",
    value: "yes",
  }));
  let cursor = question;
  for (let depth = 0; depth < QUESTIONNAIRE_DEFINITION_LIMITS.maxQuestionDepth; depth += 1) {
    const child = {
      id: `nested_${depth}`,
      answerKey: `nested_${depth}`,
      label: `Nested ${depth}`,
      type: "text",
    };
    cursor.followUps = [child];
    cursor = child;
  }
  const issues = getQuestionnaireDefinitionIssues(input);
  assert.ok(issues.some((issue) => issue.includes("option") && issue.includes("duplicated")));
  assert.ok(issues.some((issue) => issue.includes("more than 50 conditions")));
  assert.ok(issues.some((issue) => issue.includes("maximum follow-up depth")));
});

test("rejects definitions above the conservative Firestore document size", () => {
  const input = validDefinition({ status: "draft" });
  input.pages[0].questions[0].metadata = {
    large: "x".repeat(QUESTIONNAIRE_DEFINITION_LIMITS.maxBytes),
  };
  const issues = getQuestionnaireDefinitionIssues(input);
  assert.ok(issues.some((issue) => issue.includes("maximum is")));
});

test("patch merging accepts legacy visaContext and keeps IDs immutable", () => {
  const current = normalizeQuestionnaireDefinition(validDefinition());
  const updated = mergeQuestionnaireDefinition(current, {
    visaContext: "186",
    title: "Employer Nomination Questionnaire",
    revision: 0,
  });
  assert.deepEqual(updated.visaContexts, ["186"]);
  assert.equal(updated.visaContext, "186");
  assert.equal(updated.title, "Employer Nomination Questionnaire");
  assert.throws(
    () => mergeQuestionnaireDefinition(current, { id: "another-id" }),
    QuestionnaireDefinitionValidationError
  );
});

test("serializes Firestore timestamps and legacy page documents", () => {
  const serialized = serializeQuestionnaireDefinitionDoc(
    {
      id: "legacy-definition",
      data: () => ({
        visaType: "temporary-work",
        visaContext: "482",
        updatedAt: { toDate: () => new Date("2026-01-02T03:04:05.000Z") },
      }),
    },
    [
      { id: "second", order: 20, title: "Second" },
      { id: "first", order: 10, title: "First" },
    ]
  );
  assert.equal(serialized.updatedAt, "2026-01-02T03:04:05.000Z");
  assert.deepEqual(serialized.visaContexts, ["482"]);
  assert.deepEqual(serialized.pages.map((page) => page.id), ["first", "second"]);
  assert.equal(serialized.revision, 0);
});

test("reserves workflow screens and canonicalizes completion keys from routes", () => {
  const reserved = validDefinition();
  reserved.pages[0].route = "/intake/temporary-work/submit";
  reserved.pages[0].completionKey = "temporary-work/submit";
  assert.ok(getQuestionnaireDefinitionIssues(reserved).some((issue) => issue.includes("reserved")));

  const withoutCompletionKey = validDefinition();
  delete withoutCompletionKey.pages[0].completionKey;
  const normalized = normalizeQuestionnaireDefinition(withoutCompletionKey);
  assert.equal(normalized.pages[0].completionKey, "temporary-work/all-applicants/character");

  const mismatched = validDefinition();
  mismatched.pages[0].completionKey = "temporary-work/another-page";
  assert.ok(getQuestionnaireDefinitionIssues(mismatched).some((issue) => issue.includes("must match its client route")));
});

test("rejects unsafe storage paths and malformed yes/no choices", () => {
  const unsafe = validDefinition();
  unsafe.pages[0].sectionKey = "constructor.prototype.polluted";
  unsafe.pages[0].questions[0].answerKey = "nested.answer";
  const unsafeIssues = getQuestionnaireDefinitionIssues(unsafe);
  assert.ok(unsafeIssues.some((issue) => issue.includes("sectionKey")));
  assert.ok(unsafeIssues.some((issue) => issue.includes("answerKey")));

  const malformed = validDefinition();
  malformed.pages[0].questions[0].options = [];
  assert.ok(getQuestionnaireDefinitionIssues(malformed).some((issue) => issue.includes("exactly the values")));
});

test("visa contexts are limited to the subclassed temporary-work flow", () => {
  const partner = validDefinition({ visaType: "partner", visaContexts: ["482"] });
  delete partner.visaContext;
  assert.ok(getQuestionnaireDefinitionIssues(partner).some((issue) => issue.includes("only supported")));
});

test("temporary-work visa contexts are limited to supported client audiences", () => {
  const unsupported = validDefinition({ visaContexts: ["494"] });
  delete unsupported.visaContext;
  assert.ok(
    getQuestionnaireDefinitionIssues(unsupported).some((issue) =>
      issue.includes('definition.visaContexts[0] must be "482" or "186"')
    )
  );

  for (const visaContexts of [[], ["482"], ["186"], ["482", "186"]]) {
    const supported = validDefinition({ visaContexts });
    delete supported.visaContext;
    assert.deepEqual(getQuestionnaireDefinitionIssues(supported), []);
  }
});

test("live definitions allow copy edits but reject structural edits until a draft is saved", () => {
  const current = normalizeQuestionnaireDefinition(validDefinition());
  const copyEdit = structuredClone(current);
  copyEdit.title = "Updated questionnaire title";
  copyEdit.version = "1.0.1";
  copyEdit.pages[0].title = "Updated page title";
  copyEdit.pages[0].introBlocks[0].text = "Updated introduction.";
  copyEdit.pages[0].questions[0].label = "Updated question wording?";
  copyEdit.pages[0].questions[0].options[0].label = "Absolutely";
  copyEdit.pages[0].questions[0].followUps[0].placeholder = "Tell us more";
  assert.doesNotThrow(() =>
    assertQuestionnaireDefinitionStructureEditable(current, copyEdit, { id: current.id })
  );

  const structuralEdits = [
    (definition) => {
      definition.pages[0].route = "/intake/temporary-work/all-applicants/health";
      definition.pages[0].completionKey = "temporary-work/all-applicants/health";
    },
    (definition) => {
      definition.pages[0].questions[0].answerKey = "renamed_answer";
      definition.pages[0].questions[0].followUps[0].visibleIf[0].field = "renamed_answer";
    },
    (definition) => { definition.pages[0].questions[0].required = false; },
    (definition) => { definition.pages[0].questions[0].options.reverse(); },
    (definition) => { definition.pages[0].questions.push({
      id: "new_question",
      answerKey: "new_question",
      label: "New question",
      type: "text",
    }); },
  ];

  structuralEdits.forEach((edit) => {
    const changed = structuredClone(current);
    changed.status = "draft";
    edit(changed);
    assert.throws(
      () => assertQuestionnaireDefinitionStructureEditable(current, changed, { id: current.id }),
      /move the definition to draft/i
    );
  });

  const savedDraft = structuredClone(current);
  savedDraft.status = "draft";
  assert.doesNotThrow(() =>
    assertQuestionnaireDefinitionStructureEditable(current, savedDraft, { id: current.id })
  );
  const editedDraft = structuredClone(savedDraft);
  editedDraft.pages[0].questions[0].answerKey = "renamed_answer";
  editedDraft.pages[0].questions[0].followUps[0].visibleIf[0].field = "renamed_answer";
  assert.doesNotThrow(() =>
    assertQuestionnaireDefinitionStructureEditable(savedDraft, editedDraft, { id: current.id })
  );
});

test("conditional questions require a source answer key on the same page", () => {
  const input = validDefinition({ status: "draft" });
  input.pages.push({
    id: "all-applicants-health",
    route: "/intake/temporary-work/all-applicants/health",
    title: "Health",
    sectionKey: "temporary_work_health",
    completionKey: "temporary-work/all-applicants/health",
    scope: "shared",
    order: 150,
    questions: [
      {
        id: "cross_page_details",
        answerKey: "cross_page_details",
        label: "Give details",
        type: "textarea",
        visibleIf: [{ field: "char_q01", op: "equals", value: "yes" }],
      },
    ],
  });

  const issues = getQuestionnaireDefinitionIssues(input);
  assert.ok(
    issues.some(
      (issue) => issue.includes('field "char_q01"') && issue.includes("same page")
    )
  );
});

test("conditional questions reject self references and dependency cycles", () => {
  const selfReference = validDefinition({ status: "draft" });
  selfReference.pages[0].questions[0].visibleIf = [
    { field: "char_q01", op: "equals", value: "yes" },
  ];
  assert.ok(
    getQuestionnaireDefinitionIssues(selfReference).some((issue) =>
      issue.includes("cannot reference its own question")
    )
  );

  const cycle = validDefinition({ status: "draft" });
  cycle.pages[0].questions = [
    {
      id: "first",
      answerKey: "first",
      label: "First",
      type: "text",
      visibleIf: [{ field: "second", op: "equals", value: "yes" }],
    },
    {
      id: "second",
      answerKey: "second",
      label: "Second",
      type: "text",
      visibleIf: [{ field: "first", op: "equals", value: "yes" }],
    },
  ];
  assert.ok(
    getQuestionnaireDefinitionIssues(cycle).some((issue) =>
      issue.includes("conditional dependency cycle")
    )
  );
});

test("condition values must exist in static source options", () => {
  const invalidCases = [
    { op: "equals", value: "maybe" },
    { op: "notEquals", value: "maybe" },
    { op: "in", value: ["yes", "maybe"] },
    { op: "notIn", value: ["no", "maybe"] },
  ];

  invalidCases.forEach((condition) => {
    const input = validDefinition({ status: "draft" });
    input.pages[0].questions[0].followUps[0].visibleIf = [
      { field: "char_q01", ...condition },
    ];
    assert.ok(
      getQuestionnaireDefinitionIssues(input).some(
        (issue) => issue.includes('"maybe"') && issue.includes('option value from "char_q01"')
      ),
      condition.op
    );
  });

  const valid = validDefinition({ status: "draft" });
  valid.pages[0].questions[0].followUps[0].visibleIf = [
    { field: "char_q01", op: "in", value: ["yes", "no"] },
  ];
  assert.deepEqual(getQuestionnaireDefinitionIssues(valid), []);
});
