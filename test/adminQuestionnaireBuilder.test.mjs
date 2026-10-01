import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire, Module } from "node:module";
import path from "node:path";
import { test } from "node:test";
import * as React from "react";

const require = createRequire(import.meta.url);
const { loadBindings, transform } = require("next/dist/build/swc");
await loadBindings();

let renderingHarness;
const hooks = {
  ...React,
  useState(initial) {
    const harness = renderingHarness;
    const slot = harness.cursor++;
    if (!(slot in harness.slots)) {
      harness.slots[slot] = typeof initial === "function" ? initial() : initial;
    }
    return [harness.slots[slot], (next) => {
      harness.slots[slot] = typeof next === "function" ? next(harness.slots[slot]) : next;
    }];
  },
  useEffect(effect, dependencies) {
    const harness = renderingHarness;
    const slot = harness.cursor++;
    const previous = harness.slots[slot];
    if (!previous || dependencies.some((value, index) => !Object.is(value, previous[index]))) {
      harness.slots[slot] = dependencies;
      harness.effects.push(effect);
    }
  },
  useMemo(calculate) {
    renderingHarness.cursor++;
    return calculate();
  },
  useRef(initial) {
    const harness = renderingHarness;
    const slot = harness.cursor++;
    if (!(slot in harness.slots)) harness.slots[slot] = { current: initial };
    return harness.slots[slot];
  },
};

const icons = new Proxy({ __esModule: true }, {
  get: (target, name) => name in target ? target[name] : () => null,
});

const starterDefinition = {
  id: "starter",
  title: "Starter",
  version: "1.0.0",
  visaType: "temporary-work",
  visaContexts: ["482"],
  status: "active",
  pages: [],
};

let registeredQuestionnaireRoutes = [];

async function loadComponent(relativePath) {
  const filename = path.resolve(relativePath);
  const source = await readFile(filename, "utf8");
  const { code } = await transform(source, {
    filename,
    jsc: {
      parser: { syntax: "ecmascript", jsx: true },
      target: "es2022",
      transform: { react: { runtime: "automatic" } },
    },
    module: { type: "commonjs" },
  });
  const componentModule = new Module(filename);
  componentModule.filename = filename;
  componentModule.paths = Module._nodeModulePaths(path.dirname(filename));
  componentModule.require = (specifier) => {
    if (specifier === "react") return hooks;
    if (specifier === "lucide-react") return icons;
    if (specifier === "@/components/ui/badge") return { Badge: "span" };
    if (specifier === "@/components/ui/button") return { Button: "button" };
    if (specifier === "@/components/ui/input") return { Input: "input" };
    if (specifier === "@/components/ui/textarea") return { Textarea: "textarea" };
    if (specifier === "@/components/matter/MatterTabLoadingState") {
      return {
        __esModule: true,
        default: ({ label }) => React.createElement(
          "section",
          { role: "status" },
          label,
        ),
      };
    }
    if (specifier === "@/components/matter/MatterDataContext") {
      return { useMatterData: () => null };
    }
    if (specifier === "@/lib/routes") {
      return { getRegisteredQuestionnaireRoutes: () => registeredQuestionnaireRoutes };
    }
    if (specifier === "@/lib/questionnaireStarterTemplates") {
      return { temporaryWork482Definition: starterDefinition };
    }
    if (specifier === "@/lib/questionnaireBuiltIns") {
      return { questionnaireBuiltInTemplates: [] };
    }
    if (specifier === "@/lib/questionnaireLegacyProtection") {
      return { hydrateLegacyQuestionnaireDefinition: (definition) => definition };
    }
    return require(specifier);
  };
  componentModule._compile(code, filename);
  return componentModule.exports;
}

const { default: AdminQuestionnaireBuilder } = await loadComponent(
  "src/components/admin/AdminQuestionnaireBuilder.jsx",
);

function* walk(node) {
  if (Array.isArray(node)) {
    for (const child of node) yield* walk(child);
  } else if (React.isValidElement(node)) {
    yield node;
    if (typeof node.type === "function") {
      yield* walk(node.type(node.props));
    } else {
      yield* walk(node.props.children);
    }
  }
}

function text(node) {
  if (Array.isArray(node)) return node.map(text).join("");
  if (React.isValidElement(node)) return text(node.props.children);
  return node == null || typeof node === "boolean" ? "" : String(node);
}

