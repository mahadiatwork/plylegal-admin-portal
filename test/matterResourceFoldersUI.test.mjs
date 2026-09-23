import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire, Module } from "node:module";
import path from "node:path";
import { test } from "node:test";
import * as React from "react";
import { getWorkDrivePreviewUrl } from "../src/lib/workDrivePreviewUrl.mjs";

const require = createRequire(import.meta.url);
const { loadBindings, transform } = require("next/dist/build/swc");
await loadBindings();
let renderingHarness;
let params = { matterId: "matter-123" };
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
  useCallback(callback) {
    renderingHarness.cursor++;
    return callback;
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
const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");
const plainTextToRichTextHtml = (value) => value
  ? String(value)
      .replaceAll("\r\n", "\n")
      .replaceAll("\r", "\n")
      .split("\n")
      .map((line) => `<p>${escapeHtml(line)}</p>`)
      .join("")
  : "";
const richTextModule = {
  plainTextToRichTextHtml,
  RichTextEditor({ id, fallbackText = "", onChange, placeholder }) {
    return React.createElement("textarea", {
      id,
      value: fallbackText,
      placeholder,
      onChange(event) {
        onChange(plainTextToRichTextHtml(event.target.value), event.target.value);
      },
    });
  },
  RichTextContent({ fallbackText = "" }) {
    return React.createElement("div", null, fallbackText);
  },
};

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
    if (specifier === "next/navigation") return { useParams: () => params };
    if (specifier === "lucide-react") return icons;
    if (specifier === "@/components/ui/button") return { Button: "button" };
    if (specifier === "@/components/ui/badge") return { Badge: "span" };
    if (specifier === "@/components/ui/input") return { Input: "input" };
    if (specifier === "@/components/ui/textarea") return { Textarea: "textarea" };
    if (specifier === "@/components/ui/rich-text") return richTextModule;
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
    if (specifier === "@/lib/workDrivePreviewUrl.mjs") return { getWorkDrivePreviewUrl };
    return require(specifier);
  };
  componentModule._compile(code, filename);
  return componentModule.exports;
}

const sidebarModule = await loadComponent("src/components/admin/ResourceFoldersSidebar.jsx");
const Sidebar = sidebarModule.default;
const templatesModule = await loadComponent("src/components/admin/AdminResourceTemplatesManager.jsx", {
  "@/components/admin/ResourceFoldersSidebar": sidebarModule,
});
const TemplatesManager = templatesModule.default;
const pageModule = await loadComponent("src/app/matter/[matterId]/resources/page.js", {
  "@/components/admin/ResourceFoldersSidebar": sidebarModule,
  "@/components/admin/AdminResourceTemplatesManager": templatesModule,
});

// Keep the real JSX, sidebar, rows, and handlers; only state/effects and native UI
// wrappers are simulated. These are interaction regressions, not DOM/browser tests.
function* walk(node) {
  if (Array.isArray(node)) {
    for (const child of node) yield* walk(child);
  } else if (React.isValidElement(node)) {
    yield node;
    if (typeof node.type === "function" && node.type !== TemplatesManager) {
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
    find(predicate) {
      const node = [...walk(this.tree)].find(predicate);
      assert.ok(node, "Expected rendered control was not found");
      return node;
    },
    button(label) {
      return this.find((node) => node.type === "button" && text(node) === label);
    },
    control(label) {
      return this.find((node) => typeof node.type === "string" &&
        (node.props.id === label || node.props["aria-label"] === label));
    },
    sidebar() {
      return this.find((node) => node.type === Sidebar);
    },
  };
}

const categories = [{ name: "Guides", icon: "guide" }, { name: "Empty folder", icon: "scale" }];
const resources = [
  { id: "guide-a", type: "note", title: "Guide alpha", description: "Read alpha", category: "Guides", order: 10, status: "active" },
  { id: "guide-b", type: "link", title: "Guide beta", url: "https://example.test/beta", category: "Guides", order: 20, status: "active" },
  { id: "uncategorized", type: "note", title: "General note", category: "Uncategorized", order: 10, status: "active" },
];
const response = (body, status = 200) => ({ ok: status < 400, json: async () => body });
const flushEffects = async (harness) => {
  for (const effect of harness.effects.splice(0)) effect();
  await new Promise((resolve) => setImmediate(resolve));
  harness.render();
};

async function mountMatter(t, mutate = () => assert.fail("Unexpected mutation"), loadResources = () => resources) {
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  const calls = [];
  globalThis.window = { prompt: () => "Renamed Guides", confirm: () => true };
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    if (!options.method) return response({ success: true, categories, resources: loadResources() });
    return mutate(url, options);
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
    globalThis.window = originalWindow;
  });
  const wrapper = pageModule.default();
  const harness = createHarness(wrapper.type, wrapper.props);
  harness.render();
  await flushEffects(harness);
  harness.button("Only This MatterMatter-specific resources3").props.onClick();
  harness.render();
  return { harness, calls };
}

