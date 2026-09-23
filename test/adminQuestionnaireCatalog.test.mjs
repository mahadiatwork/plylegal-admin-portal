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

function makeDefinition({ id, title, visaType, visaContexts = [], updatedAt }) {
  return {
    schemaVersion: 1,
    id,
    title,
    version: "1.0.0",
    visaType,
    visaContexts,
    status: "active",
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
      return { temporaryWork482Definition: builtIns[0] };
    }
    if (specifier === "@/lib/questionnaireBuiltIns") {
      return { questionnaireBuiltInTemplates: builtIns };
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

test("embedded builder shows four visa slots, replaces built-ins with saved definitions, and opens the matter audience", async (t) => {
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

  const visaTitles = builtIns.map((definition) => definition.title);
  const catalogButtons = harness.nodes().filter((node) =>
    node.type === "button" && visaTitles.some((title) => text(node).includes(title))
  );
  assert.equal(catalogButtons.length, 4, "each visa audience should appear exactly once");
  assert.equal(
    text(harness.tree).includes(customDefinition.title),
    false,
    "matter builders should show only the four supported visa questionnaires",
  );
  for (const title of visaTitles) {
    assert.equal(
      catalogButtons.filter((node) => text(node).includes(title)).length,
      1,
      `${title} should have one catalog slot`,
    );
  }

  assert.ok(
    harness.nodes().some((node) =>
      node.type === "h2" && text(node) === "Protection Visa (Subclass 866)"
    ),
    "the matter's questionnaire audience should be selected on first load",
  );
  assert.deepEqual(
    calls.filter(({ url }) => url.startsWith("/api/questionnaire-definitions/")).map(({ url }) => url),
    [],
    "the unsaved Protection slot should open its built-in template without fetching a different saved visa",
  );

  const clickResult = harness.buttonContaining("Skills in Demand Visa (482)").props.onClick();
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