function createHarness(Component, props = {}) {
  return {
    slots: [], effects: [], cursor: 0, tree: null,
    render() {
      renderingHarness = this;
      this.cursor = 0;
      this.tree = Component(props);
      return this.tree;
    },
    nodes() {
      return [...walk(this.tree)];
    },
    find(predicate, message = "Expected rendered control was not found") {
      const node = this.nodes().find(predicate);
      assert.ok(node, message);
      return node;
    },
    maybeControl(id) {
      return this.nodes().find((node) =>
        typeof node.type === "string" &&
        (node.props.id === id || node.props["aria-label"] === id)
      );
    },
    control(id) {
      return this.find(
        (node) => typeof node.type === "string" &&
          (node.props.id === id || node.props["aria-label"] === id),
        `Expected ${id} control was not found`,
      );
    },
    button(label) {
      return this.find(
        (node) => node.type === "button" && text(node) === label,
        `Expected ${label} button was not found`,
      );
    },
    buttonMatching(pattern, message = `Expected button matching ${pattern} was not found`) {
      return this.find(
        (node) => node.type === "button" && pattern.test(text(node)),
        message,
      );
    },
  };
}

async function flushEffects(harness) {
  for (const effect of harness.effects.splice(0)) effect();
  await new Promise((resolve) => setImmediate(resolve));
  harness.render();
}

const jsonResponse = (body, status = 200) => ({
  ok: status < 400,
  status,
  text: async () => JSON.stringify(body),
});