const templateDefinitions = [
  { visaSlug: "visa-alpha", title: "Alpha visa", categories },
  { visaSlug: "visa-beta", title: "Beta visa", categories },
];
const templateResources = {
  "visa-alpha": [
    { id: "shared", kind: "note", name: "Alpha first", category: "Uncategorized", order: 10, status: "active" },
    { id: "alpha-b", kind: "link", name: "Alpha second", category: "Uncategorized", order: 20, status: "hidden" },
    { id: "alpha-c", kind: "file", name: "Alpha third", category: "Uncategorized", order: 30, status: "active" },
    { id: "alpha-guide", kind: "note", name: "Alpha guide", category: "Guides", order: 1, status: "active" },
  ],
  "visa-beta": [
    { id: "shared", kind: "note", name: "Beta first", category: "Uncategorized", order: 10, status: "active" },
    { id: "beta-b", kind: "note", name: "Beta second", category: "Uncategorized", order: 20, status: "active" },
  ],
};

async function mountTemplates(t, {
  definitions = templateDefinitions,
  loadItems = (slug) => templateResources[slug],
  mutate = () => assert.fail("Unexpected mutation"),
} = {}) {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    if (!options.method) {
      if (url === "/api/resource-templates") return response({ success: true, templates: definitions });
      const slug = url.split("/").at(-1);
      return response({ success: true, template: definitions.find((item) => item.visaSlug === slug), items: loadItems(slug) });
    }
    return mutate(url, options);
  };
  t.after(() => { globalThis.fetch = originalFetch; });
  const harness = createHarness(TemplatesManager);
  harness.render();
  await flushEffects(harness);
  return { harness, calls };
}

const orderResponse = (itemIds) => response({
  success: true,
  items: itemIds.map((id, index) => ({ id, order: (index + 1) * 10 })),
  updatedAt: "2026-09-16T00:00:00Z", updatedBy: "admin",
});
const mutationCalls = (calls) => calls.filter(({ options }) => options.method);
const reorderButtons = (harness) => [...walk(harness.tree)].filter((node) =>
  node.type === "button" && node.props["aria-label"]?.startsWith("Reorder "));
const displayedResourceNames = (harness) => reorderButtons(harness).map((node) =>
  node.props["aria-label"].slice("Reorder ".length));
function resourceRow(harness, name) {
  return harness.find((node) => typeof node.props.onDrop === "function" &&
    [...walk(node)].some((child) => child.props["aria-label"] === `Reorder ${name}`));
}
function dragEvent(value = "") {
  const transfer = new Map([["text/plain", value]]);
  return {
    preventDefault() {},
    dataTransfer: {
      setData(type, content) { transfer.set(type, content); },
      getData(type) { return transfer.get(type) || ""; },
    },
  };
}
function dragResource(harness, source, target) {
  const event = dragEvent();
  harness.control(`Reorder ${source}`).props.onDragStart(event);
  harness.render();
  return { event, pending: resourceRow(harness, target).props.onDrop(event) };
}
async function settleInteraction(harness, pending) {
  await pending;
  await new Promise((resolve) => setImmediate(resolve));
  harness.render();
}

function change(harness, control, value) {
  harness.control(control).props.onChange({ target: { value } });
  harness.render();
}

function selectFolder(harness, name) {
  const button = harness.find((node) => node.type === "button" &&
    node.props["aria-pressed"] !== undefined && text(node).startsWith(name));
  button.props.onClick();
  harness.render();
}

const folderNames = (harness) => harness.sidebar().props.categories.map((category) => category.name);

