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
    if (specifier === "next/image") return { __esModule: true, default: "img" };
    if (specifier === "next/link") return { __esModule: true, default: "a" };
    if (specifier === "next/navigation") return {
      useParams: () => navigation.params,
      usePathname: () => navigation.pathname,
      useRouter: () => navigation.router,
    };
    if (specifier === "lucide-react") return icons;
    if (specifier === "@/components/ui/button") return { Button: "button" };
    if (specifier === "@/components/admin/AdminAccountMenu") {
      return { __esModule: true, default: () => React.createElement("button", null, "Account") };
    }
    if (specifier === "@/components/admin/AdminSessionMonitor") {
      return { __esModule: true, default: () => null };
    }
    if (specifier === "@/components/matter/MatterDataContext") {
      return { MatterDataProvider: ({ children }) => children };
    }
    if (specifier === "@/components/matter/MatterTabLoadingState") {
      return {
        __esModule: true,
        default: ({ label }) => React.createElement("section", { role: "status" }, label),
      };
    }
    if (specifier === "@/components/admin/AdminSessionContext") {
      return { useAdminSession: () => ({ role: "super_admin" }) };
    }
    if (specifier === "@/lib/adminRoles") {
      return {
        ADMIN_ROLES: { SUPER_ADMIN: "super_admin" },
        canAccessQuestionnaireBuilder: (role) => role === "super_admin",
      };
    }
    if (specifier === "@/lib/adminSession") {
      return { requireAdminRole: async () => ({ role: "super_admin" }) };
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

test("admin header only shows the account controls", async () => {
  function AccountMenuSentinel() {
    return null;
  }

  const { default: AdminNavigation } = await loadComponent(
    "src/components/admin/AdminNavigation.jsx",
    {
      "./AdminSessionMonitor": { __esModule: true, default: () => null },
      "./AdminAccountMenu": {
        __esModule: true,
        default: AccountMenuSentinel,
      },
      "./AdminSessionContext": {
        useAdminSession: () => ({ role: "super_admin" }),
      },
    },
  );

  const tree = AdminNavigation({});
  const links = [...walk(tree)].filter((node) => node.type === "a");
  const accountMenus = [...walk(tree)].filter((node) => node.type === AccountMenuSentinel);

  assert.equal(links.length, 0);
  assert.equal(accountMenus.length, 1);
});

test("matter header keeps role-aware local tabs without dashboard links", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  navigation.params = { matterId: "app-123" };
  navigation.pathname = "/matter/app-123/questionnaire-builder";
  navigation.replacements = [];
  const fetchCalls = [];
  globalThis.window = {
    scrollY: 0,
    addEventListener() {},
    removeEventListener() {},
  };
  globalThis.fetch = async (url) => {
    fetchCalls.push(url);
    if (url === "/api/matter/app-123/shared-folder") {
      return { ok: true, async json() {
        return { success: true, folderUrl: "https://workdrive.zoho.com.au/folder/matter-folder" };
      } };
    }
    assert.equal(url, "/api/matter/app-123");
    return {
      async json() {
        return {
          success: true,
          dataScope: "full",
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
  await flushEffects(harness);

  const links = [...walk(harness.tree)]
    .filter((node) => node.type === "a" && node.props.href?.startsWith("/matter/"))
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
  assert.equal(
    [...walk(harness.tree)].find((node) => node.type === "a" && text(node).includes("Matter Folder"))?.props.href,
    "https://workdrive.zoho.com.au/folder/matter-folder",
  );
  assert.equal(links.some(({ label }) => label === "Dashboard" || label === "Questionnaires"), false);
  assert.deepEqual(navigation.replacements, []);

  navigation.pathname = "/matter/app-123/resources";
  harness.render();
  for (const effect of harness.effects.splice(0)) effect();
  await new Promise((resolve) => setImmediate(resolve));
  harness.render();

  const linksAfterTabChange = [...walk(harness.tree)].filter((node) => node.type === "a");
  assert.deepEqual(fetchCalls, ["/api/matter/app-123", "/api/matter/app-123/shared-folder"],
    "changing matter tabs must reuse the loaded matter and folder link");
  assert.equal(text(harness.tree).includes("Loading matter data..."), false);
  assert.equal(
    linksAfterTabChange.find((node) => text(node) === "Resources")?.props["aria-current"],
    "page",
  );
});

test("the retired shared files route redirects to resources", async () => {
  const redirects = [];
  const { default: SharedFilesPage } = await loadComponent(
    "src/app/matter/[matterId]/shared-files/page.js",
    {
      "next/navigation": {
        redirect(href) {
          redirects.push(href);
        },
      },
    },
  );

  await SharedFilesPage({ params: Promise.resolve({ matterId: "app 123" }) });

  assert.deepEqual(redirects, ["/matter/app%20123/resources"]);
});

test("the retired shared folder route redirects to resources", async () => {
  const redirects = [];
  const { default: SharedFolderPage } = await loadComponent(
    "src/app/matter/[matterId]/shared-folder/page.js",
    { "next/navigation": { redirect(href) { redirects.push(href); } } },
  );
  await SharedFolderPage({ params: Promise.resolve({ matterId: "app 123" }) });
  assert.deepEqual(redirects, ["/matter/app%20123/resources"]);
});

test("non-questionnaire matter tabs load a summary and upgrade only when questionnaire data is needed", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  navigation.params = { matterId: "app-123" };
  navigation.pathname = "/matter/app-123/resources";
  navigation.replacements = [];
  const fetchCalls = [];
  globalThis.window = {
    scrollY: 0,
    addEventListener() {},
    removeEventListener() {},
  };
  globalThis.fetch = async (url) => {
    fetchCalls.push(url);
    const summary = url.endsWith("?view=summary");
    return {
      async json() {
        return {
          success: true,
          dataScope: summary ? "summary" : "full",
          application: {
            id: "app-123",
            reference: "Client matter",
            type: "Employer Nomination Scheme (Subclass 186)",
          },
          percentage: summary ? null : 31,
          ...(summary ? {} : { questionnaire: {}, completion: {}, questionnaireDefinition: {} }),
        };
      },
    };
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
    globalThis.window = originalWindow;
  });

  const { default: MatterLayout } = await loadComponent("src/app/matter/[matterId]/layout.js");
  const harness = createHarness(MatterLayout, {
    children: React.createElement("div", null, "Matter content"),
  });
  harness.render();
  await flushEffects(harness);

  assert.deepEqual(fetchCalls, ["/api/matter/app-123?view=summary"]);
  assert.ok(text(harness.tree).includes("Matter content"));
  assert.ok(text(harness.tree).includes("—"));

  navigation.pathname = "/matter/app-123/questionnaire";
  harness.render();
  await flushEffects(harness);

  assert.deepEqual(fetchCalls, [
    "/api/matter/app-123?view=summary",
    "/api/matter/app-123/shared-folder",
    "/api/matter/app-123",
  ]);
  assert.ok(text(harness.tree).includes("31%"));
  assert.ok(text(harness.tree).includes("Matter content"));
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

  const page = await pageModule.default({ params: Promise.resolve({ matterId: "app-123" }) });
  assert.equal(page.type, BuilderSentinel);
  assert.equal(page.props.embeddedInMatter, true);

  const proposedPage = await pageModule.default({
    params: Promise.resolve({ matterId: "app-123" }),
    searchParams: Promise.resolve({ layout: "proposed" }),
  });
  assert.equal(proposedPage.props.initialLayout, "proposed");
});

test("client answer review does not render a circular back-to-application link", async () => {
  const source = await readFile(
    path.resolve("src/components/ClientQuestionnaireReview.jsx"),
    "utf8",
  );

  assert.equal(source.includes("Back to Application"), false);
  assert.equal(source.includes("ArrowLeft"), false);
});
