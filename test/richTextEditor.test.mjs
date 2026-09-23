import assert from "node:assert/strict";
import { test } from "node:test";

import { Editor, getSchema } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { EditorState, NodeSelection, TextSelection } from "@tiptap/pm/state";

import {
  plainTextToRichTextHtml,
  setVisualParagraph,
  toggleVisualHeading,
  toggleVisualHeadingCommand,
  visualHeadingKeyboardShortcuts,
} from "../src/lib/richTextEditor.js";

const schema = getSchema([
  StarterKit.configure({ heading: { levels: [1, 2, 3, 4] } }),
]);

function paragraphWithBreaks(content) {
  return schema.nodeFromJSON({
    type: "doc",
    content: [{ type: "paragraph", content }],
  });
}

function applyHeadingToSelection(doc, from, to, level = 2) {
  let state = EditorState.create({ schema, doc });
  state = state.apply(
    state.tr.setSelection(TextSelection.create(state.doc, from, to)),
  );
  const transaction = state.tr;
  assert.equal(toggleVisualHeading(transaction, level), true);
  return {
    doc: JSON.parse(JSON.stringify(transaction.doc.toJSON())),
    selection: transaction.selection,
  };
}

function textRange(doc, text) {
  let range = null;
  doc.descendants((node, position) => {
    if (!range && node.isText && node.text === text) {
      range = { from: position, to: position + node.nodeSize };
    }
  });
  assert.ok(range, `Expected to find text ${JSON.stringify(text)}`);
  return range;
}

test("plain legacy note lines become independent paragraphs", () => {
  assert.equal(
    plainTextToRichTextHtml("First line\n\nSecond <line> & more"),
    "<p>First line</p><p></p><p>Second &lt;line&gt; &amp; more</p>",
  );
  assert.equal(plainTextToRichTextHtml(""), "");
});

test("a heading selected after legacy hard breaks changes only that line", () => {
  const doc = paragraphWithBreaks([
    { type: "text", text: "Body" },
    { type: "hardBreak" },
    { type: "hardBreak" },
    { type: "text", marks: [{ type: "underline" }], text: "Target heading" },
  ]);

  assert.deepEqual(applyHeadingToSelection(doc, 7, 21).doc, {
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: "Body" }] },
      { type: "paragraph" },
      {
        type: "heading",
        attrs: { level: 2 },
        content: [
          { type: "text", marks: [{ type: "underline" }], text: "Target heading" },
        ],
      },
    ],
  });
});

test("a heading selected before a hard break does not change the following line", () => {
  const doc = paragraphWithBreaks([
    { type: "text", text: "Target" },
    { type: "hardBreak" },
    { type: "text", text: "Body" },
  ]);

  assert.deepEqual(applyHeadingToSelection(doc, 1, 7, 3).doc, {
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: { level: 3 },
        content: [{ type: "text", text: "Target" }],
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Body" }],
      },
    ],
  });
});

test("a collapsed cursor isolates the hard-break line on both sides", () => {
  const doc = paragraphWithBreaks([
    { type: "text", text: "Before" },
    { type: "hardBreak" },
    { type: "text", text: "Middle" },
    { type: "hardBreak" },
    { type: "text", text: "After" },
  ]);

  assert.deepEqual(applyHeadingToSelection(doc, 10, 10, 4).doc, {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Before" }],
      },
      {
        type: "heading",
        attrs: { level: 4 },
        content: [{ type: "text", text: "Middle" }],
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "After" }],
      },
    ],
  });
});

test("ordinary paragraphs remain unchanged before the heading command runs", () => {
  const doc = paragraphWithBreaks([{ type: "text", text: "Normal paragraph" }]);
  let state = EditorState.create({ schema, doc });
  state = state.apply(
    state.tr.setSelection(TextSelection.create(state.doc, 2, 8)),
  );
  const transaction = state.tr;

  assert.equal(setVisualParagraph(transaction), true);
  assert.equal(transaction.docChanged, false);
  assert.deepEqual(transaction.doc.toJSON(), doc.toJSON());
});

test("a collapsed cursor between consecutive breaks formats the empty line", () => {
  const doc = paragraphWithBreaks([
    { type: "text", text: "A" },
    { type: "hardBreak" },
    { type: "hardBreak" },
    { type: "text", text: "B" },
  ]);

  assert.deepEqual(applyHeadingToSelection(doc, 3, 3).doc, {
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: "A" }] },
      { type: "heading", attrs: { level: 2 } },
      { type: "paragraph", content: [{ type: "text", text: "B" }] },
    ],
  });
});

test("a selection crossing hard breaks formats every selected visual line only", () => {
  const doc = paragraphWithBreaks([
    { type: "text", text: "A" },
    { type: "hardBreak" },
    { type: "text", text: "B" },
    { type: "hardBreak" },
    { type: "text", text: "C" },
  ]);
  const b = textRange(doc, "B");
  const c = textRange(doc, "C");

  assert.deepEqual(applyHeadingToSelection(doc, b.from, c.to).doc, {
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: "A" }] },
      {
        type: "heading",
        attrs: { level: 2 },
        content: [{ type: "text", text: "B" }],
      },
      {
        type: "heading",
        attrs: { level: 2 },
        content: [{ type: "text", text: "C" }],
      },
    ],
  });
});