test("matter folder handles save a full order and show it after reload", async (t) => {
  let savedCategories = [{ name: "Guides", icon: "guide" }, { name: "Empty folder", icon: "scale" }];
  const { harness, calls } = await mountMatter(t, (url, options) => {
    assert.equal(url, "/api/matter/matter-123/resources/categories");
    assert.equal(options.method, "PUT");
    const { names } = JSON.parse(options.body);
    assert.deepEqual(names, ["Empty folder", "Uncategorized", "Guides"]);
    savedCategories = names.map((name) => ({
      name, icon: name === "Empty folder" ? "scale" : name === "Guides" ? "guide" : "folder",
    }));
    return response({ success: true, categories: savedCategories });
  });
  const drag = dragEvent();
  harness.control("Move folder Empty folder").props.onDragStart(drag);
  harness.render();
  const target = harness.find((node) => typeof node.props.onDrop === "function" &&
    [...walk(node)].some((child) => child.props["aria-label"] === "Move folder Uncategorized"));
  await settleInteraction(harness, target.props.onDrop(drag));
  assert.deepEqual(folderNames(harness), ["Empty folder", "Uncategorized", "Guides"]);
  assert.equal(mutationCalls(calls).length, 1);

  const wrapper = pageModule.default();
  const reload = createHarness(wrapper.type, wrapper.props);
  // The saved API result is the source of truth for a fresh manager.
  globalThis.fetch = async (_url, options = {}) => options.method
    ? assert.fail("Unexpected mutation")
    : response({ success: true, categories: savedCategories, resources });
  reload.render();
  await flushEffects(reload);
  reload.button("Only This MatterMatter-specific resources3").props.onClick();
  reload.render();
  assert.deepEqual(folderNames(reload), ["Empty folder", "Uncategorized", "Guides"]);
});

test("template folder keyboard order is saved for all visas and blocks filtered moves", async (t) => {
  let savedDefinitions = structuredClone(templateDefinitions);
  const { harness, calls } = await mountTemplates(t, {
    definitions: savedDefinitions,
    mutate: (url, options) => {
      assert.equal(url, "/api/resource-templates/all/categories");
      assert.equal(options.method, "PUT");
      const { names } = JSON.parse(options.body);
      assert.deepEqual(names, ["Guides", "Uncategorized", "Empty folder"]);
      savedDefinitions = savedDefinitions.map((definition) => ({
        ...definition,
        categories: names.map((name, index) => ({ name, icon: "folder", order: (index + 1) * 10 })),
      }));
      return response({ success: true, changes: savedDefinitions.map((definition) => ({
        visaSlug: definition.visaSlug, categories: definition.categories,
      })) });
    },
  });
  change(harness, "Search folders", "Guide");
  assert.ok(harness.control("Move folder Guides").props.disabled);
  change(harness, "Search folders", "");
  const handle = harness.control("Move folder Guides");
  await settleInteraction(harness, handle.props.onKeyDown({
    key: "ArrowUp", currentTarget: handle, preventDefault() {},
  }));
  assert.deepEqual(folderNames(harness), ["Guides", "Uncategorized", "Empty folder"]);
  assert.equal(mutationCalls(calls).length, 1);

  globalThis.fetch = async (url, options = {}) => {
    if (options.method) assert.fail("Unexpected mutation");
    if (url === "/api/resource-templates") return response({ success: true, templates: savedDefinitions });
    const slug = url.split("/").at(-1);
    return response({
      success: true,
      template: savedDefinitions.find((definition) => definition.visaSlug === slug),
      items: templateResources[slug],
    });
  };
  const reload = createHarness(TemplatesManager);
  reload.render();
  await flushEffects(reload);
  assert.deepEqual(folderNames(reload), ["Guides", "Uncategorized", "Empty folder"]);
});

test("a new template folder is appended after an existing saved order", async (t) => {
  const definitions = templateDefinitions.map((definition) => ({
    ...definition,
    categories: [
      { name: "Guides", icon: "guide", order: 10 },
      { name: "Uncategorized", icon: "folder", order: 20 },
      { name: "Empty folder", icon: "scale", order: 30 },
    ],
  }));
  const { harness, calls } = await mountTemplates(t, {
    definitions,
    mutate: (url, options) => {
      assert.equal(options.method, "PATCH");
      const { categories } = JSON.parse(options.body);
      assert.deepEqual(categories.map((category) => category.name),
        ["Guides", "Uncategorized", "Empty folder", "New folder"]);
      assert.deepEqual(categories.map((category) => category.order), [10, 20, 30, 40]);
      const slug = url.split("/").at(-1);
      return response({ success: true, template: { ...definitions.find((item) => item.visaSlug === slug), categories } });
    },
  });
  harness.button("New").props.onClick();
  harness.render();
  change(harness, "Folder name", "New folder");
  await settleInteraction(harness, harness.button("Add").props.onClick());
  assert.deepEqual(folderNames(harness), ["Guides", "Uncategorized", "Empty folder", "New folder"]);
  assert.equal(mutationCalls(calls).length, 2);
});

