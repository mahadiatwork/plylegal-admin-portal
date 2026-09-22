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
    if (specifier === "@/lib/routes") {
      return { getRegisteredQuestionnaireRoutes: () => [] };
    }
    if (specifier === "@/lib/questionnaireStarterTemplates") {
      return { temporaryWork482Definition: starterDefinition };
    }
    if (specifier === "@/lib/questionnaireBuiltIns") {
      return { questionnaireBuiltInTemplates: [] };
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
              { field: "eligibility_internal", op: "equals", value: "yes" },
              { field: "eligibility_internal", op: "notEquals", value: "no" },
            ],
            followUps: [
              {
                id: "follow-up-internal-id",
                answerKey: "follow_up_internal_key",
                label: "Original follow-up text",
                type: "textarea",
                required: false,
                description: "Follow-up help",
                placeholder: "Follow-up placeholder",
                rows: 4,
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
              { value: "yes", label: "Yes" },
              { value: "no", label: "No" },
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
                  type: "text",
                  required: false,
                  description: "Record field help",
                  placeholder: "Record field placeholder",
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

async function mountBuilder(t) {
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  const definition = richDefinition();
  const calls = [];
  globalThis.window = {
    addEventListener() {},
    removeEventListener() {},
    confirm: () => true,
  };
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    if (url === "/api/questionnaire-definitions" && !options.method) {
      return jsonResponse({ definitions: [definition] });
    }
    if (url === "/api/questionnaire-definitions/rich-questionnaire" && !options.method) {
      return jsonResponse({ definition });
    }
    if (url === "/api/questionnaire-definitions/rich-questionnaire" && options.method === "PUT") {
      return jsonResponse({ definition: JSON.parse(options.body) });
    }
    assert.fail(`Unexpected request: ${options.method || "GET"} ${url}`);
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
    globalThis.window = originalWindow;
  });

  const harness = createHarness(AdminQuestionnaireBuilder, { embeddedInMatter: true });
  harness.render();
  await flushEffects(harness);
  return { harness, calls, definition };
}

test("embedded builder exposes only the simple page and question wording controls", async (t) => {
  const { harness } = await mountBuilder(t);

  for (const id of [
    "page-title",
    "page-intro",
    "question-label",
    "question-description",
    "question-placeholder",
  ]) {
    assert.ok(harness.maybeControl(id), `${id} should remain editable`);
  }

  for (const id of [
    "questionnaire-title",
    "questionnaire-version",
    "questionnaire-id",
    "questionnaire-visa-type",
    "questionnaire-contexts",
    "page-id",
    "page-route",
    "page-section",
    "page-completion",
    "page-scope",
    "question-id",
    "question-key",
    "question-type",
    "condition-field",
    "condition-operator",
    "condition-value",
    "Questionnaire JSON",
    "Option 1 value",
    "Option 1 label",
  ]) {
    assert.equal(harness.maybeControl(id), undefined, `${id} should be hidden`);
  }

  const renderedText = text(harness.tree);
  for (const label of [
    "Questionnaire settings · title, visa type and version",
    "Required answer",
    "Answer options",
    "Show this question conditionally",
    "Record field wording",
    "Follow-up wording",
    "Advanced JSON",
  ]) {
    assert.equal(renderedText.includes(label), false, `${label} should be hidden`);
  }

  for (const label of [
    "Add page",
    "Add question",
    "Move page up",
    "Move page down",
    "Delete page",
    "Move question up",
    "Move question down",
    "Delete question",
    "Delete questionnaire",
  ]) {
    assert.equal(harness.maybeControl(label), undefined, `${label} should be hidden`);
  }

  assert.equal(
    harness.nodes().some((node) =>
      node.type === "p" && ["answer_key_internal", "radio"].includes(text(node))
    ),
    false,
    "machine keys and question types should not be shown as question details",
  );
  assert.ok(renderedText.includes("Page details"));
  assert.ok(renderedText.includes("Question 1"));

  harness.find(
    (node) => node.type === "button" && text(node).includes("Record question"),
    "Expected the record question selector",
  ).props.onClick();
  harness.render();
  assert.equal(harness.maybeControl("record-record-field-internal-id-label"), undefined);
  assert.equal(text(harness.tree).includes("Record field wording"), false);
});

test("simple wording edits preserve hidden questionnaire structure when saved", async (t) => {
  const { harness, calls, definition } = await mountBuilder(t);
  const originalPage = structuredClone(definition.pages[0]);
  const originalQuestion = structuredClone(originalPage.questions[0]);

  harness.control("page-title").props.onChange({ target: { value: "Updated page title" } });
  harness.control("page-intro").props.onChange({ target: { value: "Updated introduction." } });
  harness.control("question-label").props.onChange({ target: { value: "Updated question text?" } });
  harness.control("question-description").props.onChange({ target: { value: "Updated help text." } });
  harness.control("question-placeholder").props.onChange({ target: { value: "Updated placeholder" } });
  harness.render();

  await harness.button("Save").props.onClick();
  harness.render();

  const saveCall = calls.find(({ url, options }) =>
    url === "/api/questionnaire-definitions/rich-questionnaire" && options.method === "PUT"
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
    "options",
    "visibleIf",
    "followUps",
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
