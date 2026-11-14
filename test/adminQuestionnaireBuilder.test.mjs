import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire, Module } from "node:module";
import path from "node:path";
import { test } from "node:test";
import * as React from "react";
import * as crmFieldCatalog from "../src/lib/crmFieldCatalog.js";
import * as questionnaireClientPresentation from "../src/lib/questionnaireClientPresentation.js";
import * as questionnaireConditionalBranches from "../src/lib/questionnaireConditionalBranches.js";
import * as questionnaireContentItems from "../src/lib/questionnaireContentItems.js";
import * as questionnaireDrafts from "../src/lib/questionnaireDrafts.js";
import * as questionnaireCrmContract from "../src/lib/questionnaireCrmContract.js";
import * as questionnairePageGroups from "../src/lib/questionnairePageGroups.js";
import { getQuestionnaireWorkflowPages } from "../src/lib/questionnaireWorkflowPages.js";

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
    if (specifier === "@/components/ui/collapsible") {
      const Passthrough = ({ children }) => children;
      return {
        Collapsible: Passthrough,
        CollapsibleContent: Passthrough,
        CollapsibleTrigger: Passthrough,
      };
    }
    if (specifier === "@/components/ui/input") return { Input: "input" };
    if (specifier === "@/components/ui/scroll-area") return { ScrollArea: "div" };
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
    if (specifier === "@/lib/questionnaireAdminCoverage") {
      return { completeAdminQuestionnairePages: (definition) => definition };
    }
    if (specifier === "@/lib/questionnaireClientPresentation") return questionnaireClientPresentation;
    if (specifier === "@/lib/questionnaireConditionalBranches") return questionnaireConditionalBranches;
    if (specifier === "@/lib/questionnaireContentItems") return questionnaireContentItems;
    if (specifier === "@/lib/questionnaireDrafts") return questionnaireDrafts;
    if (specifier === "@/lib/crmFieldCatalog") return crmFieldCatalog;
    if (specifier === "@/lib/questionnaireCrmContract") return questionnaireCrmContract;
    if (specifier === "@/lib/questionnairePageGroups") return questionnairePageGroups;
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

/** "⋯" toggles on the questionnaire library rows. */
function rowActionToggles(harness) {
  return harness.nodes().filter((node) =>
    node.type === "button" && String(node.props["aria-label"] || "").startsWith("Actions for "));
}

/** Open a library row's "⋯" menu and choose an action (first row by default). */
async function chooseRowAction(harness, label, rowIndex = 0) {
  const toggles = rowActionToggles(harness);
  assert.ok(toggles[rowIndex], "Expected a questionnaire actions menu");
  toggles[rowIndex].props.onClick();
  harness.render();
  await harness.buttonMatching(label).props.onClick();
}

/** A question (or record field) in the follow-up dialog's tree, with everything nested under it. */
function followUpTreeItem(harness, label) {
  return harness.find(
    (node) => node.type === "li" && [].concat(node.props.children).some((child) =>
      React.isValidElement(child) && child.props?.["aria-label"] === `Edit “${label}”`),
    `Expected ${label} in the follow-up dialog`,
  );
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
  initialLayout = "current",
  initialView = "editor",
  routes = [],
  confirm = () => true,
  extraDefinitions = [],
} = {}) {
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  const calls = [];
  const replacedUrls = [];
  const storedDefinitions = [definition, ...extraDefinitions];
  registeredQuestionnaireRoutes = routes;
  globalThis.window = {
    addEventListener() {},
    removeEventListener() {},
    confirm,
    location: {
      hash: "",
      pathname: embeddedInMatter ? "/matter/app-123/questionnaire-builder" : "/admin/questionnaires",
      search: `?layout=${initialLayout}${initialView === "list" ? "&view=list" : ""}`,
    },
    history: {
      replaceState(_state, _unused, url) {
        replacedUrls.push(url);
        const next = new URL(url, "https://portal.test");
        globalThis.window.location.pathname = next.pathname;
        globalThis.window.location.search = next.search;
        globalThis.window.location.hash = next.hash;
      },
    },
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
    if (url.startsWith("/api/questionnaire-definitions/") && options.method === "PATCH") {
      // Mirrors the server: publishing archives the other live questionnaire for the audience.
      const id = decodeURIComponent(url.slice("/api/questionnaire-definitions/".length));
      const patch = JSON.parse(options.body);
      const index = storedDefinitions.findIndex((candidate) => candidate.id === id);
      assert.notEqual(index, -1, `Expected ${id} to exist before update`);
      if (patch.status === "active") {
        storedDefinitions.forEach((candidate, candidateIndex) => {
          if (candidate.status === "active" && candidate.visaType === storedDefinitions[index].visaType) {
            storedDefinitions[candidateIndex] = { ...candidate, status: "archived" };
          }
        });
      }
      storedDefinitions[index] = { ...storedDefinitions[index], ...patch, revision: Number(patch.revision || 0) + 1 };
      return jsonResponse({ definition: storedDefinitions[index] });
    }
    assert.fail(`Unexpected request: ${options.method || "GET"} ${url}`);
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
    globalThis.window = originalWindow;
    registeredQuestionnaireRoutes = [];
  });

  const harness = createHarness(AdminQuestionnaireBuilder, { embeddedInMatter, initialLayout, initialView });
  harness.render();
  await flushEffects(harness);
  return { harness, calls, definition, replacedUrls, storedDefinitions };
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