test("matter navigation keys resource state by matter and both scopes render the same folder sidebar", async (t) => {
  const first = pageModule.default();
  assert.equal(first.key, "matter-123");
  assert.equal(first.props.matterId, "matter-123");
  params = { matterId: "matter-456" };
  assert.equal(pageModule.default().key, "matter-456");
  params = { matterId: "matter-123" };
  const { harness, calls } = await mountMatter(t);
  assert.equal(calls[0].url, "/api/matter/matter-123/resources");
  assert.equal(harness.sidebar().type, Sidebar);
  harness.button("All MattersReusable resourcesTemplates").props.onClick();
  harness.render();
  assert.equal(harness.find((node) => node.type === TemplatesManager).type, TemplatesManager);
  const templatesHarness = createHarness(TemplatesManager);
  templatesHarness.render();
  const loadingStatus = templatesHarness.find((node) =>
    node.type === "section" && node.props.role === "status");
  assert.match(text(loadingStatus), /Loading resources data/);
  await flushEffects(templatesHarness);
  assert.equal(templatesHarness.sidebar().type, Sidebar);
});

test("empty matter folders remain visible, with their icon and zero count, and folders filter resources", async (t) => {
  const { harness } = await mountMatter(t);
  const empty = harness.sidebar().props.categories.find((item) => item.name === "Empty folder");
  assert.equal(empty.icon, "scale");
  const emptyButton = harness.button("Empty folder0");
  assert.equal(emptyButton.props["aria-pressed"], false);
  selectFolder(harness, "Guides");
  let rows = [...walk(harness.tree)].filter((node) => node.type.name === "ResourceRow");
  assert.deepEqual(rows.map((node) => node.props.resource.id), ["guide-a", "guide-b"]);
  selectFolder(harness, "Empty folder");
  rows = [...walk(harness.tree)].filter((node) => node.type.name === "ResourceRow");
  assert.deepEqual(rows, []);
  assert.equal(harness.button("Empty folder0").props["aria-pressed"], true);
  change(harness, "Search folders", "empty");
  assert.deepEqual(harness.sidebar().props.categories.map((item) => item.name), ["Empty folder"]);
});

test("creating a matter folder sends scoped name/icon metadata without discarding a resource draft", async (t) => {
  const { harness, calls } = await mountMatter(t, (url, options) => {
    assert.equal(url, "/api/matter/matter-123/resources/categories");
    assert.equal(options.method, "POST");
    assert.deepEqual(JSON.parse(options.body), { name: "New guidance", icon: "scale" });
    return response({ success: true, categories: [...categories, { name: "New guidance", icon: "scale" }], items: [] });
  });
  harness.button("Add resource").props.onClick();
  harness.render();
  const draftFile = new File(["draft"], "draft.pdf", { type: "application/pdf" });
  harness.control("resource-file").props.onChange({ target: { files: [draftFile] } });
  harness.render();
  change(harness, "resource-title", "Unfinished draft title");
  change(harness, "resource-description", "Keep this description");
  harness.button("New folder").props.onClick();
  harness.render();
  change(harness, "Folder name", " New guidance ");
  harness.control("Legal icon").props.onClick();
  harness.render();
  await harness.button("Add").props.onClick();
  harness.render();
  assert.equal(calls.length, 2);
  assert.equal(harness.control("resource-title").props.value, "Unfinished draft title");
  assert.equal(harness.control("resource-description").props.value, "Keep this description");
  assert.equal(harness.control("resource-category").props.value, "New guidance");
  assert.ok(text(harness.tree).includes("draft.pdf"));
  assert.equal(harness.sidebar().props.activeCategory, "New guidance");
});

for (const type of ["file", "note", "link"]) {
  test(`${type} resource submission includes the selected matter folder`, async (t) => {
    const { harness } = await mountMatter(t, (url, options) => {
      assert.equal(url, "/api/matter/matter-123/resources");
      assert.equal(options.method, "POST");
      assert.equal(options.body.get("category"), "Empty folder");
      assert.equal(options.body.get("type"), type);
      if (type === "file") assert.equal(options.body.get("file").name, "guide.pdf");
      if (type === "note") {
        assert.equal(options.body.get("noteText"), "Client note");
        assert.equal(options.body.get("noteHtml"), "<p>Client note</p>");
      }
      if (type === "link") assert.equal(options.body.get("url"), "https://example.test/guide");
      return response({ success: true, resource: { id: "new", type, title: "New resource", category: "Empty folder", status: "active" } });
    });
    selectFolder(harness, "Empty folder");
    harness.button("Add resource").props.onClick();
    harness.render();
    if (type !== "file") {
      harness.button(type === "note" ? "Note" : "Link").props.onClick();
      harness.render();
    }
    change(harness, "resource-title", "New resource");
    if (type === "file") {
      harness.control("resource-file").props.onChange({ target: { files: [new File(["PDF"], "guide.pdf")] } });
      harness.render();
    } else if (type === "note") change(harness, "resource-description", "Client note");
    else change(harness, "resource-url", "https://example.test/guide");
    await harness.control("Add matter resource").props.onSubmit({ preventDefault() {} });
    harness.render();
    const row = harness.find((node) => node.type.name === "ResourceRow");
    assert.equal(row.props.resource.id, "new");
    assert.equal(harness.sidebar().props.activeCategory, "Empty folder");
  });
}

