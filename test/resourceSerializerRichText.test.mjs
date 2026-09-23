import assert from "node:assert/strict";
import path from "node:path";
import { registerHooks } from "node:module";
import { pathToFileURL } from "node:url";
import { test } from "node:test";

const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@/lib/zohoClient") {
      return {
        url: "data:text/javascript,export default {};",
        shortCircuit: true,
      };
    }
    if (specifier.startsWith("@/")) {
      const relativePath = specifier.slice(2);
      const filePath = path.resolve("src", path.extname(relativePath) ? relativePath : `${relativePath}.js`);
      return { url: pathToFileURL(filePath).href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});

const { serializeResourceDoc } = await import("../src/lib/sharedResources.js");
const { serializeTemplateItemDoc } = await import("../src/lib/resourceTemplates.js");
hooks.deregister();

const dirtyNote = {
  noteHtml: '<h2>Safe</h2><p><strong>body</strong><img src="x" onerror="alert(1)"></p>',
  noteText: "stale",
  content: "stale",
  contentFormat: "html",
};

test("shared and template serializers defensively sanitize explicit rich HTML", () => {
  const shared = serializeResourceDoc({
    id: "shared",
    data: () => ({ type: "note", ...dirtyNote }),
  });
  const template = serializeTemplateItemDoc({
    id: "template",
    data: () => ({ kind: "note", ...dirtyNote }),
  });

  for (const serialized of [shared, template]) {
    assert.equal(serialized.noteHtml, "<h2>Safe</h2><p><strong>body</strong></p>");
    assert.equal(serialized.noteText, "Safe\nbody");
    assert.equal(serialized.content, "Safe\nbody");
    assert.equal(serialized.contentFormat, "html");
  }
});

test("serializers preserve legacy markup-looking text as plaintext", () => {
  const shared = serializeResourceDoc({
    id: "shared",
    data: () => ({ type: "note", noteText: "<b>literal</b>" }),
  });
  const template = serializeTemplateItemDoc({
    id: "template",
    data: () => ({ kind: "note", content: "<i>literal</i>" }),
  });

  assert.equal(shared.noteText, "<b>literal</b>");
  assert.equal("noteHtml" in shared, false);
  assert.equal(template.noteText, "<i>literal</i>");
  assert.equal("noteHtml" in template, false);
});

test("serializers suppress explicit rich HTML on malformed non-note records", () => {
  const shared = serializeResourceDoc({
    id: "shared-file",
    data: () => ({
      type: "file",
      title: "File",
      noteText: "must not render",
      noteHtml: '<img src=x onerror="alert(1)"><script>alert(2)</script>',
      contentFormat: "html",
    }),
  });
  const template = serializeTemplateItemDoc({
    id: "template-link",
    data: () => ({
      kind: "link",
      name: "Link",
      noteText: "must not render",
      noteHtml: '<svg><animate attributeName="href" values="javascript:alert(1)"></animate></svg>',
      contentFormat: "html",
    }),
  });

  for (const serialized of [shared, template]) {
    assert.equal(serialized.noteHtml, undefined);
    assert.equal(serialized.contentFormat, undefined);
    assert.doesNotMatch(JSON.stringify(serialized), /onerror|<script|<svg|javascript:/);
  }
});