test("a multi-block selection leaves unselected visual lines as paragraphs", () => {
  const doc = schema.nodeFromJSON({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "A" },
          { type: "hardBreak" },
          { type: "text", text: "B" },
        ],
      },
      {
        type: "paragraph",
        content: [
          { type: "text", text: "C" },
          { type: "hardBreak" },
          { type: "text", text: "D" },
        ],
      },
    ],
  });
  const b = textRange(doc, "B");
  const c = textRange(doc, "C");

  assert.deepEqual(applyHeadingToSelection(doc, b.from, c.to).doc, {
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: "A" }] },
      {
        type: "heading",
        attrs: { level: 2 },
        content: [{ type: "text", text: "B" }],
      },
      {
        type: "heading",
        attrs: { level: 2 },
        content: [{ type: "text", text: "C" }],
      },
      { type: "paragraph", content: [{ type: "text", text: "D" }] },
    ],
  });
});

test("backward selections keep their anchor and head direction", () => {
  const doc = paragraphWithBreaks([
    { type: "text", text: "A" },
    { type: "hardBreak" },
    { type: "text", text: "B" },
    { type: "hardBreak" },
    { type: "text", text: "C" },
  ]);
  const b = textRange(doc, "B");
  const c = textRange(doc, "C");
  const { selection } = applyHeadingToSelection(doc, c.to, b.from);

  assert.ok(selection.anchor > selection.head);
});

test("heading commands refuse list items without changing or throwing", () => {
  const doc = schema.nodeFromJSON({
    type: "doc",
    content: [{
      type: "bulletList",
      content: [{
        type: "listItem",
        content: [{
          type: "paragraph",
          content: [
            { type: "text", text: "First" },
            { type: "hardBreak" },
            { type: "text", text: "Second" },
          ],
        }],
      }],
    }],
  });
  const second = textRange(doc, "Second");
  let state = EditorState.create({ schema, doc });
  state = state.apply(
    state.tr.setSelection(TextSelection.create(state.doc, second.from, second.to)),
  );
  const transaction = state.tr;

  assert.equal(toggleVisualHeading(transaction, 2), false);
  assert.equal(transaction.docChanged, false);
  assert.deepEqual(transaction.doc.toJSON(), doc.toJSON());
});

test("a node selection formats its whole textblock without splitting it", () => {
  const doc = paragraphWithBreaks([
    { type: "text", text: "First" },
    { type: "hardBreak" },
    { type: "text", text: "Second" },
  ]);
  let state = EditorState.create({ schema, doc });
  state = state.apply(
    state.tr.setSelection(NodeSelection.create(state.doc, 0)),
  );
  const transaction = state.tr;

  assert.equal(toggleVisualHeading(transaction, 3), true);
  assert.deepEqual(JSON.parse(JSON.stringify(transaction.doc.toJSON())), {
    type: "doc",
    content: [{
      type: "heading",
      attrs: { level: 3 },
      content: [
        { type: "text", text: "First" },
        { type: "hardBreak" },
        { type: "text", text: "Second" },
      ],
    }],
  });
});

test("a collapsed empty-line selection retains its stored marks", () => {
  const doc = paragraphWithBreaks([
    { type: "text", text: "A" },
    { type: "hardBreak" },
    { type: "hardBreak" },
    { type: "text", text: "B" },
  ]);
  let state = EditorState.create({ schema, doc });
  state = state.apply(
    state.tr
      .setSelection(TextSelection.create(state.doc, 3))
      .setStoredMarks([schema.marks.bold.create()]),
  );
  const transaction = state.tr;

  assert.equal(toggleVisualHeading(transaction, 2), true);
  assert.deepEqual(
    transaction.storedMarks?.map((mark) => mark.type.name),
    ["bold"],
  );
});

test("heading keyboard shortcuts use visual-line formatting and consume list shortcuts", () => {
  const editor = new Editor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3, 4] } }),
    ],
    content: {
      type: "doc",
      content: [{
        type: "paragraph",
        content: [
          { type: "text", text: "Body" },
          { type: "hardBreak" },
          { type: "text", text: "Target" },
        ],
      }],
    },
  });
  editor.commands.setTextSelection(textRange(editor.state.doc, "Target"));

  assert.equal(visualHeadingKeyboardShortcuts(editor)["Mod-Alt-2"](), true);
  assert.deepEqual(editor.getJSON().content.map((node) => node.type), [
    "paragraph",
    "heading",
  ]);
  editor.destroy();

  const listEditor = new Editor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3, 4] } }),
    ],
    content: {
      type: "doc",
      content: [{
        type: "bulletList",
        content: [{
          type: "listItem",
          content: [{
            type: "paragraph",
            content: [{ type: "text", text: "List item" }],
          }],
        }],
      }],
    },
  });
  const listBefore = listEditor.getJSON();

  assert.equal(visualHeadingKeyboardShortcuts(listEditor)["Mod-Alt-2"](), true);
  assert.deepEqual(listEditor.getJSON(), listBefore);
  listEditor.destroy();
});

test("Tiptap applies each H1-H4 command only to the selected hard-break line", () => {
  for (const level of [1, 2, 3, 4]) {
    const editor = new Editor({
      extensions: [
        StarterKit.configure({ heading: { levels: [1, 2, 3, 4] } }),
      ],
      content: {
        type: "doc",
        content: [{
          type: "paragraph",
          content: [
            { type: "text", text: "Body" },
            { type: "hardBreak" },
            { type: "hardBreak" },
            { type: "text", text: "Target" },
          ],
        }],
      },
    });

    editor.commands.setTextSelection({ from: 7, to: 13 });
    editor
      .chain()
      .command(toggleVisualHeadingCommand(level))
      .run();

    const result = JSON.parse(JSON.stringify(editor.getJSON()));
    assert.equal(result.content.length, 3);
    assert.equal(result.content[0].type, "paragraph");
    assert.equal(result.content[0].content[0].text, "Body");
    assert.equal(result.content[1].type, "paragraph");
    assert.equal(result.content[2].type, "heading");
    assert.equal(result.content[2].attrs.level, level);
    assert.equal(result.content[2].content[0].text, "Target");
    editor.destroy();
  }
});