test("renaming and deleting a folder updates its resources without removing them", async (t) => {
  const { harness, calls } = await mountMatter(t, (url, options) => {
    assert.equal(url, "/api/matter/matter-123/resources/categories");
    const renaming = options.method === "PATCH";
    assert.deepEqual(JSON.parse(options.body), renaming
      ? { name: "Guides", nextName: "Renamed Guides" }
      : { name: "Renamed Guides" });
    return response({
      success: true,
      categories: renaming ? [{ name: "Renamed Guides", icon: "guide" }, categories[1]] : [categories[1]],
      items: resources.slice(0, 2).map(({ id }) => ({ id, category: renaming ? "Renamed Guides" : "Uncategorized" })),
      updatedAt: "2026-09-16T00:00:00Z", updatedBy: "admin",
    });
  });
  selectFolder(harness, "Guides");
  await harness.control("Rename Guides").props.onClick();
  harness.render();
  assert.equal(harness.sidebar().props.activeCategory, "Renamed Guides");
  let rows = [...walk(harness.tree)].filter((node) => node.type.name === "ResourceRow");
  assert.deepEqual(rows.map((node) => node.props.resource.id), ["guide-a", "guide-b"]);
  assert.ok(rows.every((node) => node.props.resource.category === "Renamed Guides"));
  await harness.control("Delete Renamed Guides").props.onClick();
  harness.render();
  assert.equal(harness.sidebar().props.activeCategory, "Uncategorized");
  assert.ok(!harness.sidebar().props.categories.some((item) => item.name === "Renamed Guides"));
  rows = [...walk(harness.tree)].filter((node) => node.type.name === "ResourceRow");
  assert.deepEqual(rows.map((node) => node.props.resource.id).sort(), ["guide-a", "guide-b", "uncategorized"]);
  assert.ok(rows.every((node) => node.props.resource.category === "Uncategorized"));
  assert.equal(calls.filter(({ options }) => options.method).length, 2);
});

test("resource search and non-custom sorting disable all folder reorder handles", async (t) => {
  const { harness, calls } = await mountMatter(t);
  selectFolder(harness, "Guides");
  const reorderButtons = () => [...walk(harness.tree)].filter((node) =>
    node.type === "button" && node.props["aria-label"]?.startsWith("Reorder "));
  assert.equal(reorderButtons().length, 2);
  assert.ok(reorderButtons().every((node) => node.props.draggable && !node.props.disabled));
  change(harness, "Search resources", "Guide");
  assert.ok(reorderButtons().every((node) => !node.props.draggable && node.props.disabled));
  await harness.find((node) => node.type.name === "ResourceRow").props.onDrop({
    preventDefault() {}, dataTransfer: { getData: () => "guide-b" },
  });
  change(harness, "Search resources", "");
  for (const mode of ["name", "newest", "oldest"]) {
    change(harness, "Resource sort order", mode);
    assert.ok(reorderButtons().every((node) => !node.props.draggable && node.props.disabled));
    const row = harness.find((node) => node.type.name === "ResourceRow");
    await row.props.onDrop({ preventDefault() {}, dataTransfer: { getData: () => "guide-b" } });
  }
  assert.equal(calls.filter(({ options }) => options.method).length, 0);
  change(harness, "Resource sort order", "order");
  assert.ok(reorderButtons().every((node) => node.props.draggable && !node.props.disabled));
});

test("the default all-visas view can drag an existing resource when the folder contains one visa", async (t) => {
  const { harness, calls } = await mountTemplates(t, {
    definitions: templateDefinitions.slice(0, 1),
    mutate(url, options) {
      assert.equal(url, "/api/resource-templates/visa-alpha/items/order");
      assert.equal(options.method, "PATCH");
      const body = JSON.parse(options.body);
      assert.deepEqual(body, { category: "Uncategorized", itemIds: ["alpha-b", "shared", "alpha-c"] });
      return orderResponse(body.itemIds);
    },
  });
  assert.equal(harness.control("Visa scope").props.value, "all");
  assert.ok(reorderButtons(harness).every((node) => node.props.draggable && !node.props.disabled));
  const { pending } = dragResource(harness, "Alpha second", "Alpha first");
  await settleInteraction(harness, pending);
  assert.deepEqual(displayedResourceNames(harness), ["Alpha second", "Alpha first", "Alpha third"]);
  assert.equal(mutationCalls(calls).length, 1);
  assert.ok(text(harness.tree).includes("Resource order saved."));
});

