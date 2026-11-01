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

function makeDefinition({ id, title, visaType, visaContexts = [], updatedAt, status = "active" }) {
  return {
    schemaVersion: 1,
    id,
    title,
    version: "1.0.0",
    visaType,
    visaContexts,
    status,
    revision: 0,
    ...(updatedAt ? { updatedAt } : {}),
    pages: [
      {
        id: `${id}-page`,
        title: "Details",
        route: `/intake/${visaType}/details`,
        sectionKey: `${id}_details`,
        completionKey: `${visaType}/details`,
        scope: "profile",
        order: 10,
        metadata: { renderer: "dynamic" },
        introBlocks: [],
        questions: [],
      },
    ],
  };
}

const builtIns = [
  makeDefinition({ id: "built-in-482", title: "Skills in Demand Visa (482)", visaType: "temporary-work", visaContexts: ["482"] }),
  makeDefinition({ id: "built-in-186", title: "Employer Nomination Visa (186)", visaType: "temporary-work", visaContexts: ["186"] }),
  makeDefinition({ id: "built-in-partner", title: "Partner Visa (Subclass 820)", visaType: "partner" }),
  makeDefinition({ id: "built-in-protection", title: "Protection Visa (Subclass 866)", visaType: "protection" }),
];

const matterContextValue = {
  questionnaireDefinition: builtIns[3],
  matterData: { questionnaireDefinition: builtIns[3] },
  application: { type: "Partner Visa (Subclass 309)" },
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
    if (
      specifier === "@/components/matter/MatterContext" ||
      specifier === "@/components/matter/MatterDataContext"
    ) {
      return {
        useMatter: () => matterContextValue,
        useMatterContext: () => matterContextValue,
        useMatterData: () => matterContextValue,
      };
    }
    if (specifier === "@/lib/routes") {
      return { getRegisteredQuestionnaireRoutes: () => [] };
    }
    if (specifier === "@/lib/questionnaireStarterTemplates") {
      return {
        temporaryWork482Definition: {
          ...builtIns[0],
          id: "legacy-built-in-482",
          title: "Skills in Demand Visa Questionnaire",
        },
      };
    }
    if (specifier === "@/lib/questionnaireBuiltIns") {
      return { questionnaireBuiltInTemplates: builtIns };
    }
    if (specifier === "@/lib/questionnaireLegacyProtection") {
      return { hydrateLegacyQuestionnaireDefinition: (definition) => definition };
    }
    if (specifier === "@/lib/crmFieldCatalog") {
      return {
        CRM_CLEAR_POLICIES: { preserve_when_empty: "preserve_when_empty" },
        CRM_MAPPING_MODES: {
          unconfigured: "unconfigured",
          portal_only: "portal_only",
          field: "field",
        },
        compatibleTransformsFor: () => [],
        listCrmCatalogFields: () => [],
        moduleForCrmTarget: () => "",
      };
    }
    if (specifier === "@/lib/questionnaireCrmContract") {
      return {
        getCrmCoverageSummary: () => ({ mapped: 0, portalOnly: 0, unconfigured: 0 }),
        normalizeCrmMapping: () => null,
      };
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
    buttonContaining(label) {
      const node = this.nodes().find((candidate) =>
        candidate.type === "button" && text(candidate).includes(label)
      );
      assert.ok(node, `Expected a button containing ${label}`);
      return node;
    },
  };
}

async function settle(harness) {
  for (const effect of harness.effects.splice(0)) effect();
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  harness.render();
}

const jsonResponse = (body, status = 200) => ({
  ok: status < 400,
  status,
  text: async () => JSON.stringify(body),
});

