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
const navigation = {
  params: { matterId: "app-123" },
  pathname: "/matter/app-123/questionnaire-builder",
  replacements: [],
  router: {
    replace(href) { navigation.replacements.push(href); },
    push() {},
  },
};

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

async function loadComponent(relativePath, overrides = {}) {
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
    if (specifier in overrides) return overrides[specifier];
    if (specifier === "react") return hooks;
    if (specifier === "next/link") return { __esModule: true, default: "a" };
    if (specifier === "next/navigation") return {
      useParams: () => navigation.params,
      usePathname: () => navigation.pathname,
      useRouter: () => navigation.router,
    };
    if (specifier === "lucide-react") return icons;
    if (specifier === "@/components/ui/button") return { Button: "button" };
    if (specifier === "@/components/admin/AdminLogoutButton") {
      return { __esModule: true, default: () => React.createElement("button", null, "Sign out") };
    }
    if (specifier === "@/components/admin/AdminSessionMonitor") {
      return { __esModule: true, default: () => null };
    }
    if (specifier === "@/lib/visaDisplay") {
      return { formatVisaApplicationType: () => "Subclass 186" };
    }
    return require(specifier);
  };
  componentModule._compile(code, filename);
  return componentModule.exports;
}

function* walk(node) {
  if (Array.isArray(node)) {
    for (const child of node) yield* walk(child);
  } else if (React.isValidElement(node)) {
    yield node;
    yield* walk(node.props.children);
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
  };
}

async function flushEffects(harness) {
  for (const effect of harness.effects.splice(0)) effect();
  await new Promise((resolve) => setImmediate(resolve));
  harness.render();
}

test("matter header keeps navigation in three local tabs without dashboard links", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  navigation.params = { matterId: "app-123" };
  navigation.pathname = "/matter/app-123/questionnaire-builder";
  navigation.replacements = [];
  let fetchCalls = 0;
  globalThis.window = {
    scrollY: 0,
    addEventListener() {},
    removeEventListener() {},
  };
  globalThis.fetch = async (url) => {
    fetchCalls += 1;
    assert.equal(url, "/api/matter/app-123");
    return {
      async json() {
        return {
          success: true,
          application: {
            id: "app-123",
            zohoId: "deal-123",
            reference: "Client matter",
            type: "Employer Nomination Scheme (Subclass 186)",
          },
          percentage: 31,
        };
      },
    };
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
    globalThis.window = originalWindow;
  });

  const { default: MatterLayout } = await loadComponent("src/app/matter/[matterId]/layout.js");
  const harness = createHarness(MatterLayout, { children: React.createElement("div", null, "Matter content") });
  harness.render();
  await flushEffects(harness);

  const links = [...walk(harness.tree)]
    .filter((node) => node.type === "a")
    .map((node) => ({
      label: text(node),
      href: node.props.href,
      current: node.props["aria-current"],
    }));

  assert.deepEqual(links, [
    { label: "Client answers", href: "/matter/app-123/questionnaire", current: undefined },
    { label: "Resources", href: "/matter/app-123/resources", current: undefined },
    { label: "Questionnaire builder", href: "/matter/app-123/questionnaire-builder", current: "page" },
  ]);
  assert.equal(links.some(({ label }) => label === "Dashboard" || label === "Questionnaires"), false);
  assert.deepEqual(navigation.replacements, []);

  navigation.pathname = "/matter/app-123/resources";
  harness.render();
  for (const effect of harness.effects.splice(0)) effect();
  await new Promise((resolve) => setImmediate(resolve));
  harness.render();

  const linksAfterTabChange = [...walk(harness.tree)].filter((node) => node.type === "a");
  assert.equal(fetchCalls, 1, "changing matter tabs must reuse the loaded matter");
  assert.equal(text(harness.tree).includes("Loading matter data..."), false);
  assert.equal(
    linksAfterTabChange.find((node) => text(node) === "Resources")?.props["aria-current"],
    "page",
  );
});

test("matter questionnaire-builder page renders the shared builder in embedded mode", async () => {
  function BuilderSentinel() {
    return null;
  }
  const pageModule = await loadComponent("src/app/matter/[matterId]/questionnaire-builder/page.js", {
    "@/components/admin/AdminQuestionnaireBuilder": {
      __esModule: true,
      default: BuilderSentinel,
    },
  });

  const page = pageModule.default();
  assert.equal(page.type, BuilderSentinel);
  assert.equal(page.props.embeddedInMatter, true);
});