test("adding a resource uses the selected visa scope without a second visa selector", async (t) => {
  const { harness, calls } = await mountTemplates(t, {
    mutate(url, options) {
      assert.equal(url, "/api/resource-templates/visa-beta/items");
      assert.equal(options.method, "POST");
      assert.equal(options.body.get("kind"), "note");
      assert.equal(options.body.get("name"), "Beta note");
      assert.equal(options.body.get("noteText"), "A note for this visa.");
      assert.equal(options.body.get("noteHtml"), "<p>A note for this visa.</p>");
      return response({ success: true, item: { id: "beta-note" } });
    },
  });

  change(harness, "Visa scope", "visa-beta");
  harness.button("Add resource").props.onClick();
  harness.render();

  const visaSelectors = [...walk(harness.tree)].filter((node) =>
    node.type === "select" && [...walk(node)].some((child) =>
      child.type === "option" && child.props.value === "visa-beta"));
  assert.equal(visaSelectors.length, 1);
  assert.equal(visaSelectors[0].props.value, "visa-beta");

  const kind = harness.find((node) => node.type === "select" && node.props.value === "file");
  kind.props.onChange({ target: { value: "note" } });
  harness.render();
  change(harness, "resource-name", "Beta note");
  change(harness, "resource-note", "A note for this visa.");
  await settleInteraction(harness, harness.find((node) => node.type === "form").props.onSubmit({ preventDefault() {} }));
  assert.equal(mutationCalls(calls).length, 1);
});

for (const kind of ["file", "link"]) {
  test(`adding a template ${kind} includes its optional description`, async (t) => {
    const { harness, calls } = await mountTemplates(t, {
      mutate(url, options) {
        assert.equal(url, "/api/resource-templates/visa-alpha/items");
        assert.equal(options.method, "POST");
        assert.equal(options.body.get("kind"), kind);
        assert.equal(options.body.get("description"), "Use Code 33");
        return response({ success: true, item: { id: `${kind}-with-description` } });
      },
    });

    change(harness, "Visa scope", "visa-alpha");
    harness.button("Add resource").props.onClick();
    harness.render();

    if (kind === "link") {
      const kindSelect = harness.find((node) => node.type === "select" && node.props.value === "file");
      kindSelect.props.onChange({ target: { value: "link" } });
      harness.render();
      change(harness, "resource-name", "Police check");
      change(harness, "resource-link", "https://example.test/police-check");
    } else {
      harness.control("Choose resource files").props.onChange({
        target: { files: [new File(["PDF"], "police-check.pdf", { type: "application/pdf" })] },
      });
      harness.render();
    }

    change(harness, "resource-description", "Use Code 33");
    await settleInteraction(harness, harness.find((node) => node.type === "form").props.onSubmit({ preventDefault() {} }));
    assert.equal(mutationCalls(calls).length, 1);
  });
}

test("editing a template link restores and saves its description", async (t) => {
  const definitions = [templateDefinitions[0]];
  const existingLink = {
    id: "police-check",
    kind: "link",
    name: "Police check",
    description: "Use Code 33",
    externalUrl: "https://example.test/police-check",
    category: "Uncategorized",
    order: 10,
    status: "active",
  };
  const { harness, calls } = await mountTemplates(t, {
    definitions,
    loadItems: () => [existingLink],
    mutate(url, options) {
      assert.equal(url, "/api/resource-templates/visa-alpha/items/police-check");
      assert.equal(options.method, "PATCH");
      assert.equal(JSON.parse(options.body).description, "Use Code 34");
      return response({ success: true, item: { ...existingLink, description: "Use Code 34" } });
    },
  });

  harness.find((node) => node.type === "button" && node.props.title === "Edit").props.onClick();
  harness.render();
  assert.equal(harness.control("resource-description").props.value, "Use Code 33");
  change(harness, "resource-description", "Use Code 34");
  await settleInteraction(harness, harness.find((node) => node.type === "form").props.onSubmit({ preventDefault() {} }));
  assert.equal(mutationCalls(calls).length, 1);
});

test("all visa types requires a specific scope before adding a resource", async (t) => {
  const { harness, calls } = await mountTemplates(t);
  assert.equal(harness.control("Visa scope").props.value, "all");
  harness.button("Add resource").props.onClick();
  harness.render();
  assert.ok(![...walk(harness.tree)].some((node) => node.type === "form"));
  assert.match(text(harness.tree), /select a specific visa scope/i);
  assert.equal(mutationCalls(calls).length, 0);
});