test("embedded live builder exposes editing controls without machine keys", async (t) => {
  const { harness } = await mountBuilder(t, { routes: questionnaireRoutes });

  for (const id of [
    "page-title",
    "page-intro",
    "question-label",
    "question-type",
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
    "condition-field",
    "condition-value",
    "Questionnaire JSON",
    "Option 1 value",
  ]) {
    assert.equal(harness.maybeControl(id), undefined, `${id} should be hidden`);
  }

  const renderedText = text(harness.tree);
  assert.equal(
    renderedText.includes("Choose a questionnaire to add or edit pages and questions"),
    false,
    "the questionnaire builder instruction banner should not be rendered",
  );
  assert.ok(
    renderedText.includes("Questionnaire settings · title, visa type and version"),
    "questionnaire settings should be visible",
  );
  for (const label of [
    "Advanced JSON",
  ]) {
    assert.equal(renderedText.includes(label), false, `${label} should be hidden`);
  }

  for (const label of [
    "Required answer",
    "Answer choices",
    "Show this question conditionally",
    "Follow-up wording",
  ]) {
    assert.ok(renderedText.includes(label), `${label} should be available`);
  }

  assert.equal(harness.button("Add questionnaire").props.disabled, false);
  assert.equal(harness.button("Copy as draft").props.disabled, false);
  assert.equal(harness.control("Add page").props.disabled, false);
  assert.equal(harness.control("Delete page").props.disabled, false);
  assert.equal(harness.control("Delete question").props.disabled, false);
  assert.equal(harness.control("Move page up").props.disabled, true, "first page cannot move up");
  assert.equal(harness.control("Move page down").props.disabled, true, "single page cannot move down");
  assert.equal(harness.control("Move question up").props.disabled, true, "first question cannot move up");
  assert.equal(harness.control("Move question down").props.disabled, false, "first question can move down");
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

  harness.button("Copy as draft").props.onClick();
  harness.render();

  assert.equal(harness.control("questionnaire-title").props.value, "Rich questionnaire — Draft");
  assert.ok(text(harness.tree).includes("Draft copy created"));
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
  assert.equal(submitted.title, "Rich questionnaire — Draft");
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

test("Add questionnaire copies an existing questionnaire into a separate draft", async (t) => {
  const definition = richDefinition();
  const original = structuredClone(definition);
  const { harness, calls, storedDefinitions } = await mountBuilder(t, {
    definition,
    routes: questionnaireRoutes,
  });

  harness.button("Add questionnaire").props.onClick();
  harness.render();
  assert.ok(harness.control("new-questionnaire-source"));
  assert.equal(harness.control("new-questionnaire-source").props.value, `saved:${definition.id}`);
  assert.equal(harness.control("new-questionnaire-visa-type").props.value, "482");
  harness.control("new-questionnaire-name").props.onChange({ target: { value: "Revised 482 questionnaire" } });
  harness.render();

  await harness.button("Create questionnaire").props.onClick();
  harness.render();
  assert.equal(harness.control("questionnaire-title").props.value, "Revised 482 questionnaire");
  assert.ok(text(harness.tree).includes("Working copy created"));
  assert.equal(calls.some(({ options }) => options.method === "POST"), false);
  assert.deepEqual(definition, original);

  await harness.button("Save").props.onClick();
  harness.render();
  const post = calls.find(({ url, options }) => url === "/api/questionnaire-definitions" && options.method === "POST");
  assert.ok(post);
  const submitted = JSON.parse(post.options.body);
  assert.notEqual(submitted.id, definition.id);
  assert.equal(submitted.status, "draft");
  assert.equal(submitted.title, "Revised 482 questionnaire");
  assert.deepEqual(submitted.pages, definition.pages);
  assert.equal(storedDefinitions.find((item) => item.id === definition.id).status, "active");
  assert.equal(storedDefinitions.find((item) => item.id === submitted.id).status, "draft");
});

test("Add questionnaire is also available in the proposed layout", async (t) => {
  const { harness } = await mountBuilder(t, { initialLayout: "proposed" });
  harness.button("Add questionnaire").props.onClick();
  harness.render();
  assert.ok(harness.control("new-questionnaire-source"));
});

test("a copied test can add and delete registered pages and questions while keeping machine keys hidden", async (t) => {
  const definition = richDefinition();
  const { harness } = await mountBuilder(t, {
    definition,
    routes: questionnaireRoutes,
  });

  harness.button("Copy as draft").props.onClick();
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

test("a live questionnaire can add pages, add questions, edit them, and delete them directly", async (t) => {
  const definition = richDefinition();
  const { harness, calls } = await mountBuilder(t, {
    definition,
    routes: questionnaireRoutes,
  });

  // 1. Add page
  assert.equal(harness.control("Add page").props.disabled, false);
  harness.control("Add page").props.onClick();
  harness.render();
  assert.ok(text(harness.tree).includes("Health details"));
  assert.ok(text(harness.tree).includes("2 total"));

  // 2. Add question to the new page
  assert.equal(harness.button("Add question").props.disabled, false);
  harness.button("Add question").props.onClick();
  harness.render();
  assert.ok(text(harness.tree).includes("New question"));

  // 3. Edit question label and type
  const labelInput = harness.control("question-label");
  labelInput.props.onChange({ target: { value: "Updated Custom Question" } });
  harness.render();
  assert.ok(text(harness.tree).includes("Updated Custom Question"));

  const typeSelect = harness.control("question-type");
  assert.equal(typeSelect.props.disabled, false);
  typeSelect.props.onChange({ target: { value: "textarea" } });
  harness.render();

  // 4. Delete question
  assert.equal(harness.control("Delete question").props.disabled, false);
  harness.control("Delete question").props.onClick();
  harness.render();
  assert.equal(text(harness.tree).includes("Updated Custom Question"), false);

  // 5. Delete page
  assert.equal(harness.control("Delete page").props.disabled, false);
  harness.control("Delete page").props.onClick();
  harness.render();
  assert.equal(text(harness.tree).includes("Health details"), false);
  assert.ok(text(harness.tree).includes("1 total"));
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
  assert.equal(
    text(harness.tree).includes("Questionnaire saved. Changes are now available to clients."),
    false,
    "saving should not render the questionnaire success banner",
  );

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

test("CRM synchronization panel writes metadata.crm without dropping other metadata", async (t) => {
  const definition = richDefinition();
  definition.status = "draft";
  const { harness, calls } = await mountBuilder(t, { definition, embeddedInMatter: false });

  await chooseRowAction(harness, /^(Edit in classic layout|Use template (classic layout))$/);
  harness.render();
  harness.control("Edit Original question text?").props.onClick();
  harness.render();
  assert.ok(harness.control("crm-mode"), "Expected the CRM synchronization control");
  harness.control("crm-mode").props.onChange({ target: { value: "portal_only" } });
  harness.render();
  await harness.button("Save changes").props.onClick();

  const saveCall = calls.find(({ url, options }) =>
    url === "/api/questionnaire-definitions/rich-questionnaire" && options.method === "PUT"
  );
  assert.ok(saveCall, "Expected CRM mapping to be saved");
  const savedQuestion = JSON.parse(saveCall.options.body).pages[0].questions[0];
  assert.equal(savedQuestion.metadata.crm.mode, "portal_only");
  assert.equal(savedQuestion.metadata.analyticsName, "identity_question");
});

test("the questionnaire library opens from the complete list payload without a duplicate detail request", async (t) => {
  const { calls } = await mountBuilder(t, {
    definition: richDefinition(),
    embeddedInMatter: false,
  });

  assert.deepEqual(
    calls
      .filter(({ options }) => !options.method)
      .map(({ url }) => url),
    ["/api/questionnaire-definitions"],
  );
});

test("the proposed questionnaire layout can be presented without removing the current layout", async (t) => {
  const { harness, replacedUrls } = await mountBuilder(t, {
    embeddedInMatter: false,
    routes: questionnaireRoutes,
  });

  await chooseRowAction(harness, /^(Edit|Use template)$/);
  harness.render();

  assert.equal(harness.button("Proposed layout").props["aria-pressed"], true);
  assert.equal(replacedUrls.at(-1), "/admin/questionnaires?layout=proposed");
  assert.ok(text(harness.tree).includes("Design preview."));
  assert.ok(text(harness.tree).includes("1 section"));
  assert.equal(
    harness.maybeControl("questionnaire-page-group"),
    undefined,
    "the client-style stepper should replace the current group dropdown only in the proposed view"
  );

  harness.button("Current layout").props.onClick();
  harness.render();

  assert.equal(harness.button("Current layout").props["aria-pressed"], true);
  assert.equal(replacedUrls.at(-1), "/admin/questionnaires?layout=current");
  assert.ok(
    harness.control("questionnaire-page-group"),
    "the existing questionnaire group dropdown should remain available in the current view"
  );
  assert.equal(text(harness.tree).includes("Design preview."), false);
});

test("the matter builder switches between its questionnaire list and the new layout", async (t) => {
  const { harness, replacedUrls } = await mountBuilder(t, { routes: questionnaireRoutes });

  assert.ok(harness.control("embedded-questionnaire-page-group"));
  harness.button("Proposed layout").props.onClick();
  harness.render();

  assert.equal(replacedUrls.at(-1), "/matter/app-123/questionnaire-builder?layout=proposed");
  assert.ok(text(harness.tree).includes("Design preview."));
  assert.equal(harness.maybeControl("embedded-questionnaire-page-group"), undefined);

  harness.button("Visa questionnaires").props.onClick();
  harness.render();

  assert.equal(replacedUrls.at(-1), "/matter/app-123/questionnaire-builder?layout=proposed&view=list");
  assert.ok(rowActionToggles(harness).length, "Expected the questionnaire list with row actions");
  assert.equal(harness.maybeControl("embedded-questionnaire-page-group"), undefined);
  assert.equal(text(harness.tree).includes("Design preview."), false);

  await chooseRowAction(harness, /^(Edit|Use template)$/);
  harness.render();
  assert.equal(replacedUrls.at(-1), "/matter/app-123/questionnaire-builder?layout=proposed");
  assert.ok(text(harness.tree).includes("Design preview."));

  harness.button("Current layout").props.onClick();
  harness.render();
  harness.button("Visa questionnaires").props.onClick();
  harness.render();
  assert.equal(replacedUrls.at(-1), "/matter/app-123/questionnaire-builder?layout=current&view=list");
  assert.ok(rowActionToggles(harness).length, "Expected the questionnaire list with row actions");
  await chooseRowAction(harness, /^(Edit in classic layout|Use template (classic layout))$/);
  harness.render();
  assert.equal(replacedUrls.at(-1), "/matter/app-123/questionnaire-builder?layout=current");
  assert.ok(harness.control("embedded-questionnaire-page-group"));
});

test("a matter questionnaire list link opens the list directly", async (t) => {
  const { harness } = await mountBuilder(t, { initialLayout: "proposed", initialView: "list" });
  assert.ok(rowActionToggles(harness).length, "Expected the questionnaire list with row actions");
  assert.equal(text(harness.tree).includes("Design preview."), false);
});

test("creating a questionnaire from the matter list returns to the selected editor layout", async (t) => {
  const { harness, replacedUrls } = await mountBuilder(t, {
    initialLayout: "proposed",
    initialView: "list",
  });
  harness.button("Add questionnaire").props.onClick();
  harness.render();
  assert.ok(harness.control("new-questionnaire-source"));
  await harness.button("Create questionnaire").props.onClick();
  harness.render();

  assert.ok(text(harness.tree).includes("Design preview."));
  assert.equal(replacedUrls.at(-1), "/matter/app-123/questionnaire-builder?layout=proposed");
});

test("returning to the list keeps unsaved changes when discard is cancelled", async (t) => {
  const { harness, replacedUrls } = await mountBuilder(t, { confirm: () => false });
  harness.button("Proposed layout").props.onClick();
  harness.render();
  harness.control("Edit section title and description").props.onClick();
  harness.render();
  harness.control("proposed-page-intro").props.onChange({ target: { value: "Unsaved description " } });
  harness.render();
  harness.button("Visa questionnaires").props.onClick();
  harness.render();

  assert.ok(text(harness.tree).includes("Design preview."));
  assert.equal(harness.control("proposed-page-intro").props.value, "Unsaved description ");
  assert.equal(replacedUrls.at(-1), "/matter/app-123/questionnaire-builder?layout=proposed");
});

test("the proposed section description keeps spaces while typing", async (t) => {
  const { harness, calls } = await mountBuilder(t, { routes: questionnaireRoutes });
  harness.button("Proposed layout").props.onClick();
  harness.render();
  harness.control("Edit section title and description").props.onClick();
  harness.render();

  const original = harness.control("proposed-page-intro").props.value;
  harness.control("proposed-page-intro").props.onChange({ target: { value: `${original} new ` } });
  harness.render();
  assert.equal(harness.control("proposed-page-intro").props.value, `${original} new `);
  harness.control("proposed-page-intro").props.onChange({ target: { value: `${original} new words` } });
  harness.render();
  assert.equal(harness.control("proposed-page-intro").props.value, `${original} new words`);

  await harness.button("Save changes").props.onClick();
  const saved = calls.find(({ options }) => options.method === "PUT");
  assert.ok(saved);
  assert.equal(JSON.parse(saved.options.body).pages[0].introBlocks[0].text, `${original} new words`);
});

test("the proposed layout edits Getting Started and Included Applicants workflow copy", async (t) => {
  const workflowDefinition = {
    schemaVersion: 1,
    id: "workflow-questionnaire",
    title: "Workflow questionnaire",
    version: "1.0.0",
    visaType: "temporary-work",
    visaContexts: ["482"],
    status: "active",
    revision: 1,
    pages: getQuestionnaireWorkflowPages("temporary-work").map((page, index) => ({
      ...page,
      order: (index + 1) * 10,
    })),
  };
  const { harness, calls } = await mountBuilder(t, {
    definition: workflowDefinition,
    embeddedInMatter: false,
    routes: [
      { href: "/intake/temporary-work/start", title: "Getting Started" },
      { href: "/intake/temporary-work/profile", title: "Included Applicants" },
    ],
  });

  await chooseRowAction(harness, /^(Edit|Use template)$/);
  harness.render();
  harness.control("Edit section title and description").props.onClick();
  harness.render();
  harness.control("workflow-intro-0").props.onChange({ target: { value: "Updated welcome copy." } });
  harness.render();
  assert.equal(harness.control("workflow-intro-0").props.value, "Updated welcome copy.");

  harness.buttonMatching(/Included Applicants/).props.onClick();
  harness.render();
  harness.control("Edit section title and description").props.onClick();
  harness.render();
  harness.control("workflow-list-5-item-0").props.onChange({ target: { value: "Primary visa applicant" } });
  harness.render();
  assert.equal(harness.control("workflow-list-5-item-0").props.value, "Primary visa applicant");

  await harness.button("Save changes").props.onClick();
  const saveCall = calls.find(({ url, options }) =>
    url === "/api/questionnaire-definitions/workflow-questionnaire" && options.method === "PUT"
  );
  assert.ok(saveCall);
  const saved = JSON.parse(saveCall.options.body);
  assert.equal(saved.pages[0].introBlocks[0].text, "Updated welcome copy.");
  assert.equal(saved.pages[1].introBlocks[5].items[0], "Primary visa applicant");
});

test("the proposed layout nests the composite Other Family page under Main Applicant", async (t) => {
  const [start, profile, otherFamily] = getQuestionnaireWorkflowPages("temporary-work");
  const mainPages = ["Details", "Other Names", "Identity", "Contact Details", "Employment"].map((title, index) => ({
    id: `main-${index}`,
    route: `/intake/temporary-work/main-applicant/${title.toLowerCase().replaceAll(" ", "-")}`,
    title,
    sectionKey: `main_${index}`,
    completionKey: `temporary-work/main-applicant/${index}`,
    scope: "profile",
    order: (index + 3) * 10,
    introBlocks: [],
    questions: [],
    metadata: { renderer: "legacy", profileRole: "main_applicant" },
  }));
  const technicalPages = ["Details", "Passport", "Identity Documents", "Other Names", "Citizenship", "Health"].map((title, index) => ({
    id: `other-family-technical-${index}`,
    route: `/intake/temporary-work/non-migrating/member-profile/${index}`,
    title,
    sectionKey: `other_family_${index}`,
    completionKey: `temporary-work/non-migrating/member-profile/${index}`,
    scope: "profile",
    order: (index + 9) * 10,
    introBlocks: [],
    questions: [],
    metadata: { renderer: "legacy", profileRole: "non_migrating", adminHiddenInProposed: true },
  }));
  const definition = {
    schemaVersion: 1,
    id: "nested-other-family-questionnaire",
    title: "Nested Other Family questionnaire",
    version: "1.0.0",
    visaType: "temporary-work",
    visaContexts: ["482"],
    status: "active",
    revision: 1,
    pages: [start, profile, ...mainPages, otherFamily, ...technicalPages].map((page, index) => ({ ...page, order: (index + 1) * 10 })),
  };
  const { harness } = await mountBuilder(t, { definition, embeddedInMatter: false });

  await chooseRowAction(harness, /^(Edit|Use template)$/);
  harness.render();

  const navigation = harness.find((node) => node.type === "nav" && node.props["aria-label"] === "Questionnaire sections");
  const navigationText = text(navigation);
  const navigationLabels = [...walk(navigation)]
    .filter((node) => node.type === "button")
    .map((node) => text(node));
  assert.ok(navigationText.includes("Main applicant"));
  assert.ok(navigationText.includes("Other family"));
  const contactIndex = navigationLabels.findIndex((label) => label.includes("Contact Details"));
  const otherFamilyIndex = navigationLabels.indexOf("Other family");
  const employmentIndex = navigationLabels.findIndex((label) => label.includes("Employment"));
  assert.ok(contactIndex >= 0 && contactIndex < otherFamilyIndex);
  assert.ok(otherFamilyIndex < employmentIndex);
  assert.equal(navigationLabels.some((label) => label.startsWith("Identity Documents")), false, "technical member pages should be hidden from the new layout");

  harness.buttonMatching(/Other Family/).props.onClick();
  harness.render();
  assert.equal(text(harness.find((node) => node.props?.["data-testid"] === "portal-section-title")), "Other Family");
  // The member list is a follow-up of the Yes/No question: summarised under it, not stacked.
  const summary = harness.find((node) => node.props?.["data-testid"] === "follow-up-summary");
  assert.match(text(summary), /If “Yes”→Other family members/);

  harness.control("Edit follow-up Other family members").props.onClick();
  harness.render();
  assert.ok(harness.find((node) => node.props?.["data-testid"] === "follow-up-dialog"));
  const passportTrigger = followUpTreeItem(harness, "Does this person have a current passport?");
  assert.match(text(passportTrigger), /If “Yes”.*Family Name.*Given Names.*Sex.*Date of Birth/, "passport details should be nested under their Yes trigger");
  assert.equal(
    harness.button("Add field for “Yes”").props.disabled,
    true,
    "the original client form keeps its structure locked",
  );
});

test("the proposed layout supports pencil editing and inserts a question between client fields", async (t) => {
  const { harness, calls } = await mountBuilder(t, {
    definition: richDefinition(),
    embeddedInMatter: false,
  });

  await chooseRowAction(harness, /^(Edit|Use template)$/);
  harness.render();

  assert.ok(harness.find((node) => node.props?.["data-testid"] === "portal-style-builder"));
  harness.control("Edit section title and description").props.onClick();
  harness.render();
  harness.control("proposed-page-title").props.onChange({ target: { value: "Client-style identity details" } });
  harness.render();
  assert.ok(text(harness.tree).includes("Client-style identity details"));

  harness.control("Edit Eligibility source").props.onClick();
  harness.render();
  const inlineTitle = harness.control("inline-label-eligibility-internal-id");
  inlineTitle.props.onChange({ target: { value: "Are you eligible?" } });
  harness.render();
  assert.ok(harness.control("Edit Are you eligible?"), "Expected the portal preview to update immediately");

  const insertControl = harness.control("Add content after Are you eligible?");
  assert.match(insertControl.props.className, /group-hover\/insert:opacity-100/);
  assert.equal(text(insertControl), "Add content here");
  insertControl.props.onClick();
  harness.render();
  harness.button("Question").props.onClick();
  harness.render();
  assert.ok(harness.find((node) => node.props?.["data-testid"] === "inline-question-editor"));

  await harness.button("Save changes").props.onClick();
  const saveCall = calls.find(({ url, options }) =>
    url === "/api/questionnaire-definitions/rich-questionnaire" && options.method === "PUT"
  );
  assert.ok(saveCall, "Expected the portal-style builder changes to be saved");
  const savedPage = JSON.parse(saveCall.options.body).pages[0];
  assert.equal(savedPage.title, "Client-style identity details");
  assert.deepEqual(
    savedPage.questions.map((question) => question.label),
    ["Original question text?", "Are you eligible?", "New question", "Record question"],
  );
});

test("the proposed layout exposes visible question and sidebar section creation controls", async (t) => {
  const { harness, calls } = await mountBuilder(t, {
    definition: richDefinition(),
    embeddedInMatter: false,
    routes: [
      ...questionnaireRoutes,
      { href: "/intake/temporary-work/main-applicant/other", title: "Other names" },
    ],
  });

  await chooseRowAction(harness, /^(Edit|Use template)$/);
  harness.render();

  const proposedShell = harness.find((node) =>
    typeof node.props?.className === "string" && node.props.className.includes("questionnaire-proposed-portal")
  );
  assert.match(proposedShell.props.className, /font-normal/);
  assert.match(proposedShell.props.className, /lg:grid-cols-\[320px_minmax\(0,1fr\)\]/);
  const proposedTitle = harness.find((node) => node.props?.["data-testid"] === "portal-section-title");
  assert.match(proposedTitle.props.className, /text-2xl/);
  assert.match(proposedTitle.props.className, /font-semibold/);

  harness.button("Add question").props.onClick();
  harness.render();
  const textPreview = harness.find((node) => node.props?.["data-testid"] === "portal-text-input-preview");
  for (const token of ["h-11", "rounded-md", "border-2", "bg-[#E9F0FE]", "text-base", "md:text-sm"]) {
    assert.ok(textPreview.props.className.includes(token), `Expected Client Portal field token ${token}`);
  }
  const questionType = harness.find((node) =>
    node.type === "select" && String(node.props.id || "").startsWith("inline-type-")
  );
  assert.ok(text(questionType).includes("Repeating list / records"));
  questionType.props.onChange({ target: { value: "radio" } });
  harness.render();
  harness.button("Add choice").props.onClick();
  harness.render();
  assert.ok(harness.control("Inline option 3"), "Expected a new radio option to be editable");

  harness.button("Add question").props.onClick();
  harness.render();
  const repeaterType = harness.find((node) =>
    node.type === "select" && String(node.props.id || "").startsWith("inline-type-")
  );
  repeaterType.props.onChange({ target: { value: "repeater" } });
  harness.render();

  harness.button("Add section here").props.onClick();
  harness.render();
  assert.equal(harness.control("proposed-page-route").props.value, "/intake/temporary-work/main-applicant/other");

  await harness.button("Save changes").props.onClick();
  const saveCall = calls.find(({ url, options }) =>
    url === "/api/questionnaire-definitions/rich-questionnaire" && options.method === "PUT"
  );
  assert.ok(saveCall, "Expected visible creation controls to save through the existing API");
  const saved = JSON.parse(saveCall.options.body);
  const addedRadio = saved.pages[0].questions.at(-2);
  const addedRepeater = saved.pages[0].questions.at(-1);
  assert.equal(addedRadio.type, "radio");
  assert.equal(addedRadio.options.length, 3);
  assert.equal(addedRepeater.type, "repeater");
  assert.equal(addedRepeater.metadata.collection, "array");
  assert.equal(addedRepeater.metadata.fields.length, 1);
  assert.equal(saved.pages[1].route, "/intake/temporary-work/main-applicant/other");
});

test("the proposed inline editor can delete a newly added question", async (t) => {
  const { harness, calls } = await mountBuilder(t, {
    definition: richDefinition(),
    embeddedInMatter: false,
  });

  await chooseRowAction(harness, /^(Edit|Use template)$/);
  harness.render();
  harness.button("Add question").props.onClick();
  harness.render();

  const deleteControl = harness.control("Delete question");
  assert.match(deleteControl.props.className, /text-red-600/);
  deleteControl.props.onClick();
  harness.render();

  assert.equal(
    harness.nodes().some((node) => node.props?.["data-testid"] === "inline-question-editor"),
    false,
    "Expected the inline editor to close after deletion",
  );
  assert.equal(harness.maybeControl("Edit New question"), undefined);

  await harness.button("Save changes").props.onClick();
  const saveCall = calls.find(({ url, options }) =>
    url === "/api/questionnaire-definitions/rich-questionnaire" && options.method === "PUT"
  );
  const savedPage = JSON.parse(saveCall.options.body).pages[0];
  assert.deepEqual(
    savedPage.questions.map((question) => question.label),
    ["Original question text?", "Eligibility source", "Record question"],
  );
});

test("the questionnaire list row menu reactivates an inactive questionnaire and makes the active one inactive", async (t) => {
  const live = { ...richDefinition(), id: "live-482", title: "Live 482", status: "active", revision: 3 };
  const backup = { ...richDefinition(), id: "backup-482", title: "Inactive 482", status: "archived", revision: 2 };
  const confirmations = [];
  const { harness, calls, storedDefinitions } = await mountBuilder(t, {
    definition: live,
    extraDefinitions: [backup],
    initialLayout: "proposed",
    initialView: "list",
    confirm: (message) => { confirmations.push(message); return true; },
  });

  // The active questionnaire offers Edit and Delete, but not Make active.
  harness.control("Actions for Live 482").props.onClick();
  harness.render();
  assert.ok(harness.buttonMatching(/^Edit$/));
  assert.ok(harness.buttonMatching(/^Delete$/));
  assert.equal(harness.nodes().some((node) => node.type === "button" && /make active|reactivate/i.test(text(node))), false);

  // Opening another row's menu closes the first; the inactive questionnaire can be reactivated.
  harness.control("Actions for Inactive 482").props.onClick();
  harness.render();
  await harness.buttonMatching(/^Reactivate$/).props.onClick();
  harness.render();

  const patch = calls.find((call) => call.options.method === "PATCH");
  assert.equal(patch.url, "/api/questionnaire-definitions/backup-482");
  assert.deepEqual(JSON.parse(patch.options.body), { status: "active", revision: 2 });
  assert.match(confirmations.at(-1), /Reactivate this questionnaire/);
  assert.equal(storedDefinitions.find((item) => item.id === "backup-482").status, "active");
  assert.equal(storedDefinitions.find((item) => item.id === "live-482").status, "archived");
  assert.ok(text(harness.tree).includes("is now active"));
  // Stage badges: Active / Inactive.
  const badges = harness.nodes().filter((node) => node.type === "span" && ["Active", "Inactive", "Draft"].includes(text(node))).map(text);
  assert.ok(badges.includes("Active") && badges.includes("Inactive"));
});

test("a draft can be made live from the list row menu", async (t) => {
  const draft = { ...richDefinition(), id: "draft-482", title: "Draft 482", status: "draft", revision: 4 };
  const { harness, calls } = await mountBuilder(t, { definition: draft, initialLayout: "proposed", initialView: "list" });
  harness.control("Actions for Draft 482").props.onClick();
  harness.render();
  await harness.buttonMatching(/^Make active$/).props.onClick();
  const patch = calls.find((call) => call.options.method === "PATCH");
  assert.deepEqual(JSON.parse(patch.options.body), { status: "active", revision: 4 });
});

test("Add content here inserts headings and explanatory text that save in client order", async (t) => {
  const confirmations = [];
  const { harness, calls } = await mountBuilder(t, {
    definition: richDefinition(),
    embeddedInMatter: false,
    confirm: (message) => { confirmations.push(message); return true; },
  });
  await chooseRowAction(harness, /^(Edit|Use template)$/);
  harness.render();

  // Heading at the very start of the section.
  harness.control("Add content at the beginning of this section").props.onClick();
  harness.render();
  assert.ok(harness.button("Heading") && harness.button("Explanatory text") && harness.button("Question"));
  harness.button("Heading").props.onClick();
  harness.render();
  const headingEditor = harness.find((node) => node.props?.["data-testid"] === "content-item-editor");
  assert.ok(headingEditor, "a new heading opens its editor");
  const headingInput = harness.nodes().find((node) => node.type === "input" && String(node.props.id || "").startsWith("content-item-"));
  headingInput.props.onChange({ target: { value: "Personal Information" } });
  harness.render();
  assert.ok(harness.nodes().some((node) => node.props?.["data-testid"] === "portal-content-heading" && text(node) === "Personal Information"));

  // Explanatory text after "Eligibility source" (and the question it controls), then move it
  // one place earlier and back again.
  harness.control("Add content after Eligibility source").props.onClick();
  harness.render();
  harness.button("Explanatory text").props.onClick();
  harness.render();
  const textInput = harness.nodes().find((node) => node.type === "textarea" && String(node.props.id || "").startsWith("content-item-"));
  textInput.props.onChange({ target: { value: "Enter names exactly as shown in your passport." } });
  harness.render();
  harness.buttonMatching(/Move earlier/).props.onClick();
  harness.render();
  harness.buttonMatching(/Move later/).props.onClick();
  harness.render();

  // A throw-away heading can be removed again.
  harness.control("Add content after Record question").props.onClick();
  harness.render();
  harness.button("Heading").props.onClick();
  harness.render();
  harness.buttonMatching(/^Remove heading$/).props.onClick();
  harness.render();
  assert.match(confirmations.at(-1), /Remove the heading/);

  await harness.button("Save changes").props.onClick();
  const saveCall = calls.find(({ url, options }) => url === "/api/questionnaire-definitions/rich-questionnaire" && options.method === "PUT");
  assert.ok(saveCall, "Expected the content items to be saved");
  const saved = JSON.parse(saveCall.options.body).pages[0].questions;
  assert.deepEqual(
    saved.map((item) => (["heading", "paragraph"].includes(item.type) ? `${item.type}:${item.label}` : item.label)),
    ["heading:Personal Information", "Original question text?", "Eligibility source", "paragraph:Enter names exactly as shown in your passport.", "Record question"],
  );
  for (const item of saved.filter((entry) => ["heading", "paragraph"].includes(entry.type))) {
    assert.equal(item.answerKey, undefined, "display content never has an answerKey");
    assert.equal(item.required, undefined);
    assert.equal(item.options, undefined);
  }
  assert.deepEqual(
    saved.filter((item) => item.answerKey).map((item) => item.answerKey),
    ["answer_key_internal", "eligibility_internal", "records_internal"],
    "existing answer keys are untouched",
  );
});

// Shape of the spouse/partner "Other Personal Details" page once certified for the dynamic form.
function otherPersonalDetailsDefinition() {
  const yesNo = [{ value: "yes", label: "Yes" }, { value: "no", label: "No" }];
  const onYes = (field) => [{ field, op: "equals", value: "yes" }];
  return {
    schemaVersion: 1,
    id: "spouse-other-details",
    title: "Spouse other details",
    version: "1.0.0",
    visaType: "temporary-work",
    visaContexts: ["482"],
    status: "draft",
    revision: 2,
    pages: [{
      id: "spouse-other",
      title: "Other Personal Details",
      route: "/intake/temporary-work/spouse-partner/other-details",
      sectionKey: "temporary_work_spouse_other",
      completionKey: "temporary-work/spouse-partner/other-details",
      scope: "profile",
      order: 10,
      introBlocks: [],
      metadata: { dynamicParity: "certified", profileRole: "spouse" },
      questions: [
        { id: "has_other_names", answerKey: "has_other_names", label: "Have you ever had another name?", type: "yesNo", required: true, options: yesNo },
        {
          id: "other_names",
          answerKey: "other_names",
          label: "Other Names",
          type: "repeater",
          required: false,
          visibleIf: onYes("has_other_names"),
          metadata: {
            collection: "array",
            fields: [
              { id: "other_names-family_name", answerKey: "family_name", label: "Family Name", type: "text", required: true },
              { id: "other_names-has_evidence", answerKey: "has_evidence", label: "Do you have identity documents for this name?", type: "yesNo", required: false, options: yesNo },
              { id: "other_names-evidence_type", answerKey: "evidence_type", label: "Evidence Type", type: "select", required: false, options: [{ value: "Marriage Certificate", label: "Marriage Certificate" }], visibleIf: onYes("has_evidence") },
            ],
          },
        },
        { id: "use_chinese_code", answerKey: "use_chinese_code", label: "Do you use a Chinese Commercial Code?", type: "yesNo", required: true, options: yesNo },
        { id: "chinese_code", answerKey: "chinese_code", label: "Chinese Commercial Code", type: "text", required: false, visibleIf: onYes("use_chinese_code") },
        { id: "other_spelling", answerKey: "other_spelling", label: "Is your name spelt differently anywhere?", type: "radio", required: false, options: yesNo },
      ],
    }],
  };
}

async function openOtherPersonalDetails(t) {
  const mounted = await mountBuilder(t, { definition: otherPersonalDetailsDefinition(), embeddedInMatter: false });
  await chooseRowAction(mounted.harness, /^(Edit|Use template)$/);
  mounted.harness.render();
  return mounted;
}

function savedQuestionnairePage(calls) {
  const saveCall = calls.find(({ url, options }) =>
    url === "/api/questionnaire-definitions/spouse-other-details" && options.method === "PUT");
  assert.ok(saveCall, "Expected the follow-up changes to be saved");
  return JSON.parse(saveCall.options.body).pages[0];
}

test("the proposed layout summarises follow-ups and edits them in one dialog", async (t) => {
  const { harness, calls } = await openOtherPersonalDetails(t);

  // The canvas lists follow-ups under their trigger instead of stacking their full previews.
  const summaries = harness.nodes().filter((node) => node.props?.["data-testid"] === "follow-up-summary");
  assert.deepEqual(summaries.map(text).map((value) => value.match(/If “Yes”→[^·]+/)?.[0]), [
    "If “Yes”→Other Names",
    "If “Yes”→Chinese Commercial Code",
  ]);
  assert.equal(harness.maybeControl("Edit Other Names"), undefined, "follow-ups are no longer stacked on the canvas");

  // The pencil on a trigger opens the dialog with every answer as a branch.
  harness.control("Edit Have you ever had another name?").props.onClick();
  harness.render();
  assert.ok(harness.find((node) => node.props?.["data-testid"] === "follow-up-dialog"));
  assert.equal(harness.maybeControl("inline-question-editor"), undefined);
  const branches = harness.nodes().filter((node) => node.props?.["data-testid"] === "follow-up-branch").map(text);
  assert.match(branches[0], /^If “Yes”Other Names/);
  assert.match(branches[1], /^If “No”Add question for “No”$/);

  // Add a follow-up for "Yes", word it, and move it above Other Names.
  harness.button("Add question for “Yes”").props.onClick();
  harness.render();
  const newLabel = harness.find((node) => node.type === "textarea" && /^inline-label-question-/.test(node.props.id || ""));
  newLabel.props.onChange({ target: { value: "What was your maiden name?" } });
  harness.render();
  assert.match(text(followUpTreeItem(harness, "Have you ever had another name?")), /If “Yes”Other Names.*What was your maiden name\?/);
  harness.button("Move up").props.onClick();
  harness.render();
  assert.match(text(followUpTreeItem(harness, "Have you ever had another name?")), /If “Yes”What was your maiden name\?.*Other Names/);

  // Change which answer shows it: both answers, then only "No".
  harness.control("Show when the answer is No").props.onChange();
  harness.render();
  harness.control("Show when the answer is Yes").props.onChange();
  harness.render();
  assert.match(text(followUpTreeItem(harness, "Have you ever had another name?")), /If “No”What was your maiden name\?/);

  // Record popup fields are part of the same tree, with their own follow-ups.
  harness.control("Edit “Other Names”").props.onClick();
  harness.render();
  const recordFields = harness.find((node) => node.props?.["data-testid"] === "follow-up-record-fields");
  assert.match(text(followUpTreeItem(harness, "Do you have identity documents for this name?")), /If “Yes”Evidence Type/);
  assert.match(text(recordFields), /Family Name/);

  harness.control("Edit “Do you have identity documents for this name?”").props.onClick();
  harness.render();
  harness.button("Add field for “No”").props.onClick();
  harness.render();
  const fieldLabel = harness.find((node) => node.type === "textarea" && /^record-other-names-field.*-label$/.test(node.props.id || ""));
  fieldLabel.props.onChange({ target: { value: "Why not?" } });
  harness.render();
  const fieldType = harness.find((node) => node.type === "select" && /^record-other-names-field.*-type$/.test(node.props.id || ""));
  assert.equal(text(fieldType).includes("Repeating list / records"), false, "record fields cannot hold their own records");
  fieldType.props.onChange({ target: { value: "textarea" } });
  harness.render();

  // A field that reveals others cannot be deleted from under them.
  harness.control("Edit “Do you have identity documents for this name?”").props.onClick();
  harness.render();
  harness.button("Delete field").props.onClick();
  harness.render();
  const dialogAlert = harness.find((node) => node.props?.role === "alert");
  assert.match(text(dialogAlert), /shows Evidence Type, Why not\?/);

  harness.button("Done").props.onClick();
  harness.render();
  assert.equal(harness.nodes().some((node) => node.props?.["data-testid"] === "follow-up-dialog"), false);

  await harness.button("Save changes").props.onClick();
  const page = savedQuestionnairePage(calls);
  assert.deepEqual(page.questions.map((question) => question.answerKey), [
    "has_other_names", page.questions[1].answerKey, "other_names", "use_chinese_code", "chinese_code", "other_spelling",
  ]);
  const added = page.questions[1];
  assert.equal(added.label, "What was your maiden name?");
  assert.deepEqual(added.visibleIf, [{ field: "has_other_names", op: "equals", value: "no" }]);
  const fields = page.questions.find((question) => question.answerKey === "other_names").metadata.fields;
  assert.deepEqual(fields.map((field) => field.answerKey), ["family_name", "has_evidence", "evidence_type", "new_field"]);
  assert.equal(fields[3].label, "Why not?");
  assert.equal(fields[3].type, "textarea");
  assert.deepEqual(fields[3].visibleIf, [{ field: "has_evidence", op: "equals", value: "no" }]);
});

test("a choice question without follow-ups offers to add one from the canvas", async (t) => {
  const { harness, calls } = await openOtherPersonalDetails(t);

  // Only the radio question has no follow-ups yet, so it is the one offering to add them.
  harness.button("Add follow-up question").props.onClick();
  harness.render();
  assert.equal(
    text(harness.find((node) => node.props?.id === "follow-up-dialog-title")),
    "Is your name spelt differently anywhere?",
  );
  harness.button("Add question for “Yes”").props.onClick();
  harness.render();
  harness.button("Done").props.onClick();
  harness.render();

  const summaries = harness.nodes().filter((node) => node.props?.["data-testid"] === "follow-up-summary");
  assert.match(text(summaries.at(-1)), /^1 follow-up question.*If “Yes”→New follow-up question/);

  await harness.button("Save changes").props.onClick();
  const page = savedQuestionnairePage(calls);
  const added = page.questions.at(-1);
  assert.equal(page.questions.at(-2).answerKey, "other_spelling", "the follow-up is placed right after its trigger");
  assert.equal(added.label, "New follow-up question");
  assert.deepEqual(added.visibleIf, [{ field: "other_spelling", op: "equals", value: "yes" }]);
});