test("admin library hides starter templates for saved audiences and never labels a template live", async (t) => {
  const saved482 = makeDefinition({
    id: "saved-482",
    title: "Saved Skills in Demand",
    visaType: "temporary-work",
    visaContexts: ["482"],
  });
  const savedPartner = makeDefinition({
    id: "saved-partner",
    title: "Saved Partner Visa",
    visaType: "partner",
  });
  const partnerDraft = makeDefinition({
    id: "partner-draft",
    title: "Partner Visa test copy",
    visaType: "partner",
    status: "draft",
  });
  const savedProtection = makeDefinition({
    id: "saved-protection",
    title: "Saved Protection Visa",
    visaType: "protection",
  });
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  const calls = [];
  const confirmations = [];
  globalThis.window = {
    addEventListener() {},
    removeEventListener() {},
    confirm: (message) => {
      confirmations.push(message);
      return true;
    },
  };
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    if (url === "/api/questionnaire-definitions" && !options.method) {
      return jsonResponse({
        definitions: [saved482, savedPartner, partnerDraft, savedProtection],
      });
    }
    if (url === "/api/questionnaire-definitions/saved-482?revision=0" && options.method === "DELETE") {
      return jsonResponse({ deletedId: saved482.id });
    }
    assert.fail(`Unexpected request: ${options.method || "GET"} ${url}`);
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
    globalThis.window = originalWindow;
  });

  const harness = createHarness(AdminQuestionnaireBuilder);
  harness.render();
  await settle(harness);
  const pageText = text(harness.tree);
  const statusLabels = harness.nodes()
    .filter((node) => node.type === "span")
    .map((node) => text(node))
    .filter((label) => ["Live", "Template", "Not published"].includes(label));

  assert.equal(pageText.includes("Skills in Demand Visa (482)Built-in starter template"), false);
  assert.equal(pageText.includes("Skills in Demand Visa Questionnaire"), false);
  assert.equal(pageText.includes("Partner Visa (Subclass 820)Built-in starter template"), false);
  assert.equal(pageText.includes("Protection Visa (Subclass 866)Built-in starter template"), false);
  assert.equal(pageText.includes("Employer Nomination Visa (186)Built-in starter template"), true);
  assert.equal(statusLabels.filter((label) => label === "Live").length, 3);
  assert.equal(statusLabels.filter((label) => label === "Template").length, 1);
  assert.equal(statusLabels.filter((label) => label === "Not published").length, 1);

  const saved482Row = harness.nodes().find((node) =>
    node.type === "article" && text(node).includes(saved482.title)
  );
  const builtIn186Row = harness.nodes().find((node) =>
    node.type === "article" && text(node).includes("Employer Nomination Visa (186)")
  );
  assert.ok(saved482Row, "the saved questionnaire should be listed");
  assert.ok(builtIn186Row, "the built-in template should be listed");
  const savedDeleteButton = [...walk(saved482Row)].find((node) =>
    node.type === "button" && text(node) === "Delete"
  );
  const builtInDeleteButton = [...walk(builtIn186Row)].find((node) =>
    node.type === "button" && text(node) === "Delete"
  );
  assert.ok(savedDeleteButton, "saved questionnaires should have a direct delete action");
  assert.equal(builtInDeleteButton, undefined, "built-in templates must not have a delete action");

  const deleteResult = savedDeleteButton.props.onClick();
  if (deleteResult && typeof deleteResult.then === "function") await deleteResult;
  await settle(harness);

  assert.equal(confirmations.length, 1);
  assert.match(confirmations[0], /Saved client answers are not deleted/);
  assert.ok(
    calls.some(({ url, options }) =>
      url === "/api/questionnaire-definitions/saved-482?revision=0" && options.method === "DELETE"
    ),
    "deleting from More should call the secured questionnaire delete endpoint",
  );
  assert.equal(text(harness.tree).includes(saved482.title), false);
  assert.equal(text(harness.tree).includes("Skills in Demand Visa (482)Built-in starter template"), true);
});

test("new questionnaire copies only active saved questionnaires", async (t) => {
  const activeDefinitions = [
    makeDefinition({
      id: "saved-482",
      title: "Skills in Demand Visa (482)",
      visaType: "temporary-work",
      visaContexts: ["482"],
    }),
    makeDefinition({
      id: "saved-186",
      title: "Employer Nomination Visa (186)",
      visaType: "temporary-work",
      visaContexts: ["186"],
    }),
    makeDefinition({
      id: "saved-partner",
      title: "Partner Visa (Subclass 820)",
      visaType: "partner",
    }),
    makeDefinition({
      id: "saved-protection",
      title: "Protection Visa (Subclass 866)",
      visaType: "protection",
    }),
  ];
  const workingCopy = makeDefinition({
    id: "working-copy-186",
    title: "Employer Nomination Visa (186) — working copy",
    visaType: "temporary-work",
    visaContexts: ["186"],
    status: "draft",
  });
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  globalThis.window = {
    addEventListener() {},
    removeEventListener() {},
    confirm: () => true,
  };
  globalThis.fetch = async (url, options = {}) => {
    if (url === "/api/questionnaire-definitions" && !options.method) {
      return jsonResponse({ definitions: [...activeDefinitions, workingCopy] });
    }
    assert.fail(`Unexpected request: ${options.method || "GET"} ${url}`);
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
    globalThis.window = originalWindow;
  });

  const harness = createHarness(AdminQuestionnaireBuilder);
  harness.render();
  await settle(harness);
  harness.buttonContaining("New questionnaire").props.onClick();
  harness.render();

  const matterTypeSelect = harness.nodes().find((node) =>
    node.type === "select" && node.props.id === "new-questionnaire-visa-type"
  );
  assert.ok(matterTypeSelect, "the CRM matter-type selector should be rendered");
  assert.deepEqual(
    [...walk(matterTypeSelect)].filter((node) => node.type === "option").map((option) => text(option)),
    [
      "Partner Visa (Subclass 820)",
      "Skills in Demand (Subclass 482)",
      "Protection Visa (Subclass 866)",
      "Partner Visa (Subclass 309)",
      "Employer Nomination Visa (Subclass 186)",
    ],
  );
  assert.equal(matterTypeSelect.props.value, "309", "the current CRM matter type should be preselected");

  const copySelect = harness.nodes().find((node) =>
    node.type === "select" && [...walk(node)].some((child) =>
      child.type === "option" && String(child.props.value || "").startsWith("saved:")
    )
  );
  assert.ok(copySelect, "the copy-source questionnaire selector should be rendered");
  const copyOptions = [...walk(copySelect)].filter((node) => node.type === "option");

  assert.deepEqual(
    new Set(copyOptions.map((option) => option.props.value)),
    new Set(activeDefinitions.map((definition) => `saved:${definition.id}`)),
  );
  assert.equal(copyOptions.length, 4);
  assert.equal(copySelect.props.value, "saved:saved-partner", "Partner 309 should reuse the Partner 820 source");
  assert.deepEqual(copyOptions.map((option) => text(option)), [
    "Employer Nomination Visa (Subclass 186) · 1 sections",
    "Partner Visa (Subclass 820) · 1 sections",
    "Protection Visa (Subclass 866) · 1 sections",
    "Skills in Demand (Subclass 482) · 1 sections",
  ]);
  const questionnaireName = harness.nodes().find((node) =>
    node.type === "input" && node.props.id === "new-questionnaire-name"
  );
  assert.equal(questionnaireName.props.value, "Partner Visa (Subclass 309) — working copy");
  assert.equal(
    copyOptions.some((option) => option.props.value === `saved:${workingCopy.id}`),
    false,
    "the unpublished working copy must remain saved without becoming a copy source",
  );
  assert.equal(
    copyOptions.some((option) => String(option.props.value || "").startsWith("builtIn:")),
    false,
    "bundled fallbacks must not duplicate active database questionnaires",
  );
});