test("all-visas custom order groups resources and sends the complete folder list for only the dragged visa", async (t) => {
  const { harness, calls } = await mountTemplates(t, {
    mutate(url, options) {
      assert.equal(url, "/api/resource-templates/visa-alpha/items/order");
      const body = JSON.parse(options.body);
      assert.deepEqual(body, { category: "Uncategorized", itemIds: ["alpha-c", "shared", "alpha-b"] });
      return orderResponse(body.itemIds);
    },
  });
  assert.deepEqual(displayedResourceNames(harness), [
    "Alpha first", "Alpha second", "Alpha third", "Beta first", "Beta second",
  ]);
  const { event, pending } = dragResource(harness, "Alpha third", "Alpha first");
  assert.equal(event.dataTransfer.getData("text/plain"), "visa-alpha:alpha-c");
  await settleInteraction(harness, pending);
  assert.deepEqual(displayedResourceNames(harness), [
    "Alpha third", "Alpha first", "Alpha second", "Beta first", "Beta second",
  ]);
  assert.equal(mutationCalls(calls).length, 1);
  selectFolder(harness, "Guides");
  assert.deepEqual(displayedResourceNames(harness), ["Alpha guide"]);
});

test("duplicate resource IDs in different visas retain independent drag identities and order", async (t) => {
  const { harness, calls } = await mountTemplates(t, {
    mutate(url, options) {
      assert.equal(url, "/api/resource-templates/visa-beta/items/order");
      const body = JSON.parse(options.body);
      assert.deepEqual(body, { category: "Uncategorized", itemIds: ["beta-b", "shared"] });
      return orderResponse(body.itemIds);
    },
  });
  const { event, pending } = dragResource(harness, "Beta first", "Beta second");
  assert.equal(event.dataTransfer.getData("text/plain"), "visa-beta:shared");
  await settleInteraction(harness, pending);
  assert.deepEqual(displayedResourceNames(harness), [
    "Alpha first", "Alpha second", "Alpha third", "Beta second", "Beta first",
  ]);
  assert.equal(mutationCalls(calls).length, 1);
});

test("dropping across visas rejects the move even when source and target IDs match", async (t) => {
  const { harness, calls } = await mountTemplates(t);
  const original = displayedResourceNames(harness);
  const { pending } = dragResource(harness, "Alpha first", "Beta first");
  await settleInteraction(harness, pending);
  assert.equal(mutationCalls(calls).length, 0);
  assert.deepEqual(displayedResourceNames(harness), original);
  assert.ok(text(harness.tree).includes("within the same visa type"));
});

test("shared-resource search and alternate sort modes disable reordering without writing", async (t) => {
  const { harness, calls } = await mountTemplates(t);
  change(harness, "Search resources", "Alpha");
  assert.ok(reorderButtons(harness).every((node) => node.props.disabled && !node.props.draggable));
  const filteredTarget = resourceRow(harness, "Alpha first");
  await settleInteraction(harness, filteredTarget.props.onDrop(dragEvent("visa-alpha:alpha-b")));
  change(harness, "Search resources", "");
  for (const sortMode of ["name", "oldest", "newest"]) {
    change(harness, "Resource sort order", sortMode);
    assert.ok(reorderButtons(harness).every((node) => node.props.disabled && !node.props.draggable));
    await settleInteraction(harness, resourceRow(harness, "Alpha first").props.onDrop(dragEvent("visa-alpha:alpha-b")));
  }
  assert.equal(mutationCalls(calls).length, 0);
  change(harness, "Resource sort order", "order");
  assert.ok(reorderButtons(harness).every((node) => node.props.draggable && !node.props.disabled));
});

test("shared-resource keyboard moves update immediately, block duplicate saves, and restore order on failure", async (t) => {
  let finishSave;
  const { harness, calls } = await mountTemplates(t, {
    mutate: () => new Promise((resolve) => { finishSave = resolve; }),
  });
  const handle = harness.control("Reorder Alpha second");
  let prevented = 0;
  const keyEvent = { key: "ArrowUp", preventDefault() { prevented++; } };
  const pending = handle.props.onKeyDown(keyEvent);
  // A repeated event can arrive before React commits the saving state.
  handle.props.onKeyDown(keyEvent);
  harness.render();
  assert.equal(prevented, 2);
  assert.deepEqual(displayedResourceNames(harness).slice(0, 3), ["Alpha second", "Alpha first", "Alpha third"]);
  assert.equal(mutationCalls(calls).length, 1);
  assert.ok(reorderButtons(harness).every((node) => node.props.disabled && !node.props.draggable));
  finishSave(response({ success: false, error: "Order could not be saved" }, 500));
  await settleInteraction(harness, pending);
  assert.deepEqual(displayedResourceNames(harness).slice(0, 3), ["Alpha first", "Alpha second", "Alpha third"]);
  assert.ok(text(harness.tree).includes("Order could not be saved"));
  assert.ok(reorderButtons(harness).every((node) => !node.props.disabled));
});