function richDefinition() {
  return {
    schemaVersion: 1,
    id: "rich-questionnaire",
    title: "Rich questionnaire",
    version: "2.3.4",
    visaType: "temporary-work",
    visaContexts: ["482"],
    status: "active",
    revision: 7,
    metadata: { definitionFlag: "keep-definition" },
    pages: [
      {
        id: "identity-page-internal",
        title: "Identity details",
        route: "/intake/temporary-work/main-applicant/details",
        sectionKey: "identity_storage_internal",
        completionKey: "temporary-work/main-applicant/details",
        scope: "profile",
        order: 20,
        metadata: {
          renderer: "dynamic",
          profileRole: "main_applicant",
          nested: { retain: true },
        },
        customPageFlag: "keep-page",
        introBlocks: [
          { type: "paragraph", text: "Original introduction." },
          { type: "list", lead: "Please have ready:", items: ["Passport", "Photo"] },
          { type: "callout", text: "Contact us if you need help." },
        ],
        questions: [
          {
            id: "question-internal-id",
            answerKey: "answer_key_internal",
            label: "Original question text?",
            type: "radio",
            required: true,
            description: "Original help text.",
            placeholder: "Original placeholder",
            rows: 6,
            customQuestionFlag: "keep-question",
            metadata: { analyticsName: "identity_question", nested: { retain: true } },
            options: [
              { value: "yes_internal", label: "Yes label", metadata: { retain: 1 } },
              { value: "no_internal", label: "No label", metadata: { retain: 2 } },
            ],
            visibleIf: [
              { field: "eligibility_internal", op: "equals", value: "eligible_internal" },
              { field: "eligibility_internal", op: "notEquals", value: "ineligible_internal" },
            ],
            followUps: [
              {
                id: "follow-up-internal-id",
                answerKey: "follow_up_internal_key",
                label: "Original follow-up text",
                type: "radio",
                required: false,
                description: "Follow-up help",
                placeholder: "Follow-up placeholder",
                rows: 4,
                options: [
                  { value: "follow_up_yes_internal", label: "Follow-up yes", metadata: { retain: 3 } },
                  { value: "follow_up_no_internal", label: "Follow-up no", metadata: { retain: 4 } },
                ],
                visibleIf: [
                  { field: "answer_key_internal", op: "equals", value: "yes_internal" },
                ],
                metadata: { followUpFlag: "keep-follow-up" },
              },
            ],
          },
          {
            id: "eligibility-internal-id",
            answerKey: "eligibility_internal",
            label: "Eligibility source",
            type: "yesNo",
            required: true,
            options: [
              { value: "eligible_internal", label: "Eligible" },
              { value: "ineligible_internal", label: "Not eligible" },
            ],
          },
          {
            id: "records-internal-id",
            answerKey: "records_internal",
            label: "Record question",
            type: "repeater",
            required: false,
            metadata: {
              fields: [
                {
                  id: "record-field-internal-id",
                  answerKey: "record_field_internal",
                  label: "Record field text",
                  type: "select",
                  required: false,
                  description: "Record field help",
                  placeholder: "Record field placeholder",
                  options: [
                    { value: "record_one_internal", label: "Record choice one", metadata: { retain: 5 } },
                    { value: "record_two_internal", label: "Record choice two", metadata: { retain: 6 } },
                  ],
                  visibleIf: [
                    { field: "eligibility_internal", op: "equals", value: "eligible_internal" },
                  ],
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

async function mountBuilder(t, {
  definition = richDefinition(),
  embeddedInMatter = true,
  routes = [],
  confirm = () => true,
} = {}) {
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  const calls = [];
  const storedDefinitions = [definition];
  registeredQuestionnaireRoutes = routes;
  globalThis.window = {
    addEventListener() {},
    removeEventListener() {},
    confirm,
  };
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    if (url === "/api/questionnaire-definitions" && !options.method) {
      return jsonResponse({ definitions: storedDefinitions });
    }
    if (url === "/api/questionnaire-definitions" && options.method === "POST") {
      const submitted = JSON.parse(options.body);
      const persisted = { ...submitted, revision: 1 };
      storedDefinitions.push(persisted);
      return jsonResponse({ definition: persisted }, 201);
    }
    if (url.startsWith("/api/questionnaire-definitions/") && !options.method) {
      const id = decodeURIComponent(url.slice("/api/questionnaire-definitions/".length));
      const stored = storedDefinitions.find((candidate) => candidate.id === id);
      assert.ok(stored, `Expected ${id} to exist in the questionnaire fixture`);
      return jsonResponse({ definition: stored });
    }
    if (url.startsWith("/api/questionnaire-definitions/") && options.method === "PUT") {
      const id = decodeURIComponent(url.slice("/api/questionnaire-definitions/".length));
      const submitted = JSON.parse(options.body);
      const persisted = { ...submitted, revision: Number(submitted.revision || 0) + 1 };
      const index = storedDefinitions.findIndex((candidate) => candidate.id === id);
      assert.notEqual(index, -1, `Expected ${id} to exist before update`);
      storedDefinitions[index] = persisted;
      return jsonResponse({ definition: persisted });
    }
    assert.fail(`Unexpected request: ${options.method || "GET"} ${url}`);
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
    globalThis.window = originalWindow;
    registeredQuestionnaireRoutes = [];
  });

  const harness = createHarness(AdminQuestionnaireBuilder, { embeddedInMatter });
  harness.render();
  await flushEffects(harness);
  return { harness, calls, definition, storedDefinitions };
}

const questionnaireRoutes = [
  {
    href: "/intake/temporary-work/main-applicant/details",
    title: "Identity details",
  },
  {
    href: "/intake/temporary-work/all-applicants/health",
    title: "Health details",
  },
];

test("embedded live builder exposes safe copy fields and visible but locked structural controls without machine keys", async (t) => {
  const { harness } = await mountBuilder(t, { routes: questionnaireRoutes });

  for (const id of [
    "page-title",
    "page-intro",
    "question-label",
    "question-description",
    "question-placeholder",
    "follow-up-follow-up-internal-id-label",
    "follow-up-follow-up-internal-id-description",
    "follow-up-follow-up-internal-id-placeholder",
    "follow-up-follow-up-internal-id-option-1-label",
    "follow-up-follow-up-internal-id-option-2-label",
    "follow-up-follow-up-internal-id-condition-question",
    "follow-up-follow-up-internal-id-condition-operator",
    "follow-up-follow-up-internal-id-condition-answer",
    "condition-question",
    "condition-operator",
    "condition-answer",
  ]) {
    assert.ok(harness.maybeControl(id), `${id} should remain editable`);
  }

  for (const id of [
    "questionnaire-title",
    "questionnaire-version",
    "questionnaire-visa-type",
    "questionnaire-contexts",
  ]) {
    assert.ok(harness.maybeControl(id), `${id} should be visible in the embedded builder`);
  }

  for (const id of [
    "questionnaire-id",
    "page-id",
    "page-route",
    "page-section",
    "page-completion",
    "page-scope",
    "question-id",
    "question-key",
    "question-type",
    "condition-field",
    "condition-value",
    "Questionnaire JSON",
    "Option 1 value",
  ]) {
    assert.equal(harness.maybeControl(id), undefined, `${id} should be hidden`);
  }

  const renderedText = text(harness.tree);
  assert.ok(
    renderedText.includes("Questionnaire settings · title, visa type and version"),
    "questionnaire settings should be visible",
  );
  for (const label of [
    "Required answer",
    "Advanced JSON",
  ]) {
    assert.equal(renderedText.includes(label), false, `${label} should be hidden`);
  }

  for (const label of [
    "Answer choices",
    "Show this question conditionally",
    "Follow-up wording",
  ]) {
    assert.ok(renderedText.includes(label), `${label} should be available`);
  }

  assert.equal(harness.button("Add questionnaire").props.disabled, false);
  assert.equal(harness.button("Copy as test").props.disabled, false);
  assert.equal(harness.button("Add question").props.disabled, true);
  for (const label of [
    "Add page",
    "Move page up",
    "Move page down",
    "Delete page",
    "Move question up",
    "Move question down",
    "Delete question",
  ]) {
    const control = harness.control(label);
    assert.equal(control.props.disabled, true, `${label} should be visible but locked on a live questionnaire`);
  }
  assert.equal(
    harness.control("Delete questionnaire").props.disabled,
    false,
    "the saved questionnaire itself should remain deletable",
  );

  const choiceLabels = harness.nodes().filter((node) =>
    node.type === "input" && ["Yes label", "No label"].includes(node.props.value)
  );
  assert.equal(choiceLabels.length, 2, "answer choice labels should be editable");
  assert.equal(
    harness.nodes().some((node) =>
      node.type === "input" && ["yes_internal", "no_internal"].includes(node.props.value)
    ),
    false,
    "stored answer values must not be exposed in text inputs",
  );
  assert.ok(harness.buttonMatching(/^Add choice$/));
  assert.ok(harness.maybeControl("Delete choice 1"));
  assert.ok(harness.maybeControl("Delete choice 2"));

  const questionCondition = harness.control("condition-question");
  const answerCondition = harness.control("condition-answer");
  const questionChoices = text(questionCondition.props.children);
  const answerChoices = text(answerCondition.props.children);
  assert.ok(questionChoices.includes("Eligibility source"));
  assert.equal(questionChoices.includes("eligibility_internal"), false);
  assert.ok(answerChoices.includes("Eligible"));
  assert.ok(answerChoices.includes("Not eligible"));
  assert.equal(answerChoices.includes("eligible_internal"), false);
  assert.equal(answerChoices.includes("ineligible_internal"), false);

  assert.equal(
    harness.nodes().some((node) =>
      node.type === "p" && ["answer_key_internal", "radio"].includes(text(node))
    ),
    false,
    "machine keys and question types should not be shown as question details",
  );
  for (const machineKey of [
    "answer_key_internal",
    "follow_up_internal_key",
    "eligibility_internal",
    "yes_internal",
    "no_internal",
    "follow_up_yes_internal",
    "follow_up_no_internal",
  ]) {
    assert.equal(renderedText.includes(machineKey), false, `${machineKey} must not be shown to the user`);
  }
  assert.ok(renderedText.includes("Page details"));
  assert.ok(renderedText.includes("Question 1"));

  harness.find(
    (node) => node.type === "button" && text(node).includes("Record question"),
    "Expected the record question selector",
  ).props.onClick();
  harness.render();
  for (const id of [
    "record-record-field-internal-id-label",
    "record-record-field-internal-id-description",
    "record-record-field-internal-id-placeholder",
    "record-record-field-internal-id-option-1-label",
    "record-record-field-internal-id-option-2-label",
    "record-record-field-internal-id-condition-question",
    "record-record-field-internal-id-condition-operator",
    "record-record-field-internal-id-condition-answer",
  ]) {
    assert.ok(harness.maybeControl(id), `${id} should remain editable`);
  }
  assert.ok(text(harness.tree).includes("Record field wording"));
  assert.equal(text(harness.control("record-record-field-internal-id-condition-question").props.children).includes("Eligibility source"), false);
  assert.equal(text(harness.control("record-record-field-internal-id-condition-answer").props.children).includes("Eligible"), false);
  assert.equal(text(harness.tree).includes("record_field_internal"), false);
  assert.equal(text(harness.tree).includes("record_one_internal"), false);
});

test("copy as test creates a separate draft and saving posts it without mutating the live source", async (t) => {
  const definition = richDefinition();
  const original = structuredClone(definition);
  const { harness, calls, storedDefinitions } = await mountBuilder(t, {
    definition,
    routes: questionnaireRoutes,
  });

  harness.button("Copy as test").props.onClick();
  harness.render();

  assert.equal(harness.control("questionnaire-title").props.value, "Rich questionnaire — Test");
  assert.ok(text(harness.tree).includes("Test copy created"));
  assert.equal(harness.maybeControl("questionnaire-id"), undefined, "the generated ID stays hidden");

  await harness.button("Save").props.onClick();
  harness.render();

  const postCall = calls.find(({ url, options }) =>
    url === "/api/questionnaire-definitions" && options.method === "POST"
  );
  assert.ok(postCall, "the test copy should be created through POST");
  const submitted = JSON.parse(postCall.options.body);
  assert.equal(submitted.status, "draft");
  assert.equal(submitted.revision, 0);
  assert.notEqual(submitted.id, definition.id);
  assert.match(submitted.id, /^questionnaire-/);
  assert.equal(submitted.title, "Rich questionnaire — Test");
  assert.deepEqual(submitted.pages, definition.pages);
  assert.deepEqual(definition, original, "copying and saving must not alter the live source object");
  assert.equal(
    calls.some(({ options }) => options.method === "PUT"),
    false,
    "a new test copy must not update the live definition",
  );
  assert.ok(
    storedDefinitions.some((candidate) => candidate.id === definition.id && candidate.status === "active"),
    "the live definition should remain active",
  );
  assert.ok(
    storedDefinitions.some((candidate) => candidate.id === submitted.id && candidate.status === "draft"),
    "the saved test copy should coexist as a draft",
  );
});

test("a copied test can add and delete registered pages and questions while keeping machine keys hidden", async (t) => {
  const definition = richDefinition();
  const { harness } = await mountBuilder(t, {
    definition,
    routes: questionnaireRoutes,
  });

  harness.button("Copy as test").props.onClick();
  harness.render();

  assert.equal(harness.control("Add page").props.disabled, false);
  assert.equal(harness.button("Add question").props.disabled, false);
  assert.equal(harness.control("Delete page").props.disabled, false);
  assert.equal(harness.control("Delete question").props.disabled, false);

  harness.control("Add page").props.onClick();
  harness.render();
  assert.ok(text(harness.tree).includes("Health details"));
  assert.equal(harness.button("Add question").props.disabled, false);

  harness.button("Add question").props.onClick();
  harness.render();
  assert.ok(text(harness.tree).includes("New question"));
  assert.ok(harness.control("question-type"), "draft questions should expose their type control");
  assert.equal(harness.maybeControl("question-id"), undefined);
  assert.equal(harness.maybeControl("question-key"), undefined);
  assert.equal(harness.control("Delete question").props.disabled, false);

  harness.control("Delete question").props.onClick();
  harness.render();
  assert.equal(text(harness.tree).includes("New question"), false);
  assert.ok(text(harness.tree).includes("No questions on this page."));

  assert.equal(harness.control("Delete page").props.disabled, false);
  harness.control("Delete page").props.onClick();
  harness.render();
  assert.equal(text(harness.tree).includes("Health details"), false);
  assert.ok(text(harness.tree).includes("1 total"));
  assert.equal(definition.pages.length, 1, "draft structure edits must not mutate the live source");
  assert.equal(definition.pages[0].questions.length, 3);
});

test("previously absent legacy help and placeholder fields are enabled and promote the page before save", async (t) => {
  const definition = richDefinition();
  definition.pages[0].metadata.renderer = "legacy";
  delete definition.pages[0].questions[0].description;
  delete definition.pages[0].questions[0].placeholder;

  const { harness, calls } = await mountBuilder(t, { definition });
  const helpText = harness.control("question-description");
  const placeholder = harness.control("question-placeholder");
  assert.notEqual(helpText.props.disabled, true);
  assert.notEqual(placeholder.props.disabled, true);
  assert.equal(harness.maybeControl("question-id"), undefined, "live machine keys remain hidden");
  assert.equal(harness.maybeControl("question-key"), undefined, "live answer keys remain hidden");

  helpText.props.onChange({ target: { value: "Newly added guidance" } });
  harness.render();
  harness.control("question-placeholder").props.onChange({
    target: { value: "Newly added placeholder" },
  });
  harness.render();

  await harness.button("Save").props.onClick();
  const saveCall = calls.find(({ url, options }) =>
    url === `/api/questionnaire-definitions/${definition.id}` && options.method === "PUT"
  );
  assert.ok(saveCall);
  const submitted = JSON.parse(saveCall.options.body);
  assert.equal(submitted.pages[0].metadata.renderer, "dynamic");
  assert.equal(submitted.pages[0].questions[0].description, "Newly added guidance");
  assert.equal(submitted.pages[0].questions[0].placeholder, "Newly added placeholder");
});

test("a draft source question cannot be deleted while another question depends on its answer", async (t) => {
  const definition = richDefinition();
  definition.status = "draft";
  const { harness } = await mountBuilder(t, { definition });

  harness.buttonMatching(/Eligibility source/).props.onClick();
  harness.render();
  assert.equal(harness.control("Delete question").props.disabled, false);

  harness.control("Delete question").props.onClick();
  harness.render();

  assert.ok(text(harness.tree).includes("controls Original question text?"));
  assert.ok(
    harness.nodes().some((node) =>
      node.type === "button" && text(node).includes("Eligibility source")
    ),
    "the dependency source should remain in the questionnaire",
  );
  assert.equal(harness.maybeControl("question-id"), undefined);
  assert.equal(harness.maybeControl("question-key"), undefined);
});

test("embedded edits serialize hidden choice and condition values while preserving metadata", async (t) => {
  const { harness, calls, definition } = await mountBuilder(t);
  const originalPage = structuredClone(definition.pages[0]);
  const originalQuestion = structuredClone(originalPage.questions[0]);

  harness.control("page-title").props.onChange({ target: { value: "Updated page title" } });
  harness.control("page-intro").props.onChange({ target: { value: "Updated introduction." } });
  harness.control("question-label").props.onChange({ target: { value: "Updated question text?" } });
  harness.control("question-description").props.onChange({ target: { value: "Updated help text." } });
  harness.control("question-placeholder").props.onChange({ target: { value: "Updated placeholder" } });
  harness.render();

  harness.find(
    (node) => node.type === "input" && node.props.value === "Yes label",
    "Expected the first answer choice label input",
  ).props.onChange({ target: { value: "Definitely" } });
  harness.render();
  harness.control("Delete choice 2").props.onClick();
  harness.render();
  harness.button("Add choice").props.onClick();
  harness.render();
  harness.find(
    (node) => node.type === "input" && node.props.value === "Option 2",
    "Expected the newly added answer choice label input",
  ).props.onChange({ target: { value: "Maybe" } });
  harness.render();

  harness.control("condition-question").props.onChange({
    target: { value: "eligibility_internal" },
  });
  harness.render();
  harness.control("condition-answer").props.onChange({
    target: { value: "ineligible_internal" },
  });
  harness.render();

  harness.control("follow-up-follow-up-internal-id-label").props.onChange({
    target: { value: "Updated follow-up text" },
  });
  harness.control("follow-up-follow-up-internal-id-description").props.onChange({
    target: { value: "Updated follow-up help" },
  });
  harness.control("follow-up-follow-up-internal-id-placeholder").props.onChange({
    target: { value: "Updated follow-up placeholder" },
  });
  harness.render();

  await harness.button("Save").props.onClick();
  harness.render();

  const saveCall = calls.find(({ url, options }) =>
    url === `/api/questionnaire-definitions/${definition.id}` && options.method === "PUT"
  );
  assert.ok(saveCall, "Expected the edited questionnaire to be saved");
  const payload = JSON.parse(saveCall.options.body);
  const savedPage = payload.pages[0];
  const savedQuestion = savedPage.questions[0];

  assert.equal(savedPage.title, "Updated page title");
  assert.equal(savedPage.introBlocks[0].text, "Updated introduction.");
  assert.equal(savedQuestion.label, "Updated question text?");
  assert.equal(savedQuestion.description, "Updated help text.");
  assert.equal(savedQuestion.placeholder, "Updated placeholder");

  assert.equal(savedQuestion.options.length, 2);
  assert.deepEqual(savedQuestion.options[0], {
    value: "yes_internal",
    label: "Definitely",
    metadata: { retain: 1 },
  });
  assert.equal(
    savedQuestion.options.some((option) => option.value === "no_internal"),
    false,
    "deleting a choice should remove its stored value",
  );
  assert.equal(savedQuestion.options[1].label, "Maybe");
  assert.match(savedQuestion.options[1].value, /^[a-z0-9_]+$/);
  assert.notEqual(savedQuestion.options[1].value, savedQuestion.options[1].label);
  assert.deepEqual(savedQuestion.visibleIf[0], {
    field: "eligibility_internal",
    op: "equals",
    value: "ineligible_internal",
  });
  assert.deepEqual(
    savedQuestion.visibleIf.slice(1),
    originalQuestion.visibleIf.slice(1),
    "additional conditions must remain intact",
  );
  assert.equal(savedQuestion.followUps[0].label, "Updated follow-up text");
  assert.equal(savedQuestion.followUps[0].description, "Updated follow-up help");
  assert.equal(savedQuestion.followUps[0].placeholder, "Updated follow-up placeholder");
  for (const field of ["id", "answerKey", "type", "required", "visibleIf", "metadata"]) {
    assert.deepEqual(
      savedQuestion.followUps[0][field],
      originalQuestion.followUps[0][field],
      `follow-up ${field} must be preserved`,
    );
  }

  assert.deepEqual(
    savedPage.introBlocks.slice(1),
    originalPage.introBlocks.slice(1),
    "non-paragraph introduction blocks must survive a simple intro edit",
  );
  for (const field of [
    "id",
    "route",
    "sectionKey",
    "completionKey",
    "scope",
    "order",
    "metadata",
    "customPageFlag",
  ]) {
    assert.deepEqual(savedPage[field], originalPage[field], `page ${field} must be preserved`);
  }
  for (const field of [
    "id",
    "answerKey",
    "type",
    "required",
    "rows",
    "metadata",
    "customQuestionFlag",
  ]) {
    assert.deepEqual(savedQuestion[field], originalQuestion[field], `question ${field} must be preserved`);
  }
  assert.deepEqual(
    savedPage.questions.slice(1),
    originalPage.questions.slice(1),
    "unselected questions must remain unchanged",
  );
  assert.equal(payload.revision, definition.revision);
  assert.deepEqual(payload.metadata, definition.metadata);
});

test("nested follow-up and record controls save structural edits without exposing their keys", async (t) => {
  const definition = richDefinition();
  definition.id = "nested-legacy-questionnaire";
  definition.pages[0].metadata.renderer = "legacy";
  const originalPageMetadata = structuredClone(definition.pages[0].metadata);
  const { harness, calls } = await mountBuilder(t, { definition });

  harness.control("follow-up-follow-up-internal-id-label").props.onChange({
    target: { value: "Updated nested follow-up" },
  });
  harness.control("follow-up-follow-up-internal-id-option-1-label").props.onChange({
    target: { value: "Updated follow-up choice" },
  });
  harness.control("follow-up-follow-up-internal-id-delete-option-2").props.onClick();
  harness.render();
  harness.control("follow-up-follow-up-internal-id-add-option").props.onClick();
  harness.render();
  harness.find(
    (node) => node.type === "input" && node.props.value === "Option 2",
    "Expected a new follow-up choice",
  ).props.onChange({ target: { value: "New follow-up choice" } });
  harness.control("follow-up-follow-up-internal-id-condition-answer").props.onChange({
    target: { value: "no_internal" },
  });
  harness.render();

  harness.find(
    (node) => node.type === "button" && text(node).includes("Record question"),
    "Expected the record question selector",
  ).props.onClick();
  harness.render();

  harness.control("record-record-field-internal-id-label").props.onChange({
    target: { value: "Updated record field" },
  });
  harness.control("record-record-field-internal-id-option-1-label").props.onChange({
    target: { value: "Updated record choice" },
  });
  assert.equal(
    text(harness.control("record-record-field-internal-id-condition-question")).includes("Eligibility source"),
    false,
    "record conditions must not offer page-level answers that are unavailable inside a row",
  );
  harness.control("record-record-field-internal-id-delete-option-2").props.onClick();
  harness.render();
  harness.control("record-record-field-internal-id-add-option").props.onClick();
  harness.render();
  harness.find(
    (node) => node.type === "input" && node.props.value === "Option 2",
    "Expected a new record choice",
  ).props.onChange({ target: { value: "New record choice" } });
  harness.control("record-record-field-internal-id-condition-answer").props.onChange({
    target: { value: "ineligible_internal" },
  });
  harness.render();

  await harness.button("Save").props.onClick();
  const saveCall = calls.find(({ url, options }) =>
    url === "/api/questionnaire-definitions/nested-legacy-questionnaire" && options.method === "PUT"
  );
  assert.ok(saveCall, "Expected nested changes to be saved");
  const payload = JSON.parse(saveCall.options.body);
  const savedPage = payload.pages[0];
  const savedFollowUp = savedPage.questions[0].followUps[0];
  const savedRecordField = savedPage.questions[2].metadata.fields[0];

  assert.equal(savedPage.metadata.renderer, "dynamic");
  assert.deepEqual(savedPage.metadata.nested, originalPageMetadata.nested);
  assert.equal(savedFollowUp.id, "follow-up-internal-id");
  assert.equal(savedFollowUp.answerKey, "follow_up_internal_key");
  assert.equal(savedFollowUp.label, "Updated nested follow-up");
  assert.deepEqual(savedFollowUp.options[0], {
    value: "follow_up_yes_internal",
    label: "Updated follow-up choice",
    metadata: { retain: 3 },
  });
  assert.equal(savedFollowUp.options[1].label, "New follow-up choice");
  assert.match(savedFollowUp.options[1].value, /^choice_[a-z0-9_]+$/);
  assert.deepEqual(savedFollowUp.visibleIf[0], {
    field: "answer_key_internal",
    op: "equals",
    value: "no_internal",
  });

  assert.equal(savedRecordField.id, "record-field-internal-id");
  assert.equal(savedRecordField.answerKey, "record_field_internal");
  assert.equal(savedRecordField.label, "Updated record field");
  assert.deepEqual(savedRecordField.options[0], {
    value: "record_one_internal",
    label: "Updated record choice",
    metadata: { retain: 5 },
  });
  assert.equal(savedRecordField.options[1].label, "New record choice");
  assert.match(savedRecordField.options[1].value, /^choice_[a-z0-9_]+$/);
  assert.deepEqual(savedRecordField.visibleIf[0], {
    field: "eligibility_internal",
    op: "equals",
    value: "ineligible_internal",
  });
});

test("adding an answer choice to a legacy page promotes it to the dynamic renderer", async (t) => {
  const definition = richDefinition();
  definition.id = "legacy-questionnaire";
  definition.pages[0].metadata.renderer = "legacy";
  const originalMetadata = structuredClone(definition.pages[0].metadata);
  const { harness, calls } = await mountBuilder(t, { definition });

  const addChoice = harness.button("Add choice");
  assert.equal(addChoice.props.disabled, false);
  addChoice.props.onClick();
  harness.render();

  const newChoice = harness.find(
    (node) => node.type === "input" && node.props.value === "Option 3",
    "Expected the newly added answer choice label input",
  );
  newChoice.props.onChange({ target: { value: "A third choice" } });
  harness.render();
  assert.equal(harness.maybeControl("question-id"), undefined);
  assert.equal(harness.maybeControl("question-key"), undefined);

  await harness.button("Save").props.onClick();
  const saveCall = calls.find(({ url, options }) =>
    url === "/api/questionnaire-definitions/legacy-questionnaire" && options.method === "PUT"
  );
  assert.ok(saveCall, "Expected the structurally edited legacy questionnaire to be saved");
  const savedPage = JSON.parse(saveCall.options.body).pages[0];

  assert.equal(savedPage.metadata.renderer, "dynamic");
  assert.deepEqual(savedPage.metadata.nested, originalMetadata.nested);
  assert.equal(savedPage.metadata.profileRole, originalMetadata.profileRole);
  assert.equal(savedPage.questions.length, definition.pages[0].questions.length);
  const addedChoice = savedPage.questions[0].options.at(-1);
  assert.equal(addedChoice.label, "A third choice");
  assert.ok(addedChoice.value);
  assert.notEqual(addedChoice.value, addedChoice.label);
});

test("editing an existing choice label promotes the page so that field-specific wording is rendered", async (t) => {
  const definition = richDefinition();
  definition.id = "legacy-choice-label-questionnaire";
  definition.pages[0].metadata.renderer = "legacy";
  const { harness, calls } = await mountBuilder(t, { definition });

  const firstChoice = harness.control("Option 1 label");
  firstChoice.props.onChange({ target: { value: "Updated first choice" } });
  harness.render();

  await harness.button("Save").props.onClick();
  const saveCall = calls.find(({ url, options }) =>
    url === "/api/questionnaire-definitions/legacy-choice-label-questionnaire"
    && options.method === "PUT"
  );
  assert.ok(saveCall, "Expected the edited choice wording to be saved");
  const savedPage = JSON.parse(saveCall.options.body).pages[0];

  assert.equal(savedPage.metadata.renderer, "dynamic");
  assert.equal(savedPage.questions[0].options[0].value, "yes_internal");
  assert.equal(savedPage.questions[0].options[0].label, "Updated first choice");
});