test("embedded library replaces starter rows with the newest saved questionnaire", async (t) => {
  const saved482Old = makeDefinition({
    id: "saved-482-old",
    title: "Skills in Demand Visa (482)",
    visaType: "temporary-work",
    visaContexts: ["482"],
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
  const saved482 = makeDefinition({
    id: "saved-482-current",
    title: "Skills in Demand Visa (482)",
    visaType: "temporary-work",
    visaContexts: ["482"],
    updatedAt: "2026-09-01T00:00:00.000Z",
  });
  const savedPartner = makeDefinition({
    id: "saved-partner",
    title: "Partner Visa (Subclass 820)",
    visaType: "partner",
    updatedAt: "2026-08-01T00:00:00.000Z",
  });
  const customDefinition = makeDefinition({
    id: "saved-custom",
    title: "Internal custom questionnaire",
    visaType: "custom",
    updatedAt: "2026-08-15T00:00:00.000Z",
  });
  const calls = [];
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  globalThis.window = {
    addEventListener() {},
    removeEventListener() {},
    confirm: () => true,
  };
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    if (url === "/api/questionnaire-definitions" && !options.method) {
      return jsonResponse({ definitions: [saved482Old, savedPartner, customDefinition, saved482] });
    }
    if (url === "/api/questionnaire-definitions/saved-482-current" && !options.method) {
      return jsonResponse({ definition: saved482 });
    }
    assert.fail(`Unexpected request: ${options.method || "GET"} ${url}`);
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
    globalThis.window = originalWindow;
  });

  const harness = createHarness(AdminQuestionnaireBuilder, { embeddedInMatter: true });
  harness.render();
  await settle(harness);

  const rowTitles = harness.nodes()
    .filter((node) => node.type === "h2")
    .map((node) => text(node));
  assert.deepEqual(rowTitles, [
    "Skills in Demand Visa (482)",
    customDefinition.title,
    "Partner Visa (Subclass 820)",
    "Employer Nomination Visa (186)",
    "Protection Visa (Subclass 866)",
  ]);
  assert.equal(rowTitles.filter((title) => title === "Skills in Demand Visa (482)").length, 1);
  assert.equal(rowTitles.filter((title) => title === "Partner Visa (Subclass 820)").length, 1);
  assert.deepEqual(
    calls.filter(({ url }) => url.startsWith("/api/questionnaire-definitions/")).map(({ url }) => url),
    [],
    "loading the catalogue should not fetch a questionnaire body",
  );

  const saved482Row = harness.nodes().find((node) =>
    node.type === "article" && text(node).includes(saved482.title)
  );
  assert.ok(saved482Row, "the newest saved 482 questionnaire should be listed");
  const editButton = [...walk(saved482Row)].find((node) =>
    node.type === "button" && text(node).includes("Edit questions")
  );
  assert.ok(editButton, "the saved questionnaire should remain editable");
  const clickResult = editButton.props.onClick();
  if (clickResult && typeof clickResult.then === "function") await clickResult;
  await settle(harness);

  assert.ok(
    calls.some(({ url }) => url === "/api/questionnaire-definitions/saved-482-current"),
    "the 482 slot should open the newest saved definition instead of creating a duplicate built-in copy",
  );
  assert.equal(
    calls.some(({ url }) => url === "/api/questionnaire-definitions/saved-482-old"),
    false,
    "an older saved definition for the same audience should not become a second slot",
  );
});