test("shared-resource keyboard moves stop at visa boundaries and saved order survives reload", async (t) => {
  const savedItems = structuredClone(templateResources);
  const loadItems = (slug) => savedItems[slug];
  const { harness, calls } = await mountTemplates(t, {
    loadItems,
    mutate(url, options) {
      const slug = url.split("/")[3];
      const body = JSON.parse(options.body);
      const orderById = new Map(body.itemIds.map((id, index) => [id, (index + 1) * 10]));
      savedItems[slug] = savedItems[slug].map((item) =>
        orderById.has(item.id) ? { ...item, order: orderById.get(item.id) } : item);
      return orderResponse(body.itemIds);
    },
  });
  await settleInteraction(harness, harness.control("Reorder Alpha third").props.onKeyDown({ key: "ArrowDown", preventDefault() {} }));
  await settleInteraction(harness, harness.control("Reorder Beta first").props.onKeyDown({ key: "ArrowUp", preventDefault() {} }));
  assert.equal(mutationCalls(calls).length, 0);
  await settleInteraction(harness, harness.control("Reorder Beta second").props.onKeyDown({ key: "ArrowUp", preventDefault() {} }));
  assert.deepEqual(JSON.parse(mutationCalls(calls)[0].options.body), {
    category: "Uncategorized", itemIds: ["beta-b", "shared"],
  });
  const reloaded = await mountTemplates(t, { loadItems });
  assert.deepEqual(displayedResourceNames(reloaded.harness), [
    "Alpha first", "Alpha second", "Alpha third", "Beta second", "Beta first",
  ]);
});

test("matter-resource drag saves the whole folder, updates immediately, and persists after reload", async (t) => {
  let finishSave;
  let savedResources = structuredClone(resources);
  const { harness, calls } = await mountMatter(t, (url, options) => {
    assert.equal(url, "/api/matter/matter-123/resources");
    assert.equal(options.method, "PATCH");
    const body = JSON.parse(options.body);
    assert.deepEqual(body, { category: "Guides", itemIds: ["guide-b", "guide-a"] });
    return new Promise((resolve) => {
      finishSave = () => {
        const orderById = new Map(body.itemIds.map((id, index) => [id, (index + 1) * 10]));
        savedResources = savedResources.map((item) =>
          orderById.has(item.id) ? { ...item, order: orderById.get(item.id) } : item);
        resolve(orderResponse(body.itemIds));
      };
    });
  }, () => savedResources);
  selectFolder(harness, "Guides");
  const { pending } = dragResource(harness, "Guide beta", "Guide alpha");
  harness.render();
  assert.deepEqual(displayedResourceNames(harness), ["Guide beta", "Guide alpha"]);
  assert.ok(reorderButtons(harness).every((node) => node.props.disabled));
  assert.equal(mutationCalls(calls).length, 1);
  finishSave();
  await settleInteraction(harness, pending);
  assert.ok(text(harness.tree).includes("Resource order saved."));
  const reloaded = await mountMatter(t, undefined, () => savedResources);
  selectFolder(reloaded.harness, "Guides");
  assert.deepEqual(displayedResourceNames(reloaded.harness), ["Guide beta", "Guide alpha"]);
  selectFolder(reloaded.harness, "Uncategorized");
  assert.deepEqual(displayedResourceNames(reloaded.harness), ["General note"]);
});

test("matter keyboard reordering restores the previous list after a failed save", async (t) => {
  let failSave;
  const { harness, calls } = await mountMatter(t, () => new Promise((resolve) => { failSave = resolve; }));
  selectFolder(harness, "Guides");
  const handle = harness.control("Reorder Guide beta");
  const event = { key: "ArrowUp", preventDefault() {} };
  const pending = handle.props.onKeyDown(event);
  handle.props.onKeyDown(event);
  harness.render();
  assert.deepEqual(displayedResourceNames(harness), ["Guide beta", "Guide alpha"]);
  assert.equal(mutationCalls(calls).length, 1);
  failSave(response({ success: false, error: "Refresh before retrying" }, 409));
  await settleInteraction(harness, pending);
  assert.deepEqual(displayedResourceNames(harness), ["Guide alpha", "Guide beta"]);
  assert.ok(text(harness.tree).includes("Refresh before retrying"));
  assert.ok(reorderButtons(harness).every((node) => !node.props.disabled));
});
