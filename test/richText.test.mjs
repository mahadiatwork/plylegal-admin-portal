import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  MAX_NOTE_CONTENT_BYTES,
  buildNoteFields,
  richTextToPlainText,
  sanitizeRichTextHtml,
  serializeNoteFields,
  validateNoteContent,
} from "../src/lib/richText.js";

test("rich note HTML keeps supported formatting and only safe alignment and links", () => {
  const result = buildNoteFields(`
    <div onclick="alert(1)">
      <h2 style="text-align: center; color: red">Heading</h2>
      <p style="text-align: justify; background-image: url(https://tracker.test)">
        <strong>Bold</strong> <em>italic</em> <u>underline</u> <mark>marked</mark>
      </p>
      <ol><li>First</li><li><a href="https://example.test/help" target="_self">Help</a></li></ol>
      <a href="javascript:alert(1)">Unsafe link</a>
      <img src="https://tracker.test/pixel.png" onerror="alert(1)">
      <script>alert(1)</script>
    </div>
  `);

  assert.equal(result.valid, true);
  assert.match(result.noteHtml, /<h2 style="text-align:\s*center">Heading<\/h2>/);
  assert.match(result.noteHtml, /<p style="text-align:\s*justify">/);
  assert.match(result.noteHtml, /<strong>Bold<\/strong>/);
  assert.match(result.noteHtml, /<ol><li>First<\/li>/);
  assert.match(
    result.noteHtml,
    /<a href="https:\/\/example\.test\/help" target="_blank" rel="noopener noreferrer">Help<\/a>/
  );
  assert.match(result.noteHtml, /Unsafe link/);
  assert.doesNotMatch(result.noteHtml, /javascript:|onclick|color:|background-image|<img|<script|alert\(1\)/);
  assert.equal(result.fields.contentFormat, "html");
  assert.equal(result.fields.content, result.noteText);
});

test("link schemes are restricted and transformed consistently", () => {
  const safe = sanitizeRichTextHtml(`
    <p>
      <a href="http://example.test">HTTP</a>
      <a href="mailto:team@example.test">Email</a>
      <a href="tel:+61234567890">Phone</a>
      <a href="//example.test/path">Protocol relative</a>
      <a href="/relative/path">Relative</a>
      <a href="data:text/html,bad">Data</a>
    </p>
  `);

  assert.equal((safe.match(/target="_blank"/g) || []).length, 3);
  assert.equal((safe.match(/rel="noopener noreferrer"/g) || []).length, 3);
  assert.doesNotMatch(safe, /href="(?:\/\/|\/relative|data:)/);
  assert.match(safe, /Protocol relative/);
  assert.match(safe, /Relative/);
  assert.match(safe, /Data/);
});

test("the strict schema rejects raw-text, SVG animation and form URI bypasses", () => {
  const safe = sanitizeRichTextHtml(`
    <textarea></textarea/><img src=x onerror="alert(1)">
    <svg><animate attributeName="href" values="#safe;javascript:alert(1)"></animate></svg>
    <form action="javascript:alert(1)"><button>Submit</button></form>
  `);

  assert.equal(safe, "");
});

test("plain text derivation preserves readable block and line boundaries", () => {
  assert.equal(
    richTextToPlainText("<h1>Title &amp; intro</h1><p>First<br>Second</p><ul><li>One</li><li>Two</li></ul>"),
    "Title & intro\nFirst\nSecond\nOne\nTwo"
  );
});

test("formatted-empty and oversized notes are rejected", () => {
  assert.deepEqual(validateNoteContent("<p><br></p><script>alert(1)</script>"), {
    valid: false,
    error: "Note text is required",
  });

  const oversized = "a".repeat(MAX_NOTE_CONTENT_BYTES + 1);
  assert.deepEqual(validateNoteContent(oversized), {
    valid: false,
    error: "Note content must be 100 KB or less",
  });
  assert.deepEqual(validateNoteContent(oversized, { format: "plain" }), {
    valid: false,
    error: "Note content must be 100 KB or less",
  });
  assert.deepEqual(validateNoteContent("<p>&#8203;&#xfeff;</p>"), {
    valid: false,
    error: "Note text is required",
  });
  assert.deepEqual(validateNoteContent("<p>\u034f\ufe0f</p>"), {
    valid: false,
    error: "Note text is required",
  });
  assert.deepEqual(validateNoteContent("\u034f\ufe0f", { format: "plain" }), {
    valid: false,
    error: "Note text is required",
  });
});

test("the editor supports every persisted heading and alignment option", async () => {
  const source = await readFile(
    new URL("../src/components/ui/rich-text.jsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /heading:\s*\{\s*levels:\s*\[1,\s*2,\s*3,\s*4\]\s*\}/);
  assert.match(source, /alignments:\s*\["left",\s*"center",\s*"right",\s*"justify"\]/);
  assert.match(source, /Heading \$\{level\}/);
  assert.match(source, /label="Justify"/);
  assert.match(source, /const VisualHeadingShortcuts = Extension\.create/);
  assert.match(source, /priority:\s*1_000/);
  assert.match(source, /VisualHeadingShortcuts,\s*Highlight/);
  assert.match(
    source,
    /focus\(\)[\s\S]*?command\(toggleVisualHeadingCommand\(level\)\)/,
  );
  assert.match(source, /disabled=\{headingDisabled\}/);
});

test("legacy plaintext is never inferred as HTML", () => {
  const serialized = serializeNoteFields({
    noteText: "<strong>Keep this literal</strong>",
    content: "ignored fallback",
  });

  assert.deepEqual(serialized, {
    noteText: "<strong>Keep this literal</strong>",
    content: "<strong>Keep this literal</strong>",
  });
  assert.equal("noteHtml" in serialized, false);

  const fields = buildNoteFields("<strong>Keep this literal</strong>", { format: "plain" });
  assert.deepEqual(fields.fields, {
    noteText: "<strong>Keep this literal</strong>",
    content: "<strong>Keep this literal</strong>",
  });
});

test("serialized rich notes are sanitized again and fall back to stored plaintext when invalid", () => {
  const rich = serializeNoteFields({
    noteHtml: '<p>Hello <strong>there</strong><img src="x" onerror="alert(1)"></p>',
    noteText: "stale",
    content: "stale",
    contentFormat: "html",
  });
  assert.deepEqual(rich, {
    noteHtml: "<p>Hello <strong>there</strong></p>",
    noteText: "Hello there",
    content: "Hello there",
    contentFormat: "html",
  });

  const fallback = serializeNoteFields({
    noteHtml: "<script>alert(1)</script>",
    noteText: "Safe fallback",
    contentFormat: "html",
  });
  assert.equal(fallback.noteHtml, undefined);
  assert.equal(fallback.contentFormat, undefined);
  assert.equal(fallback.noteText, "Safe fallback");
  assert.equal(fallback.content, "Safe fallback");
});
